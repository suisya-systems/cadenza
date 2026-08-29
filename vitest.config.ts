import { defineConfig } from "vitest/config";

/**
 * Test runner configuration.
 *
 * Two properties here are load-bearing for CI and are deliberately NOT
 * expressible as CLI flags (DECISIONS.md D-0002, D-0006):
 *
 *  1. Random ordering is enabled *in this file*, so it cannot be silently
 *     dropped by an edit to a CI script or a local `vitest run` invocation.
 *     CI injects only the seed.
 *  2. The seed is required in CI. A run with an unrecorded seed is a run that
 *     cannot be replayed, which makes an order-dependent failure unactionable,
 *     so an unset seed under CI is a hard error rather than a silent default.
 */

/** Environment variable carrying the explicit RNG seed. */
const SEED_ENV = "CADENZA_TEST_SEED";

/** Largest seed accepted. Keeps the value printable and shell-safe. */
const SEED_MAX = 2_147_483_647;

function resolveSeed(): number {
  const raw = process.env[SEED_ENV];
  const inCI = process.env.CI !== undefined && process.env.CI !== "";

  if (raw === undefined || raw === "") {
    if (inCI) {
      throw new Error(
        `${SEED_ENV} is not set. Cadenza's CI runs the suite twice per matrix ` +
          `cell with two distinct explicit seeds (the double-green rule, ` +
          `DECISIONS.md D-0006); an implicit seed cannot be replayed. Set ` +
          `${SEED_ENV} to a non-negative integer.`,
      );
    }
    // Local default. Vitest's own default seed is also time-derived; the point
    // of computing it here is that the value is printed below, so a local
    // ordering failure is replayable from the terminal scrollback.
    return Date.now() % SEED_MAX;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${SEED_ENV} must be a non-negative integer, got ${JSON.stringify(raw)}.`);
  }
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed > SEED_MAX) {
    throw new Error(`${SEED_ENV} must be a non-negative integer <= ${SEED_MAX}, got ${raw}.`);
  }
  return seed;
}

const seed = resolveSeed();

// Printed on success as well as failure: the seed of a *green* run is what a
// later bisect needs in order to reproduce the order that was green.
// ASCII-only -- this line is emitted on the Windows cell too, where the console
// is cp932 and a non-encodable character would crash the writer rather than
// print badly (CLAUDE.md's CLI output rule, DECISIONS.md D-0007).
process.stderr.write(`cadenza: test order seed = ${seed} (${SEED_ENV})\n`);

export default defineConfig({
  test: {
    // `test/`, not `tests/`. The Python suite lives in `tests/` and is still the
    // specification this port is measured against; the two directory names are
    // one character apart on purpose-free grounds, so the glob is anchored
    // rather than left to a recursive search that could pick up either.
    include: ["test/**/*.test.ts"],
    environment: "node",

    // Fail closed on an empty selection: a glob that stops matching must not
    // read as "everything passed".
    passWithNoTests: false,

    // No retries, ever. A test that passes on the second attempt under a
    // shuffled order is exactly the signal the double-green rule exists to
    // catch; retrying would erase it.
    retry: 0,

    // Explicit imports from "vitest" rather than injected globals.
    globals: false,

    // Vitest's default is 5s, and that is a statement about how fast the
    // machine is, not about whether the code is correct. Every case in this
    // suite is pure in-process computation over a few hundred bytes -- the
    // slowest thing any of them does is read one committed JSON vector -- so
    // 10s is several orders of magnitude above the work and still far below a
    // hang.
    //
    // The number is a floor under runner variance, not a budget to grow into.
    // If a future belt needs it raised, the cap is not the fix (the discipline
    // continuo records as its D-0029): find what got expensive.
    testTimeout: 10_000,
    hookTimeout: 10_000,

    sequence: {
      // Both axes: file order and, within a file, test order.
      shuffle: { files: true, tests: true },
      // Order is shuffled, but tests do not run concurrently *within* a file.
      // Concurrency is a separate property from ordering and is not being
      // introduced blind into a suite translated from one that never had it.
      concurrent: false,
      seed,
    },

    // Each test file gets its own worker and therefore its own module registry.
    isolate: true,
  },
});
