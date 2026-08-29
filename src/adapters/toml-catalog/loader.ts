/**
 * Read the tracked and operator-local TOML layer files.
 *
 * **The TOML parser is a dependency, and it is the only one.** Node ships no
 * TOML parser and `tomllib` is in Python's standard library, so the port either
 * takes a dependency or writes a parser. Writing one was rejected: the cases
 * translated from `tests/test_toml_loader.py` assert that a syntax error becomes
 * a `CatalogError` naming the file and that layers arrive in order -- none of
 * them would notice a hand-rolled parser disagreeing with `tomllib` about
 * escapes, integers or dotted keys, so the ledger would stay green over a parser
 * that read catalogs differently from the specification's. `smol-toml` is
 * TOML 1.0.0 conformant and has no dependencies of its own; the version is
 * pinned in `package-lock.json` (D-0004) and the choice is recorded in
 * DECISIONS.md.
 *
 * Where `smol-toml` and `tomllib` are known to disagree is recorded in
 * `parity/toml-loader.ledger.json`, not here, because it is parity information
 * rather than an instruction to a reader of this file.
 */
import { readFileSync, statSync } from "node:fs";
import { parse as parseToml, TomlError } from "smol-toml";

import type { RawTable } from "../../domain/clone-source.js";
import { CatalogError } from "../../domain/errors.js";
import { nativePath } from "../../domain/python-path.js";
import { type LayerDocument, layerDocument } from "../../ports/catalog-source.js";

export const TRACKED_FILENAME = "projects.toml";
export const LOCAL_FILENAME = "projects.local.toml";

/**
 * `os.path.abspath`.
 *
 * On Windows CPython calls `_getfullpathname`, which also supplies the current
 * drive for a drive-relative path such as `\\srv`. That one behaviour is
 * reproduced explicitly below; the per-drive working directory
 * `_getfullpathname` also consults (`C:srv`) is not, and cannot be from Node.
 */
function abspath(path: string): string {
  const cwd = process.cwd();
  if (!nativePath.isAbsolute(path)) {
    return nativePath.normpath(nativePath.join(cwd, path));
  }
  if (nativePath.name === "windows" && !nativePath.isPathlibAbsolute(path)) {
    const drive = cwd.slice(0, 2);
    return nativePath.normpath(drive + path);
  }
  return nativePath.normpath(path);
}

/**
 * `Path.is_file()`.
 *
 * pathlib swallows every `OSError`, not only "no such file": an unreadable
 * parent directory answers false rather than raising, and the caller's own
 * "tracked catalog file not found" is then the refusal an operator sees.
 * `statSync` still throws for those, so the `catch` is what carries the
 * behaviour over.
 */
function isFile(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

/** Loads the layers of a catalog directory, lowest precedence first. */
export class TomlCatalogSource {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  load(): readonly LayerDocument[] {
    // Absolute from here on. This adapter is the one component that knows where
    // the files were found, so it is where the CWD is allowed to be consulted --
    // once, to locate the layer files, and never again to anchor a path a
    // catalog stated (design doc section 3.1).
    const directory = abspath(this.directory);
    const trackedPath = nativePath.join(directory, TRACKED_FILENAME);
    if (!isFile(trackedPath)) {
      throw new CatalogError("tracked catalog file not found", trackedPath);
    }
    const documents = [read(trackedPath, directory, "tracked")];

    // The local layer is operator-owned and gitignored, so its absence is the
    // normal case rather than an error.
    const localPath = nativePath.join(directory, LOCAL_FILENAME);
    if (isFile(localPath)) {
      documents.push(read(localPath, directory, "local"));
    }
    return documents;
  }
}

function read(path: string, directory: string, layer: string): LayerDocument {
  let text: string;
  try {
    // `tomllib.load` reads bytes and decodes them as UTF-8, so invalid UTF-8 is
    // a decode failure and NOT a `TOMLDecodeError` -- it escapes `_read`
    // uncaught. `fatal: true` keeps that: Node's default would silently
    // substitute U+FFFD and hand a corrupted catalog to the composer.
    text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }
    throw new CatalogError(`cannot read catalog file: ${String(error)}`, path);
  }
  let data: unknown;
  try {
    data = parseToml(text);
  } catch (error) {
    if (!(error instanceof TomlError)) {
      throw error;
    }
    // A raw decoder error names an offset and no file, which is useless when two
    // layers are in play.
    throw new CatalogError(`invalid TOML: ${error.message}`, path);
  }
  return layerDocument(layer, path, directory, data as RawTable);
}
