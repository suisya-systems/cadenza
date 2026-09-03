/**
 * The classifier: total, three-valued, and staleness first.
 *
 * `docs/design/g2-delegation-contract.md` section 7, against D-0026 section 3.
 *
 * Two properties carry this module, and both are properties of what it does
 * *not* do:
 *
 *  - **It is total.** Every input produces one of three outcomes and none
 *    produces a throw. That is why the caller's keys, run id and digest are
 *    compared rather than validated: a classifier that threw on some inputs
 *    would have a fourth state, spelled as an exception, and "no rule anywhere
 *    turns not-classified into allowed" (D-0026 section 3) would depend on
 *    whoever caught it.
 *  - **It decides nothing else.** It does not stop an action, does not consult a
 *    clock, does not know what the action really is. Cadenza classifies and the
 *    control plane enforces (D-0026 section 2), so a system that asks and then
 *    ignores the answer is not defended against here.
 */

import { compareByCodePoint } from "./canonical-json.js";
import { vocabularyFor } from "./capability.js";
import type { DelegationContract } from "./contract.js";
import { contractDigest } from "./contract-digest.js";

/** The three values, and there is no fourth (D-0026 section 3). */
export type Outcome = "allowed" | "needs_approval" | "refused";

/** Why the outcome is what it is. Each names one row of the design document's tables. */
export type ClassificationReason =
  | "stale_subject"
  | "grantee_mismatch"
  | "no_capability"
  | "unknown_capability"
  | "granted"
  | "askable"
  | "not_in_contract";

/** What a run intends to do, named in capability keys (design document section 7). */
export interface IntendedAction {
  /**
   * Every key whose act the action performs -- a command that pushes a branch
   * names both `command.run` and `branch.push` (D-0027 section 3). Order and
   * repetition are not semantics.
   */
  readonly capabilities: readonly string[];
}

/**
 * What only the caller can supply.
 *
 * The run presenting the contract, and the subject's `config_digest` **now**.
 * Cadenza mints no identity and reads no catalog (D-0026 section 2), so both
 * arrive from outside or the question cannot be asked at all.
 */
export interface ClassificationContext {
  readonly runId: string;
  readonly configDigest: string;
}

/** An answer, carrying the contract it was made under (D-0026 section 3). */
export interface Classification {
  readonly outcome: Outcome;
  readonly reason: ClassificationReason;
  readonly contractDigest: string;
}

/** `refused` beats `needs_approval` beats `allowed` (design document section 7.1). */
const STRICTNESS: Readonly<Record<Outcome, number>> = Object.freeze({
  allowed: 0,
  needs_approval: 1,
  refused: 2,
});

/**
 * Classify one intended action against one contract.
 *
 * The order is the design document's, and staleness is first because D-0026
 * section 3 puts it there: it is checked before the grant is consulted at all,
 * so totality does not depend on an implementation deciding whether a stale
 * contract refuses or asks.
 */
export function classify(
  contract: DelegationContract,
  action: IntendedAction,
  context: ClassificationContext,
): Classification {
  // The contract's provenance is the one thing this function refuses to guess
  // about: a value that never came from `delegationContract` has been through
  // no validation, and classifying it would be classifying against the invalid
  // contract the design document says cannot exist (section 4). Totality is a
  // claim about the *action* and the *context*, which are arbitrary caller
  // input; the contract is a value this package built.
  //
  // The check is `contractDigest`'s, not a second one here. Every answer has to
  // carry the digest (D-0026 section 3), so the digest is computed before
  // anything is decided -- which means the provenance gate is already passed
  // before the first rule runs, and a second call would be a guard no test could
  // distinguish from its own absence.
  const digest = contractDigest(contract);
  const valid = contract;

  if (context?.configDigest !== valid.configDigest) {
    return answer("refused", "stale_subject", digest);
  }
  if (context.runId !== valid.grantee) {
    return answer("refused", "grantee_mismatch", digest);
  }

  // Only an array is a set of keys. Anything else -- a bare string, an object,
  // nothing at all -- names no capability, and an action that names none is one
  // nobody said anything about: "absent means not granted" (D-0026 section 1)
  // reads the same on the action side as on the grant's.
  if (!Array.isArray(action?.capabilities) || action.capabilities.length === 0) {
    return answer("refused", "no_capability", digest);
  }

  const vocabulary = vocabularyFor(valid.vocabularyVersion) as ReadonlySet<string>;
  const granted = new Set(valid.granted);
  const askable = new Set(valid.askable);

  let outcome: Outcome = "allowed";
  let reason: ClassificationReason = "granted";
  // Sorted, so the reported reason is a function of the action's set rather than
  // of the order the caller wrote it in.
  for (const key of [...action.capabilities].sort(compareKeys)) {
    const [keyOutcome, keyReason] = classifyKey(key, vocabulary, granted, askable);
    if (STRICTNESS[keyOutcome] > STRICTNESS[outcome]) {
      outcome = keyOutcome;
      reason = keyReason;
    }
  }
  // The initial `allowed`/`granted` above is only reported when every key was
  // granted, because the loop runs at least once: the empty set left earlier.
  return answer(outcome, reason, digest);
}

/**
 * The collation the reason's determinism rests on, made total.
 *
 * `compareByCodePoint` is the collation used everywhere a set of strings is
 * ordered stably here, and it is the right one for keys -- but it takes strings,
 * and this list is arbitrary caller input. Handing it a `null` throws inside
 * `Array.from`, which is a fourth state wearing an exception; the property sweep
 * in `test/domain/classification.test.ts` found exactly that. Non-strings sort
 * after strings and keep their relative order, which costs nothing in
 * determinism: every non-string classifies `unknown_capability`, so which of
 * them is reported cannot differ.
 */
function compareKeys(left: unknown, right: unknown): number {
  const leftIsString = typeof left === "string";
  const rightIsString = typeof right === "string";
  if (leftIsString && rightIsString) {
    return compareByCodePoint(left, right);
  }
  if (leftIsString) {
    return -1;
  }
  if (rightIsString) {
    return 1;
  }
  return 0;
}

/**
 * One key, against the version the contract pinned.
 *
 * `Set.has` on a non-string simply answers false, which is what makes the
 * unknown-key row total: a caller reaching past the types with a number or a
 * symbol gets `refused`, not a crash.
 */
function classifyKey(
  key: string,
  vocabulary: ReadonlySet<string>,
  granted: ReadonlySet<string>,
  askable: ReadonlySet<string>,
): readonly [Outcome, ClassificationReason] {
  if (!vocabulary.has(key)) {
    return ["refused", "unknown_capability"];
  }
  if (granted.has(key)) {
    return ["allowed", "granted"];
  }
  if (askable.has(key)) {
    return ["needs_approval", "askable"];
  }
  // In neither set: refused outright and not escalatable, which is what stops a
  // run escalating its way toward arbitrary authority (D-0026 section 3).
  return ["refused", "not_in_contract"];
}

/** Frozen for the reason every value here is (D-0015): an answer is reported, not edited. */
function answer(
  outcome: Outcome,
  reason: ClassificationReason,
  contractDigest: string,
): Classification {
  return Object.freeze({ outcome, reason, contractDigest });
}
