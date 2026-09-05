/**
 * Issue a successor **under a human decision**, or refuse.
 *
 * `docs/design/operating-surface.md` section 4.3, taken as D-0036 rows `S-1`
 * (option b) and `S-3`. rondo D-0009 part 2 makes the operating surface the
 * issuer of a widening successor; until now that rule held by *omission* --
 * rondo imports neither `delegate` nor `adopt`, so it cannot issue one at all --
 * and the first widening would therefore have been written under deadline, in
 * rondo, where D-0009 part 2 is prose. This function is where it can be written
 * instead.
 *
 * **Why this is a new function rather than a check inside `adopt()`.** `adopt`
 * is also the initial-adoption path and is on the exported surface, so a check
 * added there changes every existing caller; it is left byte-identical, which is
 * row `S-3`. Putting the rule here keeps `domain/` free of a port-shaped
 * argument and makes the rule opt-in at the call site -- which is what lets a
 * consumer adopt it in one commit rather than as a breaking change. The
 * alternative was recorded because rondo D-0009's falsifier names `adopt()`
 * literally; D-0036 takes the composed helper and says why.
 *
 * **The grade of the guarantee, stated rather than implied.** These four checks
 * are not authentication and **cannot detect a fabricated record**: a caller
 * that composes a `HumanDecisionRecord` naming the successor it wants and its
 * own identity passes all four, exactly as a caller supplying any `issuer` does
 * today. cadenza mints no identity and persists nothing (D-0026 section 2). What
 * they buy is four classes of silent error closed -- the successor issued is the
 * successor approved, a denial cannot be spent as an approval, the decision's
 * predecessor and the contract's lineage cannot disagree, and the surface named
 * on the contract and on the decision cannot differ. That is the same grade as
 * the self-issue refusal, and D-0036 claims it at that grade and no higher. In
 * particular this does **not** fire rondo D-0009's falsifier, which asks for an
 * issuer-*authority* check.
 *
 * **What is not enforced here, and where it lives.** One decision authorises at
 * most one issuance. That duty is *consumption*, it needs durability, and
 * cadenza persists nothing -- so `decisionId` is carried, checked for shape, and
 * never consulted, and single use is the store's (`operating-surface.md` section
 * 7, row `S-7`, rondo's).
 */
import {
  type DelegationContract,
  type DelegationContractInput,
  delegationContract,
} from "../domain/contract.js";
import { contractDigest } from "../domain/contract-digest.js";
import { DecisionMismatchError, UnapprovedDecisionError } from "../domain/errors.js";
import { pythonAscii } from "../domain/python-text.js";
import { adopt } from "../domain/supersession.js";
import { type HumanDecisionRecord, humanDecisionRecord } from "../ports/human-decision.js";

/**
 * Compose the successor `input` describes, check it against `decision`, and
 * adopt it over `current`.
 *
 * The order is fixed and observable, and it is section 4.3's: the decision
 * record is validated first (it is the argument whose shape nothing else
 * checks), the successor is composed -- `delegationContract()` remains the only
 * constructor and applies every issue-time rule -- and then the four refusals
 * run in the order below, before `adopt()` applies lineage, grantee and project
 * unchanged.
 *
 * Check 3 is the one that carries the weight. It is what makes `approved` a
 * binding rather than a label, and it is why replaying a decision inside a
 * lineage buys nothing: the digest names one contract, and `adopt` refuses that
 * contract a second time once `current` has moved past it.
 */
export function supersedeOnDecision(
  current: DelegationContract | null,
  input: DelegationContractInput,
  decision: HumanDecisionRecord,
): DelegationContract {
  const record = humanDecisionRecord(decision);
  const next = delegationContract(input);

  // 1. A refusal record authorises nothing. Without this check the same value
  //    that records a denial would issue the widening it denied.
  if (record.outcome !== "approved") {
    throw new UnapprovedDecisionError(
      `decision ${pythonAscii(record.decisionId)} records ${pythonAscii(record.outcome)}, ` +
        "so it authorises no successor",
    );
  }

  // 2. The decision was taken about a run holding a particular contract, or
  //    holding none. A decision over one lineage cannot be spent on another.
  const currentDigest = current === null ? null : contractDigest(current);
  if (record.predecessor !== currentDigest) {
    throw new DecisionMismatchError(
      `decision ${pythonAscii(record.decisionId)} replaces ` +
        `${record.predecessor === null ? "no predecessor" : pythonAscii(record.predecessor)}, ` +
        `but the run holds ${currentDigest === null ? "none" : pythonAscii(currentDigest)}`,
    );
  }

  // 3. The successor issued is the successor approved, byte for byte through
  //    their digests, so a widening cannot grow between the screen and the call.
  const successorDigest = contractDigest(next);
  if (successorDigest !== record.approved) {
    throw new DecisionMismatchError(
      `decision ${pythonAscii(record.decisionId)} approved ${pythonAscii(record.approved)}, ` +
        `but the successor composed here is ${pythonAscii(successorDigest)}`,
    );
  }

  // 4. The surface named on the contract and the surface named on the decision
  //    cannot differ: `recordedBy` is the issuer D-0009 part 2 asks for.
  if (next.issuer !== record.recordedBy) {
    throw new DecisionMismatchError(
      `successor is issued by ${pythonAscii(next.issuer)}, but decision ` +
        `${pythonAscii(record.decisionId)} was recorded by ${pythonAscii(record.recordedBy)}`,
    );
  }

  return adopt(current, next);
}
