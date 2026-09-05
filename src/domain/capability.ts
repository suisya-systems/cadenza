/**
 * Capability keys, the versioned vocabulary a grant is closed over, and the
 * canonical form a key set takes before it is digested.
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
 *
 * The three refusals at the foot of the file were `delegationContract`'s
 * module-private helpers until the agent-type record (D-0034) needed the same
 * three rules over the same vocabulary. They moved here rather than being
 * written a second time, for the reason `src/domain/digest.ts` gives about the
 * `sha256:` framing: a second implementation is a second thing that can drift,
 * and two callers disagreeing about which key is in version 1 would be a
 * disagreement about how much authority a run holds. `delegationContract()`
 * remains the only place that runs the whole section 5 sequence; what lives
 * here is three of its rules, not the sequence.
 */
import { compareByCodePoint } from "./canonical-json.js";
import {
  OverlappingCapabilityError,
  UnknownCapabilityError,
  UnknownVocabularyVersionError,
} from "./errors.js";
import { frozenSet } from "./frozen.js";
import { escapeNonAscii, pythonAscii, pythonTypeName } from "./python-text.js";

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

/**
 * Rule 1 of the design document's section 5 table, and rule 1 of D-0034's.
 *
 * A version this build does not know refuses the whole value, contract or
 * agent-type record alike: a key list read against a vocabulary this process
 * cannot see is a grant nobody here can bound.
 */
export function requireKnownVocabularyVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !KNOWN_VOCABULARY_VERSIONS.has(value)
  ) {
    throw new UnknownVocabularyVersionError(
      `vocabulary_version ${describe(value)} is not a capability vocabulary this build knows: ` +
        `expected one of ${known(KNOWN_VOCABULARY_VERSIONS)}`,
    );
  }
  return value;
}

/**
 * Rule 2, plus the canonical form.
 *
 * A key is checked against the vocabulary the caller **pinned**, never the
 * newest this build knows: a value that gained meaning it did not have when it
 * was written is the drift D-0026 section 1 refuses. The refusal names the
 * version for that reason -- "unknown capability" on its own sends the reader
 * hunting for a typo when the fault is a version pinned one too low.
 */
export function canonicalCapabilityKeys(
  values: readonly string[],
  field: string,
  version: number,
  vocabulary: ReadonlySet<string>,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new UnknownCapabilityError(
      `${field} must be a list of capability keys, got ${pythonTypeName(values)}`,
    );
  }
  for (const value of values) {
    if (!isCapabilityKey(value) || !vocabulary.has(value)) {
      throw new UnknownCapabilityError(
        `${field} names ${describe(value)}, which is not a capability in vocabulary ` +
          `version ${version}` +
          (typeof value === "string" && value.length > MAX_CAPABILITY_KEY_LENGTH
            ? " (and is longer than a capability key may be)"
            : ""),
      );
    }
  }
  // Sorted and de-duplicated, so two generators that mean the same grant produce
  // the same value and therefore the same digest (design document section 4).
  return Object.freeze([...new Set(values)].sort(compareByCodePoint));
}

/**
 * Rule 3. An overlap is the one shape that would leave an action classifiable
 * two ways, and refusing beats inventing a precedence at classification time --
 * the move G1 section 5.4 makes for a colliding namespace.
 */
export function refuseCapabilityOverlap(
  granted: readonly string[],
  askable: readonly string[],
): void {
  const asked = new Set(askable);
  // `granted` is already in code-point order, so the key named is a function of
  // the value rather than of the order the caller wrote its lists in.
  for (const key of granted) {
    if (asked.has(key)) {
      throw new OverlappingCapabilityError(
        `capability ${pythonAscii(key)} is both granted and askable: the two sets are disjoint`,
      );
    }
  }
}

/**
 * A value in a refusal message: quoted if it is a string, named if it is not.
 *
 * Both branches escape. A non-string is reached only from a JavaScript caller or
 * a cast, and `String(value)` on one can still carry any text at all --
 * `Symbol("\u30c6")` stringifies to `Symbol(\u30c6)` -- so the branch that
 * exists for malformed input is exactly the branch that must not be the one that
 * puts non-ASCII on a cp932 console (D-0007).
 */
export function describe(value: unknown): string {
  return typeof value === "string" ? pythonAscii(value) : escapeNonAscii(String(value));
}

function known(versions: ReadonlySet<number>): string {
  return [...versions]
    .sort((left, right) => left - right)
    .map((version) => String(version))
    .join(", ");
}
