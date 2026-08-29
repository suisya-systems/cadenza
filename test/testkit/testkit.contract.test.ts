import { afterAll, describe, expect, test } from "vitest";

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
    // Whichever rows have run by the time this case runs, none ran twice and
    // none ran with an unexpected value. That holds under every order, and it
    // is the strongest thing a *test* can say here -- the shuffle decides how
    // many rows have run when this one does.
    expect(new Set(observed).size).toBe(observed.length);
    for (const value of observed) {
      expect(["0", "1"]).toContain(value);
    }
  });

  afterAll(() => {
    // The case above is green on an EMPTY `observed`: if `parametrize` still
    // registered both tests but stopped calling `body`, nothing would run, the
    // set would be empty, and both of its assertions would pass over nothing.
    // Every assertion inside every parametrized translation would have been
    // silently removed, and this contract -- the one the ledger's correctness
    // rests on -- would not have noticed.
    //
    // `afterAll` is what closes it, and it is the order-independent place to do
    // so: it runs after every case in this file, so both rows have run whatever
    // order the shuffle chose. Sorted, because the shuffle decides which ran
    // first.
    expect([...observed].sort()).toEqual(["0", "1"]);
  });
});
