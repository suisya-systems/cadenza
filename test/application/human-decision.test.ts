/**
 * `supersedeOnDecision()`: the four refusals, and the price of them (D-0036,
 * rows `S-1` and `S-3`).
 *
 * **Target-only**: there is no Python G2 (#25, D-0032), so no case here
 * translates a source case; `parity/target-only.json` records the file as such.
 *
 * Two things beyond the four refusals are asserted, because both are claims the
 * entry makes rather than properties of the code's shape. `adopt()` keeps every
 * rule it had, which is what row `S-3` means by leaving it byte-identical; and
 * the function **cannot detect a fabricated record**, which is asserted here as
 * a passing case rather than left in prose. A guarantee claimed at the wrong
 * grade is the failure this belt is most exposed to, and a green test naming the
 * hole is what stops a later reader assuming the hole was closed.
 */
import { describe, expect, test } from "vitest";

import { supersedeOnDecision } from "../../src/application/human-decision.js";
import {
  type DelegationContract,
  type DelegationContractInput,
  delegationContract,
} from "../../src/domain/contract.js";
import { contractDigest } from "../../src/domain/contract-digest.js";
import {
  DecisionMismatchError,
  InvalidIdentityError,
  InvalidOutcomeError,
  SupersessionLineageError,
  SupersessionSubjectError,
  UnapprovedDecisionError,
} from "../../src/domain/errors.js";
import { adopt } from "../../src/domain/supersession.js";
import type { HumanDecisionRecord } from "../../src/ports/human-decision.js";
import { refusal } from "../support.js";

const CONFIG_DIGEST = `sha256:${"a1".repeat(32)}`;
const SURFACE = "surface:desk";
const GRANTEE = "run:0f2a";

function inputOf(overrides: Partial<DelegationContractInput> = {}): DelegationContractInput {
  return {
    vocabularyVersion: 1,
    projectId: "cadenza",
    configDigest: CONFIG_DIGEST,
    issuer: SURFACE,
    grantee: GRANTEE,
    granted: ["command.run"],
    askable: ["branch.push"],
    supersedes: null,
    ...overrides,
  };
}

/** The contract a run already holds, issued by the surface, before any widening. */
function heldContract(): DelegationContract {
  return delegationContract(inputOf());
}

/** The widening `held` is superseded by: one more granted key. */
function wideningOf(held: DelegationContract): DelegationContractInput {
  return inputOf({ granted: ["command.run", "worktree.write"], supersedes: contractDigest(held) });
}

function decisionOf(overrides: Partial<HumanDecisionRecord> = {}): HumanDecisionRecord {
  return {
    decisionId: "decision:7f31",
    recordedBy: SURFACE,
    outcome: "approved",
    predecessor: null,
    approved: `sha256:${"b2".repeat(32)}`,
    ...overrides,
  };
}

/**
 * The decision a surface takes after being shown `input`.
 *
 * The digest is computed from the composed contract, which is the consequence
 * section 4.3 tells whoever builds the surface to plan for: the widening must be
 * **composed before it is presented**, because the digest is what is presented.
 */
function decisionFor(
  input: DelegationContractInput,
  predecessor: string | null,
  overrides: Partial<HumanDecisionRecord> = {},
): HumanDecisionRecord {
  return decisionOf({
    predecessor,
    approved: contractDigest(delegationContract(input)),
    ...overrides,
  });
}

describe("a decision that authorises the successor it names", () => {
  test("a widening approved at the surface replaces the contract the run holds", () => {
    const held = heldContract();
    const widening = wideningOf(held);
    const adopted = supersedeOnDecision(
      held,
      widening,
      decisionFor(widening, contractDigest(held)),
    );
    expect(adopted.granted).toEqual(["command.run", "worktree.write"]);
    expect(adopted.supersedes).toBe(contractDigest(held));
    expect(contractDigest(adopted)).toBe(decisionFor(widening, contractDigest(held)).approved);
  });

  test("a decision with no predecessor opens a lineage, as `adopt(null, ...)` does", () => {
    const first = inputOf();
    const adopted = supersedeOnDecision(null, first, decisionFor(first, null));
    expect(adopted.supersedes).toBeNull();
    expect(contractDigest(adopted)).toBe(contractDigest(delegationContract(first)));
  });

  test("the same decision cannot be replayed once the run has moved past it", () => {
    // Not because `decisionId` is consumed -- it is not, and cannot be, since
    // cadenza persists nothing (D-0026 section 2) -- but because the digest
    // names one contract. Replaying inside the lineage buys nothing, and single
    // use is the store's duty (row `S-7`, rondo's).
    const held = heldContract();
    const widening = wideningOf(held);
    const decision = decisionFor(widening, contractDigest(held));
    const adopted = supersedeOnDecision(held, widening, decision);
    refusal(DecisionMismatchError, () => supersedeOnDecision(adopted, widening, decision));
  });
});

describe("the four refusals", () => {
  test("1. a denial cannot be spent as an approval", () => {
    // Without this check the same value that records a denial would issue the
    // widening it denied.
    const held = heldContract();
    const widening = wideningOf(held);
    refusal(UnapprovedDecisionError, () =>
      supersedeOnDecision(
        held,
        widening,
        decisionFor(widening, contractDigest(held), { outcome: "refused" }),
      ),
    );
  });

  test("2. the decision's predecessor and the run's contract cannot disagree", () => {
    const held = heldContract();
    const widening = wideningOf(held);
    // A decision taken about a run that holds nothing, spent on a run that does.
    refusal(DecisionMismatchError, () =>
      supersedeOnDecision(held, widening, decisionFor(widening, null)),
    );
    // And the reverse: a decision over a lineage, spent on a run that holds none.
    const first = inputOf();
    refusal(DecisionMismatchError, () =>
      supersedeOnDecision(null, first, decisionFor(first, contractDigest(held))),
    );
  });

  test("3. the successor issued is the successor approved, byte for byte", () => {
    // The check that carries the weight: it is what makes `approved` a binding
    // rather than a label. The human was shown a two-key widening; the caller
    // issues a three-key one, everything else agreeing.
    const held = heldContract();
    const shown = wideningOf(held);
    const grown = inputOf({
      granted: ["command.run", "worktree.write", "delegation.issue"],
      supersedes: contractDigest(held),
    });
    const decision = decisionFor(shown, contractDigest(held));
    const error = refusal(DecisionMismatchError, () => supersedeOnDecision(held, grown, decision));
    expect(error.message).toContain(decision.approved);
    // The same decision over the contract it was actually taken about is fine,
    // which is what makes this a check on the successor rather than on the shape
    // of the call.
    expect(supersedeOnDecision(held, shown, decision).granted).toEqual([
      "command.run",
      "worktree.write",
    ]);
  });

  test("4. the surface on the contract and the surface on the decision cannot differ", () => {
    const held = heldContract();
    const widening = inputOf({
      granted: ["command.run", "worktree.write"],
      issuer: "loop:conductor",
      supersedes: contractDigest(held),
    });
    refusal(DecisionMismatchError, () =>
      supersedeOnDecision(held, widening, decisionFor(widening, contractDigest(held))),
    );
  });

  test("the record's own shape is checked before anything is composed", () => {
    // The decision is the argument whose shape nothing else checks: an invalid
    // `input` is `delegationContract()`'s to refuse, and an invalid record would
    // otherwise reach the comparisons as a string nobody validated.
    const held = heldContract();
    const widening = wideningOf(held);
    refusal(InvalidOutcomeError, () =>
      supersedeOnDecision(held, widening, {
        ...decisionFor(widening, contractDigest(held)),
        outcome: "withdrawn" as HumanDecisionRecord["outcome"],
      }),
    );
    refusal(InvalidIdentityError, () =>
      supersedeOnDecision(held, widening, {
        ...decisionFor(widening, contractDigest(held)),
        recordedBy: "",
      }),
    );
  });
});

describe("what the function leaves exactly as it was", () => {
  test("`adopt`'s own refusals still apply, unchanged", () => {
    // Row `S-3` leaves `adopt()` byte-identical, so its lineage, grantee and
    // project rules are the ones that run here. A decision cannot buy past any
    // of them: what the human approved is a contract, and a contract that is not
    // a lawful successor is still not one.
    const held = heldContract();
    const forAnother = inputOf({
      grantee: "run:9999",
      granted: ["command.run", "worktree.write"],
      supersedes: contractDigest(held),
    });
    refusal(SupersessionSubjectError, () =>
      supersedeOnDecision(held, forAnother, decisionFor(forAnother, contractDigest(held))),
    );
    const overAnotherProject = inputOf({
      projectId: "rondo",
      granted: ["command.run", "worktree.write"],
      supersedes: contractDigest(held),
    });
    refusal(SupersessionSubjectError, () =>
      supersedeOnDecision(
        held,
        overAnotherProject,
        decisionFor(overAnotherProject, contractDigest(held)),
      ),
    );
    // And a successor whose `supersedes` names nothing, approved as such by a
    // decision that agrees with it, is still refused by `adopt` -- check 2 reads
    // the decision, and this rule reads the contract.
    const orphan = inputOf({ granted: ["command.run", "worktree.write"] });
    refusal(SupersessionLineageError, () =>
      supersedeOnDecision(held, orphan, decisionFor(orphan, contractDigest(held))),
    );
  });

  test("`adopt` itself takes no decision and refuses nothing new", () => {
    // The regression guard for row `S-3`: every existing caller's semantics are
    // identical, so the widening `supersedeOnDecision` refuses without a
    // decision is still adopted by `adopt` on its own.
    const held = heldContract();
    const widened = delegationContract(wideningOf(held));
    expect(adopt(held, widened)).toBe(widened);
  });
});

test("a fabricated decision passes every check, and that is the stated price", () => {
  // D-0036 states this rather than burying it, and asserting it is how the claim
  // stays honest. A caller that composes a record naming the successor it wants
  // and its own identity passes all four checks with no surface having recorded
  // anything -- exactly as a caller supplying any `issuer` does today. cadenza
  // mints no identity and persists nothing, so it cannot tell a record that came
  // from a surface from one that came from a loop. Detecting that needs a
  // provenance this seam does not have, and rondo D-0009's own falsifier
  // (continuo recording an authenticated answerer) is the event that supplies
  // one. Until then, `S-1` is four value checks and is claimed as no more.
  const held = delegationContract(inputOf({ issuer: "loop:conductor" }));
  const selfIssued = inputOf({
    issuer: "loop:conductor",
    granted: ["command.run", "worktree.write", "delegation.issue"],
    supersedes: contractDigest(held),
  });
  const fabricated: HumanDecisionRecord = {
    decisionId: "decision:invented",
    recordedBy: "loop:conductor",
    outcome: "approved",
    predecessor: contractDigest(held),
    approved: contractDigest(delegationContract(selfIssued)),
  };
  expect(supersedeOnDecision(held, selfIssued, fabricated).granted).toContain("delegation.issue");
});
