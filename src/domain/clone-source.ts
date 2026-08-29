/**
 * `CloneSource` -- the tagged union of where a project's code comes from.
 *
 * Design doc section 3.1. URL, local path and "create it fresh" carry different
 * validation, different reproducibility and different trust boundaries, so
 * `kind` is always present; nothing here touches a filesystem or a network.
 *
 * **Scope of this file.** The union and its canonical form came over with the
 * digest pilot. `parseCloneSource` was added by the composition belt, because
 * `composeCatalog` calls it and a composer that cannot read a `[...source]`
 * table is not a composer. Its **own** 57 source cases in
 * `tests/test_clone_source.py` are NOT ported here: this belt's ledgers cover
 * `tests/test_compose.py`, `tests/test_resolve.py` and
 * `tests/test_toml_loader.py`, and the validation below is exercised only as far
 * as those files reach it. That gap is stated in each ledger's
 * `inherited_limitations` rather than left implicit, and the belt that ports
 * `tests/test_clone_source.py` is what closes it.
 */

import { InvalidCloneSourceError, MissingFieldError, UnknownFieldError } from "./errors.js";
import { frozenSet } from "./frozen.js";
import { nativePath } from "./python-path.js";
import { isControlCharacter, isPythonSpace, pythonRepr, pythonTypeName } from "./python-text.js";
import { hostname, port, UrlValueError, urlsplit, userinfo } from "./python-urlsplit.js";

/** Clone from a remote over an authenticated transport. */
export interface GitUrlSource {
  readonly kind: "git_url";
  readonly url: string;
}

/** Clone from a lexically normalised absolute path on the operator's machine. */
export interface LocalPathSource {
  readonly kind: "local_path";
  readonly path: string;
}

/** No source exists; the run-side adapter initialises one. */
export interface NewRepositorySource {
  readonly kind: "new";
}

export type CloneSource = GitUrlSource | LocalPathSource | NewRepositorySource;

/**
 * The three factories freeze what they return, for the reason `project` does:
 * the source is part of a persisted digest, and `readonly` is a claim the type
 * checker makes rather than one the runtime keeps. Python's frozen dataclasses
 * keep it at runtime.
 */
export function gitUrlSource(url: string): GitUrlSource {
  return Object.freeze({ kind: "git_url", url });
}

export function localPathSource(path: string): LocalPathSource {
  return Object.freeze({ kind: "local_path", path });
}

export function newRepositorySource(): NewRepositorySource {
  return Object.freeze({ kind: "new" });
}

/**
 * A frozen copy of `source`, whatever the caller handed over.
 *
 * The factories above freeze what *they* return, and that is not enough on its
 * own: `CloneSource` is a structural type, so `{ kind: "git_url", url }` written
 * as a plain object literal is a perfectly valid one and is not frozen. A caller
 * can pass such an object, keep the reference, and mutate `url` afterwards --
 * and `configDigest` would then report a different value for a project nobody
 * edited. Python's frozen dataclasses have no such route.
 *
 * Rebuilt through the factories rather than spread, so the copy carries exactly
 * the fields its `kind` defines. The `switch` is exhaustive: a member added
 * later fails to compile here rather than falling through to a shared reference.
 */
export function snapshotSource(source: CloneSource): CloneSource {
  switch (source.kind) {
    case "git_url":
      return gitUrlSource(source.url);
    case "local_path":
      return localPathSource(source.path);
    case "new":
      return newRepositorySource();
  }
}

/**
 * The union member as the digest payload holds it.
 *
 * The **tag travels with the value**, which is what stops a URL and a path that
 * happen to spell the same string from sharing a digest. In Python `kind` is a
 * `ClassVar` -- not a dataclass field, so it is absent from equality and
 * present in `to_canonical` -- while here it is the discriminant. The observable
 * result, which is all the digest sees, is identical.
 */
export function toCanonical(source: CloneSource): Readonly<Record<string, string>> {
  switch (source.kind) {
    case "git_url":
      return { kind: source.kind, url: source.url };
    case "local_path":
      return { kind: source.kind, path: source.path };
    case "new":
      return { kind: source.kind };
  }
}

// --- parsing --------------------------------------------------------------

/** Transports a clone may use. A clone is code execution, so it is authenticated. */
export const ALLOWED_URL_SCHEMES: ReadonlySet<string> = frozenSet(["https", "ssh"]);

/**
 * Refused with the reason, not a generic "bad scheme": the operator needs to
 * know why the transport is unacceptable, since each of these has a fix.
 */
const REFUSED_SCHEMES: ReadonlyMap<string, string> = new Map([
  ["http", "'http' is plaintext and a clone is code execution; use 'https' or 'ssh'"],
  [
    "git",
    "the 'git' protocol is unauthenticated and a clone is code execution; use 'https' or 'ssh'",
  ],
  [
    "file",
    "'file' is a filesystem path wearing a URL; use kind = \"local_path\", " +
      "which carries the containment rules",
  ],
]);

const FIELDS_BY_KIND: ReadonlyMap<string, readonly string[]> = new Map([
  ["git_url", ["kind", "url"]],
  ["local_path", ["kind", "path"]],
  ["new", ["kind"]],
]);

/** A parsed TOML table, as the composer hands it over: keys to unknown values. */
export type RawTable = { readonly [key: string]: unknown };

function requireString(table: RawTable, key: string, kind: string, location: string): string {
  if (!Object.hasOwn(table, key)) {
    throw new MissingFieldError(
      `clone source of kind ${pythonRepr(kind)} requires the key ${pythonRepr(key)}`,
      location,
    );
  }
  const value = table[key];
  if (typeof value !== "string") {
    throw new InvalidCloneSourceError(
      `${key} must be a string, got ${pythonTypeName(value)}`,
      location,
    );
  }
  return value;
}

function rejectUnknownFields(table: RawTable, kind: string, location: string): void {
  const allowed = FIELDS_BY_KIND.get(kind) as readonly string[];
  const unknown = Object.keys(table)
    .filter((key) => !allowed.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new UnknownFieldError(
      `clone source of kind ${pythonRepr(kind)} does not accept ` +
        `${unknown.map(pythonRepr).join(", ")}; ` +
        `accepted keys are ${[...allowed].sort().join(", ")}`,
      location,
    );
  }
}

function parseGitUrl(table: RawTable, location: string): GitUrlSource {
  const url = requireString(table, "url", "git_url", location);
  for (const character of url) {
    if (isPythonSpace(character) || isControlCharacter(character)) {
      throw new InvalidCloneSourceError(
        "url must not contain whitespace or control characters",
        location,
      );
    }
  }
  let scheme: string;
  let username: string | null;
  let password: string | null;
  let host: string | null;
  try {
    // `urlsplit` itself refuses inputs a hostile catalog can reach without any
    // whitespace or control character -- an unbalanced IPv6 bracket, or a netloc
    // that changes under NFKC normalisation. An unhandled failure here would
    // escape as an untyped error naming neither the file nor the key, which
    // design doc section 7 forbids.
    const parts = urlsplit(url);
    scheme = parts.scheme.toLowerCase();
    const info = userinfo(parts);
    username = info.username;
    password = info.password;
    host = hostname(parts);
    // Reading the port is what validates it: `urlsplit` carries "abc" or 99999
    // happily until something asks, so an unread port would let a catalog
    // compose and the clone fail -- the ordering this validation fixes.
    port(parts);
  } catch (error) {
    if (!(error instanceof UrlValueError)) {
      throw error;
    }
    throw new InvalidCloneSourceError(
      `url ${pythonRepr(url)} is not parseable: ${error.message}`,
      location,
    );
  }
  if (scheme === "") {
    // scp-style "git@host:org/repo.git" is refused rather than rewritten:
    // accepting both spellings would mean one source with two digests.
    throw new InvalidCloneSourceError(
      `url ${pythonRepr(url)} has no scheme; write it as ssh://git@host/org/repo.git`,
      location,
    );
  }
  const refusal = REFUSED_SCHEMES.get(scheme);
  if (refusal !== undefined) {
    throw new InvalidCloneSourceError(`url refused: ${refusal}`, location);
  }
  if (!ALLOWED_URL_SCHEMES.has(scheme)) {
    throw new InvalidCloneSourceError(
      `url scheme ${pythonRepr(scheme)} is not allowed; expected one of ` +
        `${[...ALLOWED_URL_SCHEMES].sort().join(", ")}`,
      location,
    );
  }
  if (password !== null) {
    throw new InvalidCloneSourceError(
      "url must not embed a password; a password in a catalog file is a leaked password",
      location,
    );
  }
  if (username !== null && !(scheme === "ssh" && username === "git")) {
    throw new InvalidCloneSourceError(
      "url must not embed credentials; the only accepted userinfo is " +
        `the bare 'git@' of an ssh url, got ${pythonRepr(username)}`,
      location,
    );
  }
  if (host === null || host === "") {
    throw new InvalidCloneSourceError(`url ${pythonRepr(url)} has no host`, location);
  }
  return gitUrlSource(url);
}

function normalisePath(raw: string, baseDir: string): string {
  // `expanduser` is the one place the domain reads outside its arguments: it
  // consults the home directory. It resolves no symlink and stats nothing.
  let expanded = nativePath.expanduser(raw);
  if (!nativePath.isAbsolute(expanded)) {
    expanded = nativePath.join(baseDir, expanded);
  }
  // `normpath`, never a resolving call: resolving would touch the filesystem,
  // and a catalog has to stay checkable in CI on a machine that has none of
  // these directories.
  return nativePath.normpath(expanded);
}

function parseLocalPath(
  table: RawTable,
  baseDir: string,
  allowedLocalRoots: readonly string[],
  location: string,
): LocalPathSource {
  const raw = requireString(table, "path", "local_path", location);
  if (raw === "") {
    throw new InvalidCloneSourceError("path must not be empty", location);
  }
  for (const character of raw) {
    if (isControlCharacter(character)) {
      throw new InvalidCloneSourceError(
        "path must not contain NUL bytes or control characters",
        location,
      );
    }
  }
  // `isPathlibAbsolute`, not `isAbsolute`: on Windows the two disagree, and the
  // source asks pathlib here and `os.path` in `normalisePath`. See
  // `src/domain/python-path.ts`.
  if (!nativePath.isPathlibAbsolute(baseDir)) {
    // Anchoring to a relative base_dir would leave the anchored path relative,
    // so a run-side consumer would finish the job against its own CWD -- design
    // doc section 3.1's rule, defeated one level up. `LayerDocument` enforces
    // the same invariant; this repeats it because `parseCloneSource` is callable
    // on its own.
    throw new InvalidCloneSourceError(
      `base_dir must be absolute to anchor a local_path, got ${pythonRepr(baseDir)}`,
      location,
    );
  }
  if (allowedLocalRoots.length === 0) {
    throw new InvalidCloneSourceError(
      "a clone source of kind 'local_path' requires the layer that " +
        "declares it to declare its own catalog.allowed_local_roots",
      location,
    );
  }
  const normalised = normalisePath(raw, baseDir);
  const roots = allowedLocalRoots.map((root) => normalisePath(root, baseDir));
  for (const root of roots) {
    if (nativePath.isRelativeTo(normalised, root)) {
      return localPathSource(normalised);
    }
  }
  throw new InvalidCloneSourceError(
    `path ${normalised} is outside the allowed local roots of this layer: ${roots.join(", ")}`,
    location,
  );
}

/**
 * Parse one `[...source]` table into a `CloneSource`, or refuse.
 *
 * `baseDir` is the directory of the layer file that stated this source, and
 * `allowedLocalRoots` are that same layer's roots: both are layer-local so that
 * a shared tracked file cannot authorise a directory on somebody else's machine.
 */
export function parseCloneSource(
  table: RawTable,
  baseDir: string,
  allowedLocalRoots: readonly string[],
  location: string,
): CloneSource {
  if (!Object.hasOwn(table, "kind")) {
    throw new MissingFieldError("clone source table requires the key 'kind'", location);
  }
  const kind = table.kind;
  if (typeof kind !== "string") {
    throw new InvalidCloneSourceError(
      `kind must be a string, got ${pythonTypeName(kind)}`,
      location,
    );
  }
  if (!FIELDS_BY_KIND.has(kind)) {
    throw new InvalidCloneSourceError(
      `unknown clone source kind ${pythonRepr(kind)}; expected one of ` +
        `${[...FIELDS_BY_KIND.keys()].sort().join(", ")}`,
      location,
    );
  }
  rejectUnknownFields(table, kind, location);
  if (kind === "git_url") {
    return parseGitUrl(table, location);
  }
  if (kind === "local_path") {
    return parseLocalPath(table, baseDir, allowedLocalRoots, location);
  }
  return newRepositorySource();
}
