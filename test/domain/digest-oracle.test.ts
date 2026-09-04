/**
 * The config_digest differential oracle.
 *
 * A ported test can only catch a divergence that `tests/test_digest.py` already
 * had an assertion for, and that suite asserts the encoding for exactly one
 * project, spelled entirely in ASCII. Everything CPython's `json.dumps` does
 * that `src/domain/canonical-json.ts` had to reimplement -- escaping,
 * `ensure_ascii=False`, `sort_keys` under a non-ASCII collation -- is
 * unexercised by it. Both suites would go green while the two implementations
 * disagreed on the first project with a non-ASCII path in it, and
 * `config_digest` is a **persisted** value, so that disagreement would not
 * surface as a failing test. It would surface as an audit reporting that a
 * catalog had moved when it had not.
 *
 * So this compares against the real other implementation: the vector at
 * `parity/oracle/config-digest-vector.json` is what CPython produced for the
 * same corpus, and the comparison is on the bytes.
 *
 * Regenerate the vector with, from the repository root:
 *
 *     PYTHONDONTWRITEBYTECODE=1 python3 scripts/oracle/dump_config_digest.py \
 *         parity/oracle/config-digest-vector.json
 *
 * Unlike continuo's oracles, this one needs no second checkout -- and after
 * D-0032 it needs no cadenza Python either. `src/cadenza/` is gone, and the
 * generator was rewritten to import nothing but the standard library, because
 * the implementation this oracle really questions was never cadenza's: it is
 * CPython's `json.dumps` under `sort_keys=True` / `ensure_ascii=False`, its
 * code-point collation, and `hashlib.sha256`. Those outlived the port and can
 * still move under a Python upgrade, which is why this face still regenerates
 * on every CI run while the composition face's vector is frozen.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { canonicalJson, canonicalJsonBytes } from "../../src/domain/canonical-json.js";
import { canonicalPayload, configDigest } from "../../src/domain/digest.js";
import { DIGEST_CORPUS } from "../oracle/digest-corpus.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VECTOR_PATH = join(ROOT, "parity", "oracle", "config-digest-vector.json");

interface OracleCase {
  readonly id: string;
  readonly canonical_json: string;
  readonly canonical_bytes_hex: string;
  readonly digest: string;
}

interface OracleVector {
  readonly generated_by: string;
  readonly python_version: string;
  readonly case_count: number;
  readonly cases: readonly OracleCase[];
}

const vector = JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as OracleVector;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The vector row for a corpus position, as a value the type checker trusts. */
function rowAt(index: number): OracleCase {
  const row = vector.cases[index];
  if (row === undefined) {
    throw new Error(`the vector has no case at position ${index}`);
  }
  return row;
}

describe("config_digest differential oracle", () => {
  test("the vector is not vacuous", () => {
    // A vector regenerated from a failed or empty run would otherwise let every
    // comparison below pass while comparing nothing.
    expect(vector.cases.length).toBe(vector.case_count);
    expect(vector.cases.length).toBeGreaterThanOrEqual(15);
    expect(vector.python_version).toMatch(/^3\.\d+\.\d+$/);
    for (const entry of vector.cases) {
      expect(entry.digest, `case ${entry.id}`).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.canonical_bytes_hex.length, `case ${entry.id}`).toBeGreaterThan(0);
    }
    // Every digest distinct: two corpus rows that collapsed to one value would
    // make the comparison weaker than its row count suggests, and two of these
    // rows differ only by Unicode normalisation.
    expect(new Set(vector.cases.map((entry) => entry.digest)).size).toBe(vector.cases.length);
  });

  test("both halves state the same corpus, in the same order", () => {
    // Asserted before any byte comparison. The corpora are written twice on
    // purpose, and a comparison that silently skipped the rows one side had
    // forgotten would be the failure this oracle exists to make impossible.
    expect(DIGEST_CORPUS.map(([id]) => id)).toEqual(vector.cases.map((entry) => entry.id));
  });

  test("the canonical encoding agrees with CPython, byte for byte", () => {
    for (const [index, [id, value]] of DIGEST_CORPUS.entries()) {
      const expected = rowAt(index);
      const payload = canonicalPayload(value);
      // Named per case rather than compared as one array: a failure has to say
      // which input diverged, because that is the whole diagnosis.
      expect(canonicalJson(payload), id).toBe(expected.canonical_json);
      // And on the bytes as well as on the text. A JavaScript string that
      // compares equal to the vector's could still encode differently, and the
      // digest is taken over the encoding rather than over the string.
      expect(hex(canonicalJsonBytes(payload)), id).toBe(expected.canonical_bytes_hex);
    }
  });

  test("the digest agrees with CPython", () => {
    for (const [index, [id, value]] of DIGEST_CORPUS.entries()) {
      expect(configDigest(value), id).toBe(rowAt(index).digest);
    }
  });
});
