/**
 * Capability keys and the versioned vocabulary a grant is closed over.
 *
 * `docs/design/g2-delegation-contract.md` section 3, implementing DECISIONS.md
 * D-0027. Nothing here decides anything: the key shape, the versioning rule and
 * version 1's members are that entry's, taken at the human gate, and this module
 * is where they become checkable.
 *
 * Two properties are easy to lose by accident and are therefore spelled out in
 * code rather than left to the reader:
 *
 *  - **Recognition is exact string equality.** The dot is a naming convention.
 *    There is no prefix match, no hierarchy and no wildcard, because `repo.*`
 *    would be an open set and the grant is closed (D-0026 section 1). No
 *    function here takes a prefix, and none should be added.
 *  - **A key is read against the version the contract pinned**, never against
 *    the newest this build knows. {@link vocabularyFor} is therefore the only
 *    way in, and it takes the version as an argument rather than defaulting to
 *    one.
 */
import { frozenSet } from "./frozen.js";

/**
 * `<subject>.<action>`: exactly two lowercase segments, one dot.
 *
 * Anchored with `^`/`$` and no `m` flag, which is Python's `\A`/`\Z` rather than
 * Python's `$` -- the trap `docs/porting.md` section 7 records for
 * `IDENTIFIER_PATTERN`, and the same answer: a trailing newline must not slip
 * through as a capability key.
 */
export const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** D-0027 section 1. Counted in code points, which for this shape is bytes. */
export const MAX_CAPABILITY_KEY_LENGTH = 64;

/**
 * Version 1, exactly (D-0027 section 3).
 *
 * `command.run` names the execution and never an effect: an action that pushes a
 * branch by running a command performs two acts this set names, and carries both
 * keys. That is the classifier's business (section 7 of the design document);
 * what matters here is that the set is what the entry says it is, and that it is
 * a `frozenSet` rather than a `ReadonlySet` -- a compile-time claim would leave
 * `VOCABULARY_VERSION_1.add("network.fetch")` reachable from the package's
 * public surface, which is the failure D-0015 records for the G1 constants and
 * would silently widen every contract pinned at version 1.
 */
export const VOCABULARY_VERSION_1: ReadonlySet<string> = frozenSet([
  "branch.push",
  "command.run",
  "commit.create",
  "delegation.issue",
  "pull_request.create",
  "repo.clone",
  "worktree.write",
]);

/** The vocabulary versions this build knows, for a refusal to name (D-0027 section 2). */
export const KNOWN_VOCABULARY_VERSIONS: ReadonlySet<number> = frozenSet([1]);

/** True if `value` is a well-formed capability key, whatever any vocabulary holds. */
export function isCapabilityKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_CAPABILITY_KEY_LENGTH &&
    CAPABILITY_KEY_PATTERN.test(value)
  );
}

/**
 * The key set for `version`, or `null` if this build does not know that version.
 *
 * `null` rather than a throw: the caller is validating a contract and turns this
 * into a named refusal with the version in it, and a build that knew a version
 * would not want the lookup to be the thing that reports it.
 *
 * Versions are cumulative (D-0027 section 2): version `n+1` contains every key of
 * version `n` with the same meaning. The switch keeps that visible -- a new
 * version is written as its predecessor plus what it adds, and
 * `test/domain/capability.test.ts` fails if a later one ever drops a key.
 */
export function vocabularyFor(version: number): ReadonlySet<string> | null {
  if (version === 1) {
    return VOCABULARY_VERSION_1;
  }
  return null;
}
