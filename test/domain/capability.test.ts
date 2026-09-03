/**
 * The capability vocabulary's own contract.
 *
 * **Target-only**: there is no Python G2 and none is coming (#25), so no case
 * here translates a source case; `parity/target-only.json` records the file as
 * such.
 *
 * What is asserted is what DECISIONS.md D-0027 fixed and what would be easy to
 * lose later: the key shape, that recognition is exact equality rather than a
 * prefix, that version 1 is *exactly* seven keys, and that the set cannot be
 * added to at runtime. The last one matters because a `ReadonlySet` is a
 * compile-time claim and `Object.freeze` does nothing to a `Set`'s internal
 * slots (D-0015): `VOCABULARY_VERSION_1.add("network.fetch")` would otherwise
 * widen every contract pinned at version 1, at an unchanged digest.
 */
import { describe, expect, test } from "vitest";

import {
  CAPABILITY_KEY_PATTERN,
  isCapabilityKey,
  KNOWN_VOCABULARY_VERSIONS,
  MAX_CAPABILITY_KEY_LENGTH,
  VOCABULARY_VERSION_1,
  vocabularyFor,
} from "../../src/domain/capability.js";
import { parametrize } from "../testkit/parametrize.js";

describe("isCapabilityKey", () => {
  parametrize<string>(
    "accepts",
    [
      ["two-segments", "repo.clone"],
      ["underscore-in-subject", "pull_request.create"],
      ["underscore-in-action", "worktree.write_all"],
      ["digits", "repo2.clone9"],
      ["max-length", `${"a".repeat(31)}.${"b".repeat(32)}`],
    ],
    (value) => {
      expect(isCapabilityKey(value)).toBe(true);
      expect(value.length).toBeLessThanOrEqual(MAX_CAPABILITY_KEY_LENGTH);
    },
  );

  parametrize<string>(
    "refuses",
    [
      ["one-segment", "clone"],
      ["three-segments", "repo.clone.fast"],
      ["trailing-dot", "repo."],
      ["leading-dot", ".clone"],
      ["empty", ""],
      ["uppercase", "Repo.clone"],
      ["hyphen", "pull-request.create"],
      ["leading-digit", "2repo.clone"],
      ["space", "repo clone"],
      ["wildcard", "repo.*"],
      // Python's `$` matches before a trailing newline and this pattern must
      // not: a key with a newline in it would be a key nobody could type back.
      ["trailing-newline", "repo.clone\n"],
      ["over-length", `${"a".repeat(32)}.${"b".repeat(32)}`],
    ],
    (value) => {
      expect(isCapabilityKey(value)).toBe(false);
    },
  );

  test("refuses a value that is not a string", () => {
    expect(isCapabilityKey(undefined)).toBe(false);
    expect(isCapabilityKey(null)).toBe(false);
    expect(isCapabilityKey(1)).toBe(false);
    expect(isCapabilityKey(["repo.clone"])).toBe(false);
  });

  test("has no m flag, so the anchors mean what Python's \\A and \\Z mean", () => {
    expect(CAPABILITY_KEY_PATTERN.flags).toBe("");
  });
});

describe("vocabularyFor", () => {
  test("version 1 is exactly the seven keys D-0027 fixed", () => {
    // Written as the whole set rather than seven `has` calls: an eighth key
    // added without an entry is the failure this case exists to catch, and a
    // membership check would not see it.
    expect([...VOCABULARY_VERSION_1].sort()).toEqual([
      "branch.push",
      "command.run",
      "commit.create",
      "delegation.issue",
      "pull_request.create",
      "repo.clone",
      "worktree.write",
    ]);
    expect(vocabularyFor(1)).toBe(VOCABULARY_VERSION_1);
  });

  test("every key in every known version is a well-formed key", () => {
    for (const version of KNOWN_VOCABULARY_VERSIONS) {
      const vocabulary = vocabularyFor(version) as ReadonlySet<string>;
      for (const key of vocabulary) {
        expect(isCapabilityKey(key)).toBe(true);
      }
    }
  });

  test("versions are cumulative: each known version contains its predecessor", () => {
    // Vacuous while there is one version, and deliberately written now: the
    // append-only rule (D-0027 section 2) is easiest to break on the day a
    // second version is added, which is exactly when this stops being vacuous.
    const versions = [...KNOWN_VOCABULARY_VERSIONS].sort((left, right) => left - right);
    for (let index = 1; index < versions.length; index += 1) {
      const earlier = vocabularyFor(versions[index - 1] as number) as ReadonlySet<string>;
      const later = vocabularyFor(versions[index] as number) as ReadonlySet<string>;
      for (const key of earlier) {
        expect(later.has(key)).toBe(true);
      }
    }
  });

  test("returns null for a version this build does not know", () => {
    expect(vocabularyFor(0)).toBeNull();
    expect(vocabularyFor(2)).toBeNull();
    expect(vocabularyFor(-1)).toBeNull();
    expect(vocabularyFor(1.5)).toBeNull();
  });

  test("matches by equality, never by prefix", () => {
    // The dot is a naming convention (D-0027 section 1). If anything ever
    // matched by prefix, `repo` and `repo.clone.fast` would start resolving,
    // and a closed grant would have an open member.
    expect(VOCABULARY_VERSION_1.has("repo")).toBe(false);
    expect(VOCABULARY_VERSION_1.has("repo.")).toBe(false);
    expect(VOCABULARY_VERSION_1.has("repo.clone.fast")).toBe(false);
    expect(VOCABULARY_VERSION_1.has("repo.clone ")).toBe(false);
  });

  test("the vocabulary cannot be added to at runtime", () => {
    // In a module (always strict mode) the frozen mutator throws rather than
    // failing silently, which is the half `Object.isFrozen` does not show.
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).add("network.fetch")).toThrow(TypeError);
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).delete("repo.clone")).toThrow(TypeError);
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).clear()).toThrow(TypeError);
    expect(VOCABULARY_VERSION_1.has("network.fetch")).toBe(false);
    expect(VOCABULARY_VERSION_1.size).toBe(7);
  });

  test("the known-version set cannot be added to either", () => {
    expect(() => (KNOWN_VOCABULARY_VERSIONS as Set<number>).add(2)).toThrow(TypeError);
    expect([...KNOWN_VOCABULARY_VERSIONS]).toEqual([1]);
  });
});
