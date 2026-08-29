/**
 * The TOML adapter: files to raw layer documents (design doc section 5.1).
 *
 * Ported from `tests/test_toml_loader.py`. The mapping, case by case, is
 * `parity/toml-loader.ledger.json`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  LOCAL_FILENAME,
  TomlCatalogSource,
  TRACKED_FILENAME,
} from "../../src/adapters/toml-catalog/loader.js";
import { composeCatalog } from "../../src/application/compose.js";
import { CatalogError } from "../../src/domain/errors.js";
import { nativePath, posix, windows } from "../../src/domain/python-path.js";
import { layerDocument } from "../../src/ports/catalog-source.js";
import { CATALOG_DIR, refusal } from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

const TRACKED_TOML = `
schema_version = 1

[project.web]
base_branch = "main"

[project.web.source]
kind = "git_url"
url = "https://example.invalid/org/web.git"
`;

const LOCAL_TOML = `
schema_version = 1

[project.web]
base_branch = "develop"
`;

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** `pytest`'s `tmp_path`: a fresh directory per test, removed afterwards. */
let tmpPath: string;

beforeEach(() => {
  // `mkdtempSync` returns a path that may run through a symlink (`/var` ->
  // `/private/var` on macOS). The adapter reports the path it was given, not a
  // resolved one, so the fixture is normalised the same way the adapter
  // normalises -- lexically -- and never with a call that resolves links.
  tmpPath = nativePath.normpath(mkdtempSync(join(tmpdir(), "cadenza-")));
});

afterEach(() => {
  rmSync(tmpPath, { recursive: true, force: true });
});

describe("TomlCatalogSource", () => {
  test("the filenames are the documented ones", () => {
    expect(TRACKED_FILENAME).toBe("projects.toml");
    expect(LOCAL_FILENAME).toBe("projects.local.toml");
  });

  test("the tracked file is required and its absence names the path", () => {
    const caught = refusal(CatalogError, () => new TomlCatalogSource(tmpPath).load());
    expect(caught.message).toMatch(/tracked catalog file not found/);
    expect(caught.location).toBe(nativePath.join(tmpPath, TRACKED_FILENAME));
  });

  test("the local file is optional", () => {
    writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
    const documents = new TomlCatalogSource(tmpPath).load();
    expect(documents.map((document) => document.layer)).toEqual(["tracked"]);
  });

  test("layers are returned lowest precedence first", () => {
    writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
    writeFileSync(join(tmpPath, LOCAL_FILENAME), LOCAL_TOML, "utf8");
    const documents = new TomlCatalogSource(tmpPath).load();
    expect(documents.map((document) => document.layer)).toEqual(["tracked", "local"]);
  });

  test("each document carries its origin and base dir", () => {
    // base_dir travels with the document because a relative local_path is
    // anchored to the directory of the file that declared it.
    writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
    writeFileSync(join(tmpPath, LOCAL_FILENAME), LOCAL_TOML, "utf8");
    const [tracked, local] = new TomlCatalogSource(tmpPath).load();
    expect(tracked?.origin).toBe(nativePath.join(tmpPath, TRACKED_FILENAME));
    expect(local?.origin).toBe(nativePath.join(tmpPath, LOCAL_FILENAME));
    expect(tracked?.baseDir).toBe(tmpPath);
    expect(local?.baseDir).toBe(tmpPath);
  });

  test("the parsed data is handed over unvalidated", () => {
    // The adapter parses; section 5 validates. Nothing here inspects the keys.
    writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
    const documents = new TomlCatalogSource(tmpPath).load();
    expect(documents).toHaveLength(1);
    const data = documents[0]?.data as {
      schema_version: number;
      project: { web: { source: { kind: string } } };
    };
    expect(data.schema_version).toBe(1);
    expect(data.project.web.source.kind).toBe("git_url");
  });

  parametrize<string>(
    "a syntax error surfaces as a catalog error naming the file",
    [
      ["projects.toml", TRACKED_FILENAME],
      ["projects.local.toml", LOCAL_FILENAME],
    ],
    (filename) => {
      // A raw decoder error names an offset and no file, which is useless when
      // two layers are in play.
      writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
      writeFileSync(join(tmpPath, filename), "schema_version = = 1\n", "utf8");
      const caught = refusal(CatalogError, () => new TomlCatalogSource(tmpPath).load());
      expect(caught.message).toMatch(/invalid TOML/);
      expect(caught.location).toBe(nativePath.join(tmpPath, filename));
      expect(caught.message).toContain(nativePath.join(tmpPath, filename));
    },
  );

  test("a directory where the tracked file should be is not mistaken for one", () => {
    mkdirSync(join(tmpPath, TRACKED_FILENAME));
    expect(() => new TomlCatalogSource(tmpPath).load()).toThrow(/tracked catalog file not found/);
  });

  test("the repository catalog loads and composes", () => {
    // The one end-to-end case: the file shipped in config/ is valid input.
    const directory = join(REPOSITORY_ROOT, "config");
    const catalog = composeCatalog(new TomlCatalogSource(directory).load());
    expect(Object.keys(catalog.projects).length).toBeGreaterThan(0);
  });

  test("a relative directory still yields an absolute anchor", () => {
    // The adapter is the one component allowed to consult the CWD, and only to
    // find the files. What it hands on must already be absolute, so that no
    // local_path anchored to it can be re-anchored later (design doc section
    // 3.1).
    writeFileSync(join(tmpPath, TRACKED_FILENAME), TRACKED_TOML, "utf8");
    const before = process.cwd();
    try {
      process.chdir(tmpPath);
      const documents = new TomlCatalogSource(".").load();
      expect(documents[0]?.baseDir).toBeDefined();
      expect(nativePath.isPathlibAbsolute(documents[0]?.baseDir as string)).toBe(true);
      expect(nativePath.isPathlibAbsolute(documents[0]?.origin as string)).toBe(true);
    } finally {
      process.chdir(before);
    }
  });

  test("a layer document refuses a relative base dir", () => {
    expect(() => layerDocument("tracked", "projects.toml", "config", {})).toThrow(RangeError);
    expect(() => layerDocument("tracked", "projects.toml", "config", {})).toThrow(
      /base_dir must be absolute/,
    );
  });

  test("the shipped tracked catalog composes", () => {
    // The catalog this repository ships is documentation that runs. A README or
    // an example that cannot be loaded teaches the wrong rules confidently.
    const catalogDir = join(REPOSITORY_ROOT, "config");
    const catalog = composeCatalog(new TomlCatalogSource(catalogDir).load());

    // The loop below is a claim about every project, and an empty catalog would
    // satisfy it while proving nothing. The source guards it with `assert
    // catalog.projects`; this is the same guard, spelled as a count so that a
    // catalog which stopped defining projects fails here rather than passing
    // vacuously.
    const entries = Object.entries(catalog.projects);
    expect(entries.length).toBeGreaterThan(0);
    for (const [projectId, found] of entries) {
      expect(found.baseBranch).not.toBe("");
      expect(found.aliases).not.toContain(projectId);
    }
  });

  test("a drive-less path is not absolute on windows", () => {
    // Why `test/support.ts` builds absolute paths instead of writing
    // "/srv/...": on Windows a path with no drive letter is drive-RELATIVE, so
    // the LayerDocument invariant refuses it and every test using such a literal
    // fails there and only there. Pinned with both flavours so the reasoning is
    // checkable from any platform.
    expect(windows.isPathlibAbsolute("/srv/catalog")).toBe(false);
    expect(windows.isPathlibAbsolute("C:/srv/catalog")).toBe(true);
    expect(posix.isPathlibAbsolute("/srv/catalog")).toBe(true);
    expect(nativePath.isPathlibAbsolute(CATALOG_DIR)).toBe(true);
  });
});
