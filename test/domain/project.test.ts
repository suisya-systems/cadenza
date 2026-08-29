/**
 * `project()`'s snapshot guarantee.
 *
 * **Target-only**: `tests/test_digest.py` has nothing to say about this, because
 * in Python there is nothing to say. `Project.aliases` is a `tuple`, and a
 * `tuple` cannot be mutated by anyone, ever. The guarantee is free there and is
 * not free here, so it is asserted here.
 *
 * It matters because `configDigest` is persisted (design doc section 4): a
 * digest that changed when a caller pushed to an array it still held would be
 * indistinguishable, to a later audit, from a catalog that had been edited.
 */
import { describe, expect, test } from "vitest";

import { gitUrlSource } from "../../src/domain/clone-source.js";
import { configDigest } from "../../src/domain/digest.js";
import { project } from "../../src/domain/project.js";

const SOURCE = gitUrlSource("https://example.invalid/org/web.git");

describe("project", () => {
  test("snapshots the aliases it is given", () => {
    // `readonly string[]` is a compile-time claim: a mutable array is
    // assignable to it, so this is what a caller can actually do.
    const mutable = ["site", "frontend"];
    const value = project("web", mutable, SOURCE, "main");
    const before = configDigest(value);

    mutable.push("www");

    expect(value.aliases).toEqual(["site", "frontend"]);
    expect(configDigest(value)).toBe(before);
  });

  test("freezes what it returns, so a cast cannot reach past readonly", () => {
    const value = project("web", ["site"], SOURCE, "main");
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.aliases)).toBe(true);
    expect(Object.isFrozen(value.source)).toBe(true);
    // In a module (always strict mode), writing to a frozen object throws
    // rather than failing silently -- which is the half of the guarantee that
    // `Object.isFrozen` alone does not demonstrate.
    expect(() => {
      (value.aliases as string[]).push("www");
    }).toThrow(TypeError);
  });
});
