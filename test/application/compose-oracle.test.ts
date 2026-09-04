/**
 * The composition differential oracle.
 *
 * The digest oracle (`test/domain/digest-oracle.test.ts`) questions the encoder:
 * given the same `Project`, do CPython and Node produce the same bytes? This one
 * questions everything **upstream** of it. A `Project` does not arrive from
 * nowhere -- it is composed from ordered layer documents, merged field by field,
 * tombstoned, aliased and finally resolved -- and every one of those steps feeds
 * the value the encoder hashes.
 *
 * A ported test cannot make the claim. `tests/test_compose.py` asserts *which*
 * project comes out and *which* refusals fire; it asserts almost nothing about
 * the exact strings that reach the digest, because in Python those are right by
 * construction. The port had to rebuild that construction in a language whose
 * defaults differ, and `config_digest` is **persisted**: a divergence here does
 * not surface as a red test. It surfaces as an audit reporting that a catalog
 * moved when it did not, on every run recorded before the port.
 *
 * **This vector is frozen, and cannot be regenerated (D-0032).** It was produced
 * by `scripts/oracle/dump_compose_digest.py`, which drove cadenza's Python
 * `compose_catalog` / `resolve_project`; the retirement of the Python G1 deleted
 * both. That is deliberate rather than a loss taken for convenience: this face
 * questioned cadenza's OWN Python, so with that implementation gone the vector
 * can never go stale, and a self-contained generator would have been the same
 * composition logic written a second time by the same hand -- an oracle that
 * agrees with itself, which is exactly what the corpus split exists to prevent.
 * The sibling face is the opposite case and stays live: `dump_config_digest.py`
 * questions CPython's encoder, a third party that outlived `src/cadenza/`.
 *
 * So what these 13 cases still catch is every regression on the TypeScript side
 * -- the whole of what a reader of a green run should take from them. What they
 * no longer catch is a change on the Python side, which is not a gap, because
 * there is no Python side left to change.
 *
 * **Adding a case here is therefore not a normal edit.** There is no CPython to
 * ask for the expected value, so a new row's `digest` would be whatever this
 * port already computes, and the case would assert that the code agrees with
 * itself. Pin new composition behaviour in `test/application/compose.test.ts`
 * instead.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { composeCatalog } from "../../src/application/compose.js";
import { resolveProject } from "../../src/application/resolve.js";
import { toCanonical } from "../../src/domain/clone-source.js";
import { COMPOSE_CORPUS } from "../oracle/compose-corpus.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VECTOR_PATH = join(ROOT, "parity", "oracle", "compose-digest-vector.json");

interface OracleCase {
  readonly id: string;
  readonly resolved_project_id: string;
  readonly aliases: readonly string[];
  readonly base_branch: string;
  readonly source: Readonly<Record<string, string>>;
  readonly digest: string;
}

interface OracleVector {
  readonly generated_by: string;
  readonly python_version: string;
  readonly case_count: number;
  readonly cases: readonly OracleCase[];
}

const vector = JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as OracleVector;

describe("the composition oracle", () => {
  test("the vector describes the same corpus, in the same order", () => {
    // Asserted before anything is compared. If the two corpora drifted, every
    // comparison below would still be comparing *something*, and the row it
    // named in a failure would not be the row it had.
    expect(vector.cases.map((row) => row.id)).toEqual(COMPOSE_CORPUS.map((row) => row.id));
  });

  test("the vector is not vacuous", () => {
    // A vector regenerated from an empty run would let every comparison below
    // pass while comparing nothing at all. The count is checked against the
    // vector's own record of it as well, so a truncated file is not silently a
    // shorter corpus.
    expect(vector.cases.length).toBeGreaterThan(0);
    expect(vector.cases).toHaveLength(vector.case_count);
    expect(COMPOSE_CORPUS.length).toBeGreaterThan(0);
  });

  test("every case resolves to the digest CPython recorded", () => {
    // One test over the whole corpus rather than one per row, because the row
    // ids are not pytest node ids and a per-row test would invent target ids
    // that no ledger could map. The row is named in the failure instead.
    for (const [index, expected] of vector.cases.entries()) {
      const source = COMPOSE_CORPUS[index] as (typeof COMPOSE_CORPUS)[number];
      const resolved = resolveProject(composeCatalog(source.documents), source.name);
      const actual = {
        id: source.id,
        resolved_project_id: resolved.projectId,
        aliases: [...resolved.aliases],
        base_branch: resolved.baseBranch,
        source: toCanonical(resolved.source),
        digest: resolved.configDigest,
      };
      expect(actual, `corpus row '${source.id}'`).toEqual({
        id: expected.id,
        resolved_project_id: expected.resolved_project_id,
        aliases: [...expected.aliases],
        base_branch: expected.base_branch,
        source: expected.source,
        digest: expected.digest,
      });
    }
  });
});
