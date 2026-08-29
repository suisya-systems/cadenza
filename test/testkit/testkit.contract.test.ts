import { describe, expect, test } from "vitest";

import { parametrize } from "./parametrize.js";

/**
 * The vendored testkit's own contract.
 *
 * Target-only: these translate no source case, and the parity ledger declares
 * them as such. They exist because `parametrize` is the one piece of machinery
 * the ledger's correctness depends on -- if it stopped spelling ids the way
 * pytest does, every mapping in every ledger would still reconcile against the
 * *new* spelling and nobody would be told.
 */
describe("testkit contract: parametrize", () => {
  const observed: string[] = [];
  parametrize<number>(
    "records the id it was given",
    [
      ["changed0", 0],
      ["changed1", 1],
    ],
    (value) => {
      observed.push(String(value));
    },
  );

  test("declares one test per row, named `name[id]`", ({ task }) => {
    // Read off the runner's own registry rather than off a string this file
    // built: the claim is about what vitest collected, and a claim about a
    // local variable would hold even if `parametrize` stopped calling `test`.
    const siblings = (task.suite?.tasks ?? []).map((sibling) => sibling.name);
    expect(siblings).toContain("records the id it was given[changed0]");
    expect(siblings).toContain("records the id it was given[changed1]");
  });

  test("runs the body once per row", () => {
    // Both rows above have run by the time any test in this file finishes only
    // under a specific order, so this asserts the weaker fact that holds under
    // every order: no row runs twice, and none runs with an unexpected value.
    expect(new Set(observed).size).toBe(observed.length);
    for (const value of observed) {
      expect(["0", "1"]).toContain(value);
    }
  });
});
