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
 *
 * D-0037 adds version 2, and with it the cases that were vacuous while there was
 * one version: that a later version contains its predecessor, and that what
 * version 2 adds is *added* rather than moved -- a key that appeared in version 1
 * instead would widen every contract already issued, which is the one thing the
 * cumulative rule is written to prevent.
 */
import { describe, expect, test } from "vitest";

import {
  CAPABILITY_KEY_PATTERN,
  isCapabilityKey,
  KNOWN_VOCABULARY_VERSIONS,
  MAX_CAPABILITY_KEY_LENGTH,
  VOCABULARY_VERSION_1,
  VOCABULARY_VERSION_2,
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

  test("version 2 is exactly version 1 plus the five keys D-0037 added", () => {
    expect([...VOCABULARY_VERSION_2].sort()).toEqual([
      "branch.push",
      "command.run",
      "commit.create",
      "delegation.issue",
      "issue.comment",
      "issue.create",
      "network.fetch",
      "pull_request.create",
      "pull_request.merge",
      "repo.clone",
      "review.submit",
      "worktree.write",
    ]);
    expect(vocabularyFor(2)).toBe(VOCABULARY_VERSION_2);
  });

  test("what version 2 adds is added, never moved into version 1", () => {
    // The failure this catches is not a typo, it is the one edit the cumulative
    // rule exists to prevent: a key written into version 1 instead of version 2
    // widens every contract already issued at version 1, at an unchanged digest
    // (D-0027 section 2). The set difference is asserted in both directions so
    // that neither a key appearing early nor a key quietly disappearing from
    // version 2 can pass.
    const added = [...VOCABULARY_VERSION_2].filter((key) => !VOCABULARY_VERSION_1.has(key)).sort();
    expect(added).toEqual([
      "issue.comment",
      "issue.create",
      "network.fetch",
      "pull_request.merge",
      "review.submit",
    ]);
    for (const key of added) {
      expect(VOCABULARY_VERSION_1.has(key)).toBe(false);
    }
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
    // Written while there was one version and vacuous then; D-0037 added the
    // second, so it now measures something. It stays written as a loop over
    // `KNOWN_VOCABULARY_VERSIONS` rather than as one version-2-against-version-1
    // assertion, because the day it matters again is the day a version 3 is
    // added, and a hard-coded pair would be vacuous once more.
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
    expect(vocabularyFor(3)).toBeNull();
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
    //
    // `network.fetch` is the mutation written here because it is no longer a
    // made-up key: D-0037 made it a real member of version 2, so this is a
    // spelling somebody could reach for by accident, and what it would do is
    // grant the whole network under every contract issued before the key
    // existed, at an unchanged digest.
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).add("network.fetch")).toThrow(TypeError);
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).delete("repo.clone")).toThrow(TypeError);
    expect(() => (VOCABULARY_VERSION_1 as Set<string>).clear()).toThrow(TypeError);
    expect(VOCABULARY_VERSION_1.has("network.fetch")).toBe(false);
    expect(VOCABULARY_VERSION_1.size).toBe(7);
  });

  test("version 2's set cannot be added to at runtime either", () => {
    // Version 2 is built by spreading version 1, and a spread produces a plain
    // `Set`. If `frozenSet` were dropped from that expression the type would
    // still check, because `ReadonlySet` is a compile-time claim (D-0015), and
    // nothing but this case would notice.
    expect(() => (VOCABULARY_VERSION_2 as Set<string>).add("deploy.run")).toThrow(TypeError);
    expect(() => (VOCABULARY_VERSION_2 as Set<string>).delete("pull_request.merge")).toThrow(
      TypeError,
    );
    expect(() => (VOCABULARY_VERSION_2 as Set<string>).clear()).toThrow(TypeError);
    expect(VOCABULARY_VERSION_2.has("deploy.run")).toBe(false);
    expect(VOCABULARY_VERSION_2.size).toBe(12);
  });

  test("the known-version set cannot be added to either", () => {
    expect(() => (KNOWN_VOCABULARY_VERSIONS as Set<number>).add(3)).toThrow(TypeError);
    expect([...KNOWN_VOCABULARY_VERSIONS]).toEqual([1, 2]);
  });
});
