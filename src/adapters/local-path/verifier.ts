/**
 * The filesystem implementation of {@link LocalPathVerifier} (D-0038).
 *
 * **Why this lives in cadenza, and in `adapters/`.** The layer table already
 * says where a filesystem read belongs: `src/adapters` is "the one layer that is
 * allowed I/O" (`test/architecture/import-boundaries.test.ts`), and cadenza
 * already reads the operator's disk there -- `adapters/toml-catalog/loader.ts`
 * opens the catalog files. What D-0026 section 2 makes an input is run identity,
 * session identity, wall-clock time, randomness, durability and retry; the
 * filesystem is not on that list and could not be, because a catalog *is* files.
 * The purity rule this belt must not break is the one that covers `domain/`,
 * `application/` and `ports/`, and nothing here is in them.
 *
 * The full argument, with the two rejected owners (rondo, and "nobody -- leave
 * the port empty"), is D-0038.
 *
 * **What the check is, in one line.** Resolve every symlink on the way to the
 * path and on the way to each allowed root, and require that the resolved path
 * is the resolved root or lies under it, component by component.
 *
 * **Symlinks are resolved, not refused**, and that is a decision rather than the
 * lazy reading of "is any component a symlink" in design doc section 3.1. An
 * operator whose checkouts live under a symlinked home directory, or on macOS
 * under `/var` (which is `/private/var`), has every path symlinked and no fault
 * to fix; refusing those would push them to widen `allowed_local_roots` until
 * the rule said nothing. What the section is naming is the *escape*, and the
 * escape is what is refused: a link that leaves the root is a refusal wherever
 * it sits in the path, and a link that stays inside changes nothing about
 * containment.
 *
 * **The window this does not close.** Between the answer and the clone, a
 * component can be replaced with a link pointing anywhere. Nothing that only
 * reads the filesystem can prevent that; see the port's own note. This is why
 * `verify` hands back the resolved path -- so a caller acts on what was checked
 * -- and why the sandbox that would actually close the window is the control
 * plane's (D-0026 section 2).
 */
import { accessSync, constants, realpathSync, statSync } from "node:fs";

import type { LocalPathSource } from "../../domain/clone-source.js";
import {
  AllowedRootUnusableError,
  LocalPathEscapesRootError,
  LocalPathMissingError,
  LocalPathNotADirectoryError,
  LocalPathUnreadableError,
} from "../../domain/errors.js";
import { nativePath } from "../../domain/python-path.js";
import type { LocalPathVerifier, VerifiedLocalPath } from "../../ports/path-verifier.js";

/** The `errno` code of a failed `node:fs` call, or null if it carries none. */
function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * `realpathSync`, with every failure mapped to a refusal that names a fix.
 *
 * `ENOENT` covers both "nothing is there" and "a link on the way dangles", and
 * the two are the same fault to the same person: the catalog names something
 * that is not on this machine. `ENOTDIR` is a component that exists and is a
 * file, which is a wrong path rather than an absent one. `ELOOP` and `ENAMETOOLONG`
 * are neither: something is there and cannot be examined, which is what
 * {@link LocalPathUnreadableError} is for, and so is every permission code.
 *
 * The default arm refuses too. An unmapped `errno` means the check did not run,
 * and a verifier that let an unrecognised failure through would be answering
 * "contained" on the strength of not having looked.
 */
function resolveOrRefuse(path: string, what: string, asRoot: boolean): string {
  try {
    // `.native`, and never the plain `realpathSync`. Node's JavaScript
    // implementation collapses `..` LEXICALLY before it resolves links, so for
    // `<root>/link/..` -- where `link` points out of the root -- it answers
    // `<root>` while the operating system answers the parent of the link's
    // TARGET. That is an escape: the check would accept a declared path that
    // every real caller of it resolves outside the roots. `.native` is
    // `realpath(3)`, which walks the path the way an open of it walks the path.
    // Found by review; the regression case is
    // "a `..` after a link out of the root is refused".
    return realpathSync.native(path);
  } catch (error) {
    const code = errorCode(error);
    const detail = code === null ? "the filesystem refused to resolve it" : `errno ${code}`;
    if (asRoot) {
      // Every failure on a root is one fault -- this layer's roots are not
      // usable -- so it gets one type. Which errno it was still reaches the
      // operator in the message; what it must not do is arrive looking like a
      // fault in the project whose path happened to be checked first.
      throw new AllowedRootUnusableError(`${what} ${path} could not be resolved: ${detail}`);
    }
    if (code === "ENOENT") {
      throw new LocalPathMissingError(`${what} ${path} does not exist, or a link to it dangles`);
    }
    if (code === "ENOTDIR") {
      throw new LocalPathNotADirectoryError(
        `${what} ${path} runs through a component that is not a directory`,
      );
    }
    throw new LocalPathUnreadableError(`${what} ${path} could not be examined: ${detail}`);
  }
}

/** The resolved path must be a directory a clone can be taken from. */
function requireReadableDirectory(real: string, declared: string, what: string): void {
  let isDirectory: boolean;
  try {
    isDirectory = statSync(real).isDirectory();
  } catch (error) {
    const code = errorCode(error);
    throw new LocalPathUnreadableError(
      `${what} ${declared} could not be examined: errno ${code ?? "unknown"}`,
    );
  }
  if (!isDirectory) {
    throw new LocalPathNotADirectoryError(`${what} ${declared} is not a directory`);
  }
  try {
    // Read AND execute: a directory that cannot be listed and a directory that
    // cannot be descended into both fail a clone, and asking for one of the two
    // would let the other through.
    accessSync(real, constants.R_OK | constants.X_OK);
  } catch {
    throw new LocalPathUnreadableError(
      `${what} ${declared} is not readable by this process (read and execute are both required)`,
    );
  }
}

/**
 * The lexical containment `parseLocalPath` already applied, restated here.
 *
 * Not redundant, for the reason `parseLocalPath` gives for restating
 * `LayerDocument`'s own invariant: this class is callable on its own, and a
 * caller that built a `LocalPathSource` by hand has been through no such check.
 * It runs **before any filesystem call**, so a path that climbs out of the roots
 * is refused without being probed. That ordering is deliberate: probing tells
 * the operator's catalog whether a path outside its roots exists, which is an
 * answer a catalog is not entitled to.
 *
 * `normpath` first, never a resolving call: without it a raw `/root/a/../../etc`
 * would be compared component by component with `..` still in it, and a prefix
 * test would call it contained.
 */
function lexicallyContained(path: string, roots: readonly string[]): boolean {
  const normalised = nativePath.normpath(path);
  return roots.some((root) => nativePath.isRelativeTo(normalised, nativePath.normpath(root)));
}

/**
 * Verify a `local_path` against the roots of the layer that declared it.
 *
 * Stateless, and deliberately: the roots are layer-local (design doc section
 * 3.3), so they belong to the call and not to the object. One instance is
 * therefore usable for every layer without carrying one layer's authority into
 * another's.
 */
export class FilesystemLocalPathVerifier implements LocalPathVerifier {
  /**
   * The order of the checks is fixed here and is observable, exactly as
   * `humanDecisionRecord` fixes its own:
   *
   * 1. the caller's own arguments (a `RangeError`, never a refusal: a broken
   *    argument is a bug in cadenza's caller, not a fault in the operator's
   *    catalog, and `layerDocument` draws the same line);
   * 2. lexical containment, which touches nothing;
   * 3. the roots, so a misconfigured layer is named before a project is blamed
   *    for it;
   * 4. the path itself;
   * 5. real containment, which is the answer the port exists for.
   */
  verify(source: LocalPathSource, allowedLocalRoots: readonly string[]): VerifiedLocalPath {
    const declared = requireLocalPath(source);
    const roots = requireRoots(allowedLocalRoots);

    if (!lexicallyContained(declared, roots)) {
      throw new LocalPathEscapesRootError(
        `path ${declared} is lexically outside every allowed local root: ${roots.join(", ")}`,
      );
    }

    // Every root, not merely until one matches. A root that cannot be resolved
    // is a fault to report even when another root would have granted the path:
    // a silently dropped root narrows what the layer declared, and the next path
    // -- the one that needed exactly that root -- would be refused with the real
    // fault never named. See `AllowedRootUnusableError`.
    const realRoots = roots.map((root) => {
      const real = resolveOrRefuse(root, "allowed local root", true);
      requireRootDirectory(real, root);
      return real;
    });

    const real = resolveOrRefuse(declared, "path", false);
    requireReadableDirectory(real, declared, "path");

    const root = realRoots.find((candidate) => nativePath.isRelativeTo(real, candidate));
    if (root === undefined) {
      throw new LocalPathEscapesRootError(
        `path ${declared} resolves to ${real}, which is outside every allowed local root: ` +
          `${realRoots.join(", ")}`,
      );
    }

    return Object.freeze({ declared, real, root });
  }
}

/** A root failing its own check is a layer fault, and says so rather than reusing the path's. */
function requireRootDirectory(real: string, declared: string): void {
  try {
    if (!statSync(real).isDirectory()) {
      throw new AllowedRootUnusableError(`allowed local root ${declared} is not a directory`);
    }
    // Execute only, where the path itself is asked for read AND execute, and
    // the difference is not an oversight. What a root is for is being descended
    // through, so a mode-711 directory -- traversable, not listable -- is a
    // perfectly good root and refusing it would be this check inventing a rule.
    // What must not pass is a root nothing can enter: `realpathSync` and
    // `statSync` both succeed on a mode-000 directory, because neither needs
    // access to its contents, so without this the documented "an unusable root
    // fails the whole call" was untrue exactly when a second root would have
    // granted the path anyway. Found by review.
    accessSync(real, constants.X_OK);
  } catch (error) {
    if (error instanceof AllowedRootUnusableError) {
      throw error;
    }
    const code = errorCode(error);
    throw new AllowedRootUnusableError(
      `allowed local root ${declared} could not be entered: errno ${code ?? "unknown"}`,
    );
  }
}

/**
 * The source, checked as a value rather than trusted as a type.
 *
 * `RangeError`, as `layerDocument` raises for a relative `baseDir`: a caller
 * that passed a `git_url` here, or a path that is not absolute, has a bug of its
 * own, and dressing it as a catalog refusal would send an operator to edit a
 * file that is correct. `isPathlibAbsolute` and not `isAbsolute`, because the
 * two disagree on Windows and the drive-relative `\srv` is the one that must not
 * pass: it would be completed against a drive this process happened to be on.
 */
function requireLocalPath(candidate: unknown): string {
  if (candidate === null || typeof candidate !== "object") {
    throw new RangeError("verify() takes a clone source of kind 'local_path'");
  }
  const source = candidate as { kind?: unknown; path?: unknown };
  if (source.kind !== "local_path") {
    throw new RangeError("verify() takes a clone source of kind 'local_path'");
  }
  const path: unknown = source.path;
  if (typeof path !== "string" || path === "") {
    throw new RangeError("a local_path source must carry a non-empty path");
  }
  if (!nativePath.isPathlibAbsolute(path)) {
    throw new RangeError(
      `a local_path must be absolute before it is verified, got ${path}; ` +
        "parseCloneSource anchors it to the layer that declared it",
    );
  }
  return path;
}

/**
 * The roots, checked the same way and for a sharper reason.
 *
 * An empty list is refused rather than read as "no restriction". That reading is
 * the one catastrophic default available here, it is the same rule
 * `parseLocalPath` already applies to a layer that declares a `local_path`
 * without roots, and a verifier that answered "contained" against no root at all
 * would be a check that passes everything while looking like a check.
 */
function requireRoots(allowedLocalRoots: unknown): readonly string[] {
  if (!Array.isArray(allowedLocalRoots) || allowedLocalRoots.length === 0) {
    throw new RangeError(
      "verifying a local_path requires the allowed_local_roots of the layer that declared it; " +
        "an empty list authorises nothing and is not a wildcard",
    );
  }
  for (const root of allowedLocalRoots) {
    if (typeof root !== "string" || root === "") {
      throw new RangeError("every allowed local root must be a non-empty string");
    }
    if (!nativePath.isPathlibAbsolute(root)) {
      throw new RangeError(
        `every allowed local root must be absolute, got ${root}; ` +
          "a relative root would be completed against the process CWD",
      );
    }
  }
  return allowedLocalRoots as readonly string[];
}
