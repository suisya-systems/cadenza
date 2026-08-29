/**
 * Resolution: a typed name to the snapshot a run persists (design doc section 6).
 *
 * Ported from `tests/test_resolve.py`. The mapping, case by case, is
 * `parity/resolve.ledger.json`.
 */
import { describe, expect, test } from "vitest";

import { type Catalog, composeCatalog } from "../../src/application/compose.js";
import { resolveProject } from "../../src/application/resolve.js";
import { gitUrlSource } from "../../src/domain/clone-source.js";
import { configDigest } from "../../src/domain/digest.js";
import { CadenzaError, CatalogError, ProjectNotFoundError } from "../../src/domain/errors.js";
import { fieldOrigin } from "../../src/domain/project.js";
import { nativePath } from "../../src/domain/python-path.js";
import {
  absolute,
  gitUrlProject,
  LOCAL_ORIGIN,
  makeLayer,
  refusal,
  TRACKED_ORIGIN,
} from "../support.js";

function catalogOf(aliases: readonly string[] = ["site"]): Catalog {
  const tracked = makeLayer({
    schema_version: 1,
    project: {
      web: gitUrlProject({ extra: { aliases: [...aliases] } }),
      api: gitUrlProject({ url: "https://example.invalid/org/api.git" }),
    },
  });
  return composeCatalog([tracked]);
}

describe("resolve_project", () => {
  test("resolves by project id", () => {
    const resolved = resolveProject(catalogOf(), "web");
    expect(resolved.projectId).toBe("web");
    expect(resolved.source).toEqual(gitUrlSource("https://example.invalid/org/repo.git"));
    expect(resolved.baseBranch).toBe("main");
  });

  test("resolves by alias to the same immutable identity", () => {
    const catalog = catalogOf(["site", "frontend"]);
    expect(resolveProject(catalog, "site")).toEqual(resolveProject(catalog, "web"));
    expect(resolveProject(catalog, "frontend").projectId).toBe("web");
  });

  test("aliases travel with the snapshot as information", () => {
    const resolved = resolveProject(catalogOf(["site", "frontend"]), "site");
    expect(resolved.aliases).toEqual(["site", "frontend"]);
  });

  test("the snapshot carries the config digest", () => {
    const catalog = catalogOf();
    const resolved = resolveProject(catalog, "web");
    const web = catalog.projects["web"];
    expect(web).toBeDefined();
    expect(resolved.configDigest).toBe(configDigest(web as NonNullable<typeof web>));
    expect(resolved.configDigest.startsWith("sha256:")).toBe(true);
  });

  test("the snapshot carries per-field provenance", () => {
    const catalog = composeCatalog([
      makeLayer({ schema_version: 1, project: { web: gitUrlProject() } }),
      makeLayer(
        { schema_version: 1, project: { web: { base_branch: "develop" } } },
        { layer: "local" },
      ),
    ]);
    const resolved = resolveProject(catalog, "web");
    expect(resolved.provenance["base_branch"]).toEqual(fieldOrigin("local", LOCAL_ORIGIN));
    expect(resolved.provenance["source"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
  });

  test("an unknown name is refused with the closest candidates", () => {
    const caught = refusal(ProjectNotFoundError, () => resolveProject(catalogOf(), "wbe"));
    expect(caught.message).toMatch(/no project is named 'wbe'/);
    expect(caught.message).toContain("web");
  });

  test("an unrelated name is refused without inventing a candidate", () => {
    const caught = refusal(ProjectNotFoundError, () => resolveProject(catalogOf(), "zzzzzzzz"));
    expect(caught.message).not.toContain("Closest known names");
  });

  test("a tombstoned project no longer resolves", () => {
    const catalog = composeCatalog([
      makeLayer({ schema_version: 1, project: { web: gitUrlProject() } }),
      makeLayer({ schema_version: 1, project: { web: { tombstone: true } } }, { layer: "local" }),
    ]);
    expect(() => resolveProject(catalog, "web")).toThrow(ProjectNotFoundError);
  });

  test("not found is not a catalog error", () => {
    // The catalog is fine; the typed name is not. A caller distinguishing "your
    // catalog is broken" from "no such project" needs these apart.
    //
    // The source asks `issubclass`, which has no expression in TypeScript: a
    // class is a value and a type, and only the value carries the prototype
    // chain. Asking an instance is the same question of the same chain --
    // `instanceof` walks exactly what `issubclass` walks -- and it is the form a
    // caller would use to make the distinction the case is about.
    const error = new ProjectNotFoundError("no project is named 'x'");
    expect(error).toBeInstanceOf(CadenzaError);
    expect(error).not.toBeInstanceOf(CatalogError);
  });

  test("provenance is total over every field of the snapshot", () => {
    // Section 5.7 promises provenance per field, not per stated field. A project
    // that omits the optional aliases still got an empty list from some layer,
    // and a caller indexing provenance["aliases"] must not find nothing there.
    const catalog = composeCatalog([
      makeLayer({ schema_version: 1, project: { web: gitUrlProject() } }),
    ]);
    const resolved = resolveProject(catalog, "web");

    expect(resolved.aliases).toEqual([]);
    expect(new Set(Object.keys(resolved.provenance))).toEqual(
      new Set(["project_id", "aliases", "source", "base_branch"]),
    );
    expect(resolved.provenance["aliases"]?.layer).toBe("tracked");
  });

  test("the digest survives the catalog moving to another file", () => {
    // Re-pointed here from `tests/test_digest.py`, which is where this case is
    // written and where it could not be ported: its subject is the COMPOSITION
    // path, and the pilot that ported that file had no composer. See the entry
    // in `parity/digest.ledger.json`, which claims this test.
    //
    // Composed from two different files, in two different layers, with two
    // different base directories: same configuration, so same digest. This is
    // design doc section 4's exclusion of file paths, asserted end to end rather
    // than on the payload's key set.
    const data = { schema_version: 1, project: { web: gitUrlProject() } };
    const here = composeCatalog([makeLayer(data)]);
    const elsewhere = composeCatalog([
      makeLayer(data, {
        layer: "local",
        origin: nativePath.join(absolute("elsewhere"), "projects.local.toml"),
        baseDir: absolute("elsewhere"),
      }),
    ]);
    expect(resolveProject(here, "web").configDigest).toBe(
      resolveProject(elsewhere, "web").configDigest,
    );
  });

  test("a later layer stating aliases owns their provenance", () => {
    const catalog = composeCatalog([
      makeLayer({ schema_version: 1, project: { web: gitUrlProject() } }),
      makeLayer({ schema_version: 1, project: { web: { aliases: ["www"] } } }, { layer: "local" }),
    ]);
    const resolved = resolveProject(catalog, "www");

    expect(resolved.provenance["aliases"]?.layer).toBe("local");
    expect(resolved.provenance["source"]?.layer).toBe("tracked");
  });
});
