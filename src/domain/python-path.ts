/**
 * `os.path` and `pathlib`, for the parts a catalog's `local_path` depends on.
 *
 * **Why this is not `node:path`.** A `local_path` is normalised lexically and
 * the result is stored as `LocalPathSource.path`, which goes into
 * `config_digest` -- a persisted value (design doc section 4). So the
 * normalisation is a byte-level contract with CPython, not a convenience, and
 * `node:path` disagrees with `os.path` in ways that stay invisible until a
 * digest changes under a run that already happened:
 *
 *  - `posixpath.normpath("/a/b/")` is `"/a/b"`; `path.posix.normalize` keeps the
 *    trailing slash.
 *  - `posixpath.normpath("//a/b")` is `"//a/b"` -- POSIX gives exactly two
 *    leading slashes an implementation-defined meaning, so CPython preserves
 *    them and collapses three or more. `path.posix.normalize` collapses two.
 *  - `ntpath.normpath("//a/../b")` is `"\\\\a\\..\\b"`: the `..` sits in a UNC
 *    path's *share* position, which is part of the anchor and not a component,
 *    so it is not collapsed. `path.win32.normalize` collapses it.
 *
 * **Why both flavours.** The TypeScript suite runs on `windows-latest` as well
 * (`.github/workflows/typescript.yml`), and Python's two answers to "is this
 * absolute?" *disagree with each other there* -- which the source relies on:
 * `ntpath.isabs("/srv")` is true (no drive required), while
 * `PureWindowsPath("/srv").is_absolute()` is false (a drive-relative path is not
 * absolute). `_normalise_path` asks the first; `LayerDocument` and
 * `_parse_local_path` ask the second. `tests/test_toml_loader.py` pins the
 * difference on purpose, and `tests/support.py` builds its absolute paths from a
 * platform anchor because of it. Collapsing the two into one predicate would
 * make a drive-less path either refused everywhere or accepted everywhere, and
 * the source is neither.
 *
 * Ported against **CPython 3.12**, the version
 * `parity/source-inventory.manifest.json` records the suite baseline at. That
 * matters more than it looks: 3.12 rewrote `ntpath` around `splitroot` and moved
 * `normpath` into C, and the older pure-Python `ntpath.normpath` gives different
 * answers for three or more leading separators.
 */
import { homedir } from "node:os";

/** The subset of `os.path` and `pathlib` that the domain reaches for. */
export interface PathFlavour {
  readonly name: "posix" | "windows";
  /** `os.path.isabs`. */
  isAbsolute(path: string): boolean;
  /** `pathlib.PurePath.is_absolute`, which on Windows also requires a drive. */
  isPathlibAbsolute(path: string): boolean;
  /** `os.path.normpath`. */
  normpath(path: string): string;
  /** `os.path.join`, for the two-argument case the domain uses. */
  join(base: string, path: string): string;
  /** `pathlib.PurePath.is_relative_to`, component-wise and case-aware. */
  isRelativeTo(path: string, other: string): boolean;
  /** `os.path.expanduser`. */
  expanduser(path: string): string;
}

/** `path` split into `pathlib`'s parts: the anchor, then one entry per component. */
function partsOf(anchor: string, rest: string, separators: RegExp): string[] {
  const parts = anchor === "" ? [] : [anchor];
  for (const component of rest.split(separators)) {
    if (component !== "") {
      parts.push(component);
    }
  }
  return parts;
}

function isPrefix(candidate: readonly string[], root: readonly string[]): boolean {
  return root.length <= candidate.length && root.every((part, index) => part === candidate[index]);
}

// --- POSIX ----------------------------------------------------------------

/** How many leading slashes are significant: two, or one, or none. */
function posixInitialSlashes(path: string): number {
  if (!path.startsWith("/")) {
    return 0;
  }
  // POSIX allows one or two initial slashes but treats three or more as one.
  return path.startsWith("//") && !path.startsWith("///") ? 2 : 1;
}

function posixNormpath(path: string): string {
  if (path === "") {
    return ".";
  }
  const initialSlashes = posixInitialSlashes(path);
  const kept: string[] = [];
  for (const component of path.split("/")) {
    if (component === "" || component === ".") {
      continue;
    }
    if (
      component !== ".." ||
      (initialSlashes === 0 && kept.length === 0) ||
      kept[kept.length - 1] === ".."
    ) {
      kept.push(component);
    } else if (kept.length > 0) {
      kept.pop();
    }
  }
  const joined = "/".repeat(initialSlashes) + kept.join("/");
  return joined === "" ? "." : joined;
}

function posixJoin(base: string, path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  if (base === "" || base.endsWith("/")) {
    return base + path;
  }
  return `${base}/${path}`;
}

/**
 * `posixpath.expanduser`, minus the `~user` lookup.
 *
 * CPython resolves `~user` through the password database and, **when the user is
 * unknown, returns the path unchanged**. Node has no password database, so
 * `~user` always takes that second branch here: identical to CPython for an
 * unknown user, divergent for a known one. Recorded as an inherited limitation
 * in this belt's ledgers rather than guessed at, because a guess would put a
 * wrong absolute path into a persisted digest. A bare `~` -- the spelling
 * `config/projects.local.toml.example` actually documents -- is exact.
 */
function posixExpanduser(path: string): string {
  if (!path.startsWith("~")) {
    return path;
  }
  const slash = path.indexOf("/", 1);
  const end = slash < 0 ? path.length : slash;
  if (end !== 1) {
    return path;
  }
  // CPython strips trailing slashes from the home directory, so that "~" + "/x"
  // cannot become "//x" -- which normpath would then preserve as a two-slash
  // path with a different meaning.
  const home = (process.env.HOME ?? homedir()).replace(/\/+$/, "");
  const expanded = home + path.slice(end);
  return expanded === "" ? "/" : expanded;
}

function posixParts(path: string): string[] {
  const slashes = posixInitialSlashes(path);
  return partsOf("/".repeat(slashes), path.slice(slashes), /\//);
}

export const posix: PathFlavour = Object.freeze<PathFlavour>({
  name: "posix",
  isAbsolute: (path) => path.startsWith("/"),
  isPathlibAbsolute: (path) => path.startsWith("/"),
  normpath: posixNormpath,
  join: posixJoin,
  expanduser: posixExpanduser,
  isRelativeTo: (path, other) => isPrefix(posixParts(path), posixParts(other)),
});

// --- Windows --------------------------------------------------------------

const UNC_PREFIX = "\\\\?\\UNC\\";

/**
 * `ntpath.splitroot` (CPython 3.12): the drive, the root, and the rest.
 *
 * The drive is a letter (`C:`) or a whole UNC anchor (`\\server\share`), and a
 * device path (`\\?\...`, `\\.\...`) takes the same branch as a UNC one.
 */
function windowsSplitRoot(path: string): [drive: string, root: string, tail: string] {
  const normalised = path.split("/").join("\\");
  if (normalised.startsWith("\\")) {
    if (normalised.startsWith("\\\\")) {
      const start = normalised.slice(0, 8).toUpperCase() === UNC_PREFIX ? 8 : 2;
      const server = normalised.indexOf("\\", start);
      if (server === -1) {
        return [path, "", ""];
      }
      const share = normalised.indexOf("\\", server + 1);
      if (share === -1) {
        return [path, "", ""];
      }
      return [path.slice(0, share), path.slice(share, share + 1), path.slice(share + 1)];
    }
    return ["", path.slice(0, 1), path.slice(1)];
  }
  if (normalised.slice(1, 2) === ":") {
    if (normalised.slice(2, 3) === "\\") {
      return [path.slice(0, 2), path.slice(2, 3), path.slice(3)];
    }
    return [path.slice(0, 2), "", path.slice(2)];
  }
  return ["", "", path];
}

/** `ntpath.normpath` (CPython 3.12's C implementation). */
function windowsNormpath(path: string): string {
  const [rawDrive, rawRoot, rawTail] = windowsSplitRoot(path);
  const drive = rawDrive.split("/").join("\\");
  const root = rawRoot.split("/").join("\\");
  const kept: string[] = [];
  for (const component of rawTail.split("/").join("\\").split("\\")) {
    if (component === "" || component === ".") {
      continue;
    }
    if (component !== "..") {
      kept.push(component);
    } else if (kept.length > 0 && kept[kept.length - 1] !== "..") {
      kept.pop();
    } else if (root === "") {
      // No root to be stopped by, so the `..` survives as a component.
      kept.push(component);
    }
  }
  const joined = drive + root + kept.join("\\");
  // The `.` fallback is only for a path with neither a drive nor a root:
  // `ntpath.normpath("C:.")` is `"C:"`, not `"C:."`.
  return joined === "" ? "." : joined;
}

function windowsJoin(base: string, path: string): string {
  // `ntpath.join` is not `a + sep + b`: a drive on the right can displace the
  // left operand entirely, the same drive in a different case is adopted rather
  // than duplicated, and a UNC anchor with no root still needs a separator
  // before a relative tail. Reproduced rather than approximated, because the
  // result is anchored into a persisted path.
  const separators = "\\/";
  const [baseDrive, baseRoot, basePath] = windowsSplitRoot(base);
  let drive = baseDrive;
  const root = baseRoot;
  let tail = basePath;
  const [otherDrive, otherRoot, otherPath] = windowsSplitRoot(path);
  if (otherRoot !== "") {
    if (otherDrive !== "" || drive === "") {
      drive = otherDrive;
    }
    return finishWindowsJoin(drive, otherRoot, otherPath, separators);
  }
  if (otherDrive !== "" && otherDrive !== drive) {
    if (otherDrive.toLowerCase() !== drive.toLowerCase()) {
      return finishWindowsJoin(otherDrive, otherRoot, otherPath, separators);
    }
    drive = otherDrive;
  }
  const last = tail.slice(-1);
  if (tail !== "" && !separators.includes(last)) {
    tail += "\\";
  }
  return finishWindowsJoin(drive, root, tail + otherPath, separators);
}

/** The tail of `ntpath.join`: a UNC drive with no root needs a separator. */
function finishWindowsJoin(drive: string, root: string, tail: string, separators: string): string {
  const last = drive.slice(-1);
  if (tail !== "" && root === "" && drive !== "" && last !== ":" && !separators.includes(last)) {
    return `${drive}\\${tail}`;
  }
  return drive + root + tail;
}

/**
 * `ntpath.expanduser`, minus the `~user` lookup, for the reason
 * {@link posixExpanduser} records.
 */
function windowsExpanduser(path: string): string {
  if (!path.startsWith("~")) {
    return path;
  }
  let end = 1;
  while (end < path.length && path[end] !== "\\" && path[end] !== "/") {
    end += 1;
  }
  if (end !== 1) {
    return path;
  }
  const profile = process.env.USERPROFILE;
  const homePath = process.env.HOMEPATH;
  if (profile !== undefined) {
    return profile + path.slice(end);
  }
  if (homePath === undefined) {
    return path;
  }
  return windowsJoin(process.env.HOMEDRIVE ?? "", homePath) + path.slice(end);
}

/**
 * The root `pathlib` gives a UNC anchor that `splitroot` reports none for.
 *
 * `PurePath._parse_path` puts a root back on a drive of the shape
 * `\\\\server\\share` -- four separator-delimited pieces, the third of which is
 * not `?` or `.` -- and on the `\\\\?\\UNC\\server\\share` spelling of the same
 * thing. It is the difference between `PureWindowsPath("//s/sh").is_absolute()`
 * (true) and `PureWindowsPath("//").is_absolute()` (false), and between the
 * anchors the two produce, so the same rule has to serve both callers below.
 */
function windowsPathlibRoot(drive: string, root: string): string {
  if (root !== "") {
    return root.split("/").join("\\");
  }
  const normalised = drive.split("/").join("\\");
  if (!normalised.startsWith("\\") || normalised.endsWith("\\")) {
    return "";
  }
  const pieces = normalised.split("\\");
  // CPython spells this `drv_parts[2] not in '?.'`, and `in` on a `str` is a
  // SUBSTRING test, not a membership test over two characters: the empty piece
  // -- which `///C:` produces -- is "in" `'?.'` and so is `'?.'` itself. Written
  // as `!== "?" && !== "."` this accepts `///C:` as absolute, which CPython does
  // not.
  const named = (piece: string | undefined) => piece !== undefined && !"?.".includes(piece);
  if (pieces.length === 4 && named(pieces[2])) {
    return "\\";
  }
  if (pieces.length === 6 && named(pieces[3])) {
    return "\\";
  }
  return "";
}

/**
 * `pathlib`'s parts, lower-cased.
 *
 * `PureWindowsPath` compares case-insensitively -- `C:/A` *is* relative to
 * `c:/a` -- and the anchor of a UNC path carries a trailing separator even when
 * `splitroot` reports no root, so it is restored here rather than left to differ
 * between the two operands of a prefix test.
 */
function windowsParts(path: string): string[] {
  const [drive, root, tail] = windowsSplitRoot(path);
  const anchor = drive.split("/").join("\\") + windowsPathlibRoot(drive, root);
  return partsOf(anchor, tail, /[\\/]/).map((part) => part.toLowerCase());
}

export const windows: PathFlavour = Object.freeze<PathFlavour>({
  name: "windows",
  // `ntpath.isabs`: a leading separator is enough, with no drive required.
  isAbsolute(path) {
    const head = path.slice(0, 3).split("/").join("\\");
    return head.startsWith("\\") || head.slice(1, 3) === ":\\";
  },
  // `PureWindowsPath.is_absolute`: a drive AND a root. "/srv" has a root and no
  // drive, so it is drive-relative and therefore not absolute.
  isPathlibAbsolute(path) {
    const [drive, root] = windowsSplitRoot(path);
    return drive !== "" && windowsPathlibRoot(drive, root) !== "";
  },
  normpath: windowsNormpath,
  join: windowsJoin,
  expanduser: windowsExpanduser,
  isRelativeTo: (path, other) => isPrefix(windowsParts(path), windowsParts(other)),
});

/**
 * The flavour of the platform this process is running on.
 *
 * Both flavours are frozen at their definitions, which is what makes this safe
 * to export. `parseCloneSource` reads `nativePath.normpath` and
 * `nativePath.isRelativeTo` for allowed-root containment and for the path it
 * then persists through `config_digest`, so a caller able to replace either
 * method could admit a path outside the configured roots, or change a digest,
 * for every catalog loaded afterwards. Raised by review.
 */
export const nativePath: PathFlavour = process.platform === "win32" ? windows : posix;
