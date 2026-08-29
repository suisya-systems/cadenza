/**
 * Composition of ordered layer documents (design doc section 5).
 *
 * Ported from `tests/test_compose.py`. The mapping, case by case, is
 * `parity/compose.ledger.json`.
 */
import { describe, expect, test } from "vitest";

import { composeCatalog, SUPPORTED_SCHEMA_VERSIONS } from "../../src/application/compose.js";
import {
  gitUrlSource,
  localPathSource,
  newRepositorySource,
} from "../../src/domain/clone-source.js";
import {
  CatalogError,
  InvalidCloneSourceError,
  InvalidIdentifierError,
  MissingFieldError,
  NameCollisionError,
  SchemaVersionError,
  TombstoneError,
  UnknownFieldError,
} from "../../src/domain/errors.js";
import { fieldOrigin } from "../../src/domain/project.js";
import { nativePath } from "../../src/domain/python-path.js";
import type { LayerDocument } from "../../src/ports/catalog-source.js";
import {
  CATALOG_DIR,
  gitUrlProject,
  LOCAL_ORIGIN,
  makeLayer,
  refusal,
  TRACKED_ORIGIN,
} from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

type Table = Record<string, unknown>;

function tracked(projects: Record<string, unknown>, top: Table = {}): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects, ...top });
}

function local(projects: Record<string, unknown>, top: Table = {}): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects, ...top }, { layer: "local" });
}

describe("the happy path", () => {
  test("a single layer yields a project keyed by its id", () => {
    const catalog = composeCatalog([tracked({ web: gitUrlProject({ baseBranch: "trunk" }) })]);
    const found = catalog.projects["web"];
    expect(found?.projectId).toBe("web");
    expect(found?.baseBranch).toBe("trunk");
    expect(found?.source).toEqual(gitUrlSource("https://example.invalid/org/repo.git"));
    expect(catalog.names).toEqual({ web: "web" });
  });

  test("aliases and id share one flat namespace", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site", "frontend"] } }) }),
    ]);
    expect(catalog.names).toEqual({ web: "web", site: "web", frontend: "web" });
    expect(catalog.projects["web"]?.aliases).toEqual(["site", "frontend"]);
  });

  test("an empty document set yields an empty catalog", () => {
    const catalog = composeCatalog([]);
    expect(catalog.projects).toEqual({});
    expect(catalog.names).toEqual({});
  });

  test("supported schema versions is exactly one", () => {
    expect(new Set([1])).toEqual(SUPPORTED_SCHEMA_VERSIONS);
  });
});

describe("section 5.3: field-level merge", () => {
  test("the local layer replaces only the fields it states", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site"] } }) }),
      local({ web: { base_branch: "develop" } }),
    ]);
    const found = catalog.projects["web"];
    expect(found?.baseBranch).toBe("develop");
    expect(found?.source).toEqual(gitUrlSource("https://example.invalid/org/repo.git"));
    expect(found?.aliases).toEqual(["site"]);
  });

  test("provenance names the layer and file of each field", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site"] } }) }),
      local({ web: { base_branch: "develop" } }),
    ]);
    const provenance = catalog.provenance["web"];
    expect(provenance?.["source"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
    expect(provenance?.["aliases"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
    expect(provenance?.["base_branch"]).toEqual(fieldOrigin("local", LOCAL_ORIGIN));
    expect(provenance?.["project_id"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
  });

  test("source replaces whole rather than field-wise", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject() }),
      local({ web: { source: { kind: "new" } } }),
    ]);
    expect(catalog.projects["web"]?.source).toEqual(newRepositorySource());
  });

  test("a partial source override is refused instead of inheriting a kind", () => {
    // Field-wise merge of a tagged union would produce a shape nobody wrote: a
    // tracked kind = "git_url" wearing a local 'path'.
    const caught = refusal(MissingFieldError, () =>
      composeCatalog([
        tracked({ web: gitUrlProject() }),
        local({ web: { source: { path: "/srv/web" } } }),
      ]),
    );
    expect(caught.message).toMatch(/requires the key 'kind'/);
  });

  test("aliases replace whole so an alias can be removed", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site", "frontend"] } }) }),
      local({ web: { aliases: ["site"] } }),
    ]);
    expect(catalog.projects["web"]?.aliases).toEqual(["site"]);
    expect(Object.hasOwn(catalog.names, "frontend")).toBe(false);
  });

  test("the local layer may introduce a project the tracked layer does not have", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject() }),
      local({ scratch: gitUrlProject() }),
    ]);
    expect(new Set(Object.keys(catalog.projects))).toEqual(new Set(["web", "scratch"]));
    expect(catalog.provenance["scratch"]?.["project_id"]?.layer).toBe("local");
  });

  test("aliases must be a list of identifiers", () => {
    const caught = refusal(CatalogError, () =>
      composeCatalog([tracked({ web: gitUrlProject({ extra: { aliases: "site" } }) })]),
    );
    expect(caught.message).toMatch(/'aliases' must be a list/);
  });

  test("the same alias listed twice is refused", () => {
    const caught = refusal(NameCollisionError, () =>
      composeCatalog([tracked({ web: gitUrlProject({ extra: { aliases: ["site", "site"] } }) })]),
    );
    expect(caught.message).toMatch(/listed twice/);
  });
});

describe("section 5.2: schema version", () => {
  test("a missing schema_version is refused naming the file", () => {
    const caught = refusal(SchemaVersionError, () =>
      composeCatalog([makeLayer({ project: { web: gitUrlProject() } })]),
    );
    expect(caught.message).toMatch(/'schema_version' is required/);
    expect(caught.location).toBe(TRACKED_ORIGIN);
  });

  parametrize<unknown>(
    "a non-integer schema_version is refused",
    [
      ["1", "1"],
      ["None", null],
      ["version3", [1]],
    ],
    (version) => {
      const caught = refusal(SchemaVersionError, () =>
        composeCatalog([makeLayer({ schema_version: version, project: {} })]),
      );
      expect(caught.message).toMatch(/must be an integer/);
    },
  );

  test("a number with a fractional part is refused", () => {
    // Target-only, and it stands where a source case cannot be translated:
    // `test_non_integer_schema_version_is_refused[1.0]` refuses a Python FLOAT
    // whose value is 1, and JavaScript has one numeric type in which
    // `1.0 === 1`. The nearest property that does exist here is that a number
    // with a fractional part is refused, and it is asserted rather than left
    // uncovered. `parity/compose.ledger.json` records the untranslatable case
    // and the divergence it exposes.
    const caught = refusal(SchemaVersionError, () =>
      composeCatalog([makeLayer({ schema_version: 1.5, project: {} })]),
    );
    expect(caught.message).toMatch(/must be an integer/);
  });

  test("a boolean schema_version is refused although bool is an int", () => {
    const caught = refusal(SchemaVersionError, () =>
      composeCatalog([makeLayer({ schema_version: true, project: {} })]),
    );
    expect(caught.message).toMatch(/must be an integer/);
  });

  test("an unsupported schema_version is refused naming the file", () => {
    // Refusing beats guessing: a newer file read by an older cadenza would
    // otherwise resolve to something plausible and wrong.
    const caught = refusal(SchemaVersionError, () =>
      composeCatalog([makeLayer({ schema_version: 2, project: {} }, { layer: "local" })]),
    );
    expect(caught.message).toMatch(/schema_version 2 is not supported/);
    expect(caught.location).toBe(LOCAL_ORIGIN);
  });

  test("each layer carries its own schema_version", () => {
    const caught = refusal(SchemaVersionError, () =>
      composeCatalog([tracked({ web: gitUrlProject() }), makeLayer({}, { layer: "local" })]),
    );
    expect(caught.message).toMatch(/'schema_version' is required/);
    expect(caught.location).toBe(LOCAL_ORIGIN);
  });
});

describe("section 5.6: closed tables", () => {
  test("an unknown top-level key is refused", () => {
    const caught = refusal(UnknownFieldError, () =>
      composeCatalog([makeLayer({ schema_version: 1, projects: {} })]),
    );
    expect(caught.message).toMatch(/unknown key 'projects'/);
    expect(caught.location).toBe(TRACKED_ORIGIN);
  });

  test("an unknown catalog key is refused", () => {
    const caught = refusal(UnknownFieldError, () =>
      composeCatalog([makeLayer({ schema_version: 1, catalog: { allowed_roots: ["~/work"] } })]),
    );
    expect(caught.message).toMatch(/unknown key 'allowed_roots'/);
    expect(caught.location).toBe(`${TRACKED_ORIGIN}: catalog`);
  });

  test("an unknown project key is refused naming the key and the project", () => {
    // The typo this catalog exists to prevent.
    const table = gitUrlProject();
    table["base_brnach"] = "main";
    const caught = refusal(UnknownFieldError, () => composeCatalog([tracked({ web: table })]));
    expect(caught.message).toMatch(/unknown key 'base_brnach'/);
    expect(caught.location).toBe(`${TRACKED_ORIGIN}: project.web`);
  });

  test("an unknown source key is refused naming the source table", () => {
    const table = gitUrlProject();
    (table["source"] as Record<string, unknown>)["depth"] = 1;
    const caught = refusal(UnknownFieldError, () => composeCatalog([tracked({ web: table })]));
    expect(caught.message).toMatch(/'depth'/);
    expect(caught.location).toBe(`${TRACKED_ORIGIN}: project.web.source`);
  });

  parametrize<[data: Table, expected: RegExp]>(
    "wrongly shaped tables are refused",
    [
      [
        "data0-'project' must be a table",
        [{ schema_version: 1, project: [] }, /'project' must be a table/],
      ],
      [
        "data1-'catalog' must be a table",
        [{ schema_version: 1, catalog: [] }, /'catalog' must be a table/],
      ],
      ["data2-must be a table", [{ schema_version: 1, project: { web: [] } }, /must be a table/]],
      [
        "data3-'source' must be a table",
        [{ schema_version: 1, project: { web: { source: [] } } }, /'source' must be a table/],
      ],
      [
        "data4-must be a list of strings",
        [
          { schema_version: 1, catalog: { allowed_local_roots: "~/work" } },
          /must be a list of strings/,
        ],
      ],
    ],
    ([data, expected]) => {
      const caught = refusal(CatalogError, () => composeCatalog([makeLayer(data)]));
      expect(caught.message).toMatch(expected);
    },
  );
});

describe("required fields", () => {
  parametrize<[table: Table, expected: RegExp]>(
    "a project missing a required field is refused",
    [
      ["table0-has no source", [{ base_branch: "main" }, /has no source/]],
      ["table1-has no base_branch", [{ source: { kind: "new" } }, /has no base_branch/]],
      ["table2-has no source", [{}, /has no source/]],
    ],
    ([table, expected]) => {
      const caught = refusal(MissingFieldError, () => composeCatalog([tracked({ web: table })]));
      expect(caught.message).toMatch(expected);
      expect(caught.location).toBe(TRACKED_ORIGIN);
    },
  );

  test("a field may be supplied by either layer", () => {
    const catalog = composeCatalog([
      tracked({ web: { source: { kind: "new" } } }),
      local({ web: { base_branch: "main" } }),
    ]);
    expect(catalog.projects["web"]?.baseBranch).toBe("main");
  });
});

describe("section 5.5: tombstones", () => {
  test("a tombstone removes a tracked project and its names", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site"] } }), api: gitUrlProject() }),
      local({ web: { tombstone: true } }),
    ]);
    expect(new Set(Object.keys(catalog.projects))).toEqual(new Set(["api"]));
    expect(Object.hasOwn(catalog.names, "site")).toBe(false);
  });

  test("a tombstone carrying a sibling field is refused", () => {
    // It reads as both "delete this" and "and configure it".
    const caught = refusal(TombstoneError, () =>
      composeCatalog([
        tracked({ web: gitUrlProject() }),
        local({ web: { tombstone: true, base_branch: "develop" } }),
      ]),
    );
    expect(caught.message).toMatch(/must carry no other field/);
    expect(caught.location).toBe(`${LOCAL_ORIGIN}: project.web`);
  });

  test("a tombstone naming an unknown project is refused", () => {
    // A stale or typo'd tombstone accepted silently makes the next typo silent too.
    const caught = refusal(TombstoneError, () =>
      composeCatalog([tracked({ web: gitUrlProject() }), local({ wbe: { tombstone: true } })]),
    );
    expect(caught.message).toMatch(/which no earlier layer defines/);
  });

  parametrize<unknown>(
    "a non-boolean tombstone is refused",
    [
      ["true", "true"],
      ["1", 1],
      ["None", null],
    ],
    (value) => {
      const caught = refusal(TombstoneError, () =>
        composeCatalog([tracked({ web: gitUrlProject() }), local({ web: { tombstone: value } })]),
      );
      expect(caught.message).toMatch(/must be a boolean/);
    },
  );

  test("tombstone false is refused rather than read as keep", () => {
    const caught = refusal(TombstoneError, () =>
      composeCatalog([tracked({ web: gitUrlProject() }), local({ web: { tombstone: false } })]),
    );
    expect(caught.message).toMatch(/only meaningful as true/);
  });
});

describe("section 3.3: allowed_local_roots does not merge", () => {
  test("a local path is checked against its own layer's roots", () => {
    const document = makeLayer(
      {
        schema_version: 1,
        catalog: { allowed_local_roots: [CATALOG_DIR] },
        project: {
          web: { source: { kind: "local_path", path: "web" }, base_branch: "main" },
        },
      },
      { baseDir: CATALOG_DIR },
    );
    const catalog = composeCatalog([document]);
    expect(catalog.projects["web"]?.source).toEqual(
      localPathSource(nativePath.join(CATALOG_DIR, "web")),
    );
  });

  test("a tracked layer's roots do not authorise a local layer's path", () => {
    // A file shared by everyone must not authorise a directory on one operator's
    // machine, so the local layer gets no benefit from the tracked roots.
    const trackedDocument = makeLayer(
      {
        schema_version: 1,
        catalog: { allowed_local_roots: [CATALOG_DIR] },
        project: { web: gitUrlProject() },
      },
      { baseDir: CATALOG_DIR },
    );
    const localDocument = makeLayer(
      {
        schema_version: 1,
        project: {
          web: { source: { kind: "local_path", path: nativePath.join(CATALOG_DIR, "web") } },
        },
      },
      { layer: "local", baseDir: CATALOG_DIR },
    );
    const caught = refusal(InvalidCloneSourceError, () =>
      composeCatalog([trackedDocument, localDocument]),
    );
    expect(caught.message).toMatch(/allowed_local_roots/);
  });

  test("a local layer's roots do not authorise a tracked layer's path", () => {
    const trackedDocument = makeLayer(
      {
        schema_version: 1,
        project: {
          web: { source: { kind: "local_path", path: nativePath.join(CATALOG_DIR, "web") } },
        },
      },
      { baseDir: CATALOG_DIR },
    );
    const localDocument = makeLayer(
      { schema_version: 1, catalog: { allowed_local_roots: [CATALOG_DIR] }, project: {} },
      { layer: "local", baseDir: CATALOG_DIR },
    );
    const caught = refusal(InvalidCloneSourceError, () =>
      composeCatalog([trackedDocument, localDocument]),
    );
    expect(caught.message).toMatch(/allowed_local_roots/);
  });
});

describe("section 5.4: names collide -> refuse", () => {
  test("an alias colliding with another project's id is refused", () => {
    const caught = refusal(NameCollisionError, () =>
      composeCatalog([
        tracked({ web: gitUrlProject(), api: gitUrlProject({ extra: { aliases: ["web"] } }) }),
      ]),
    );
    expect(caught.message).toMatch(/name 'web' is claimed by project/);
  });

  test("two projects claiming the same alias are refused naming both", () => {
    const caught = refusal(NameCollisionError, () =>
      composeCatalog([
        tracked({
          web: gitUrlProject({ extra: { aliases: ["site"] } }),
          api: gitUrlProject({ extra: { aliases: ["site"] } }),
        }),
      ]),
    );
    expect(caught.message).toContain("'web'");
    expect(caught.message).toContain("'api'");
    expect(caught.message).toContain("'site'");
  });

  test("a collision across layers is refused naming the layers", () => {
    const caught = refusal(NameCollisionError, () =>
      composeCatalog([
        tracked({ web: gitUrlProject() }),
        local({ api: gitUrlProject({ extra: { aliases: ["web"] } }) }),
      ]),
    );
    expect(caught.message).toMatch(/local/);
    expect(caught.message).toContain("tracked");
  });

  test("the same project_id in two layers merges rather than colliding", () => {
    // Two *distinct* ids cannot collide: a project_id is a table key, unique per
    // file by construction. Restating one across layers is the merge of 5.3, and
    // is the case that must not be mistaken for a collision.
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject() }),
      local({ web: { base_branch: "develop" } }),
    ]);
    expect(new Set(Object.keys(catalog.projects))).toEqual(new Set(["web"]));
  });

  test("a tombstoned project's name is free for another project", () => {
    const catalog = composeCatalog([
      tracked({ web: gitUrlProject({ extra: { aliases: ["site"] } }) }),
      local({
        web: { tombstone: true },
        api: gitUrlProject({ extra: { aliases: ["site"] } }),
      }),
    ]);
    expect(catalog.names["site"]).toBe("api");
  });

  test("a project_id that is not an identifier is refused", () => {
    const caught = refusal(InvalidIdentifierError, () =>
      composeCatalog([tracked({ Web: gitUrlProject() })]),
    );
    expect(caught.message).toMatch(/project_id/);
  });
});

describe("the composed catalog is not a mutable view", () => {
  test("the composed mappings cannot be mutated by a caller", () => {
    const catalog = composeCatalog([tracked({ web: gitUrlProject() })]);
    expect(() => {
      (catalog.projects as Record<string, unknown>)["api"] = catalog.projects["web"];
    }).toThrow(TypeError);
    expect(() => {
      (catalog.names as Record<string, string>)["api"] = "web";
    }).toThrow(TypeError);
  });
});
