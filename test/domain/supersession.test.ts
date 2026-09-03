/**
 * `adopt()` and `delegate()`: lineage, the one current contract, and the subset
 * rule in both directions.
 *
 * **Target-only**: there is no Python G2 (#25), so no case here translates a
 * source case; `parity/target-only.json` records the file as such.
 *
 * The cases are written against what each rule is *for* rather than against its
 * shape, because the shapes are small and the reasons are not: "at most one
 * current contract per run" is what makes "under which contract did it do that"
 * answerable, and the subset rule is what stops a run widening itself by
 * delegating to a helper and reading the answer back.
 */
import { describe, expect, test } from "vitest";

import { classify } from "../../src/domain/classification.js";
import { type DelegationContractInput, delegationContract } from "../../src/domain/contract.js";
import { contractDigest } from "../../src/domain/contract-digest.js";
import {
  AmplifiedGrantError,
  ForgedContractError,
  SelfIssuedContractError,
  SupersessionLineageError,
  SupersessionSubjectError,
  UngrantedDelegationError,
} from "../../src/domain/errors.js";
import { adopt, delegate } from "../../src/domain/supersession.js";
import { refusal } from "../support.js";

const CONFIG_DIGEST = `sha256:${"a1".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"b2".repeat(32)}`;
const GRANTEE = "run:0f2a";

function contractOf(overrides: Partial<DelegationContractInput> = {}) {
  return delegationContract({
    vocabularyVersion: 1,
    projectId: "cadenza",
    configDigest: CONFIG_DIGEST,
    issuer: "operator:desk",
    grantee: GRANTEE,
    granted: ["command.run", "worktree.write"],
    askable: ["branch.push"],
    supersedes: null,
    ...overrides,
  });
}

describe("adopt", () => {
  test("a run that holds nothing takes a contract that opens a lineage", () => {
    const first = contractOf();
    expect(adopt(null, first)).toBe(first);
  });

  test("a run that holds nothing refuses a contract claiming a predecessor", () => {
    // The predecessor it names is not the one this run holds, because this run
    // holds none. Accepting it would make the lineage a decoration.
    refusal(SupersessionLineageError, () => adopt(null, contractOf({ supersedes: OTHER_DIGEST })));
  });

  test("a successor that names the current contract's digest replaces it", () => {
    const current = contractOf();
    const next = contractOf({
      granted: ["command.run", "worktree.write", "branch.push"],
      askable: [],
      supersedes: contractDigest(current),
    });
    expect(adopt(current, next)).toBe(next);
  });

  test("a successor that names no predecessor is refused", () => {
    // Two contracts for one run with no link between them is the shape D-0026
    // section 3 rules out: "under which contract did it do that" would have two
    // answers and no way to choose.
    const current = contractOf();
    refusal(SupersessionLineageError, () => adopt(current, contractOf({ supersedes: null })));
  });

  test("a successor that names some other contract is refused", () => {
    const current = contractOf();
    const stranger = contractOf({ granted: ["repo.clone"], askable: [], supersedes: OTHER_DIGEST });
    const caught = refusal(SupersessionLineageError, () => adopt(current, stranger));
    // The message names the digest that would have been replaced, because the
    // holder is the only one who knows which contract that is.
    expect(caught.message).toContain(contractDigest(current));
  });

  test("a successor for another run is not a successor", () => {
    const current = contractOf();
    const forAnotherRun = contractOf({
      grantee: "run:beef",
      supersedes: contractDigest(current),
    });
    refusal(SupersessionSubjectError, () => adopt(current, forAnotherRun));
  });

  test("a successor over another project is not a successor", () => {
    const current = contractOf();
    const otherProject = contractOf({
      projectId: "continuo",
      supersedes: contractDigest(current),
    });
    refusal(SupersessionSubjectError, () => adopt(current, otherProject));
  });

  test("narrowing is accepted, including to nothing", () => {
    // How authority is taken back while revocation without a successor stays
    // deferred (D-0026 sections 1 and 3). After it, everything classifies
    // refused -- which is the point of allowing it at all.
    const current = contractOf();
    const nothing = contractOf({
      granted: [],
      askable: [],
      supersedes: contractDigest(current),
    });
    expect(adopt(current, nothing)).toBe(nothing);

    const answer = classify(
      nothing,
      { capabilities: ["command.run"] },
      { runId: GRANTEE, configDigest: CONFIG_DIGEST },
    );
    expect(answer).toMatchObject({ outcome: "refused", reason: "not_in_contract" });
  });

  test("widening by a successor is not cadenza's to refuse", () => {
    // "Authentication is not authorisation" (D-0026 section 1): whether the
    // issuer held what it granted is the control plane's to establish. What
    // cadenza checks is that a run cannot widen *itself*, and it does that at
    // issue time by refusing a self-issued contract -- see the delegate cases.
    const current = contractOf({ granted: [], askable: [] });
    const wider = contractOf({
      granted: ["command.run", "repo.clone"],
      askable: ["branch.push"],
      supersedes: contractDigest(current),
    });
    expect(adopt(current, wider)).toBe(wider);
  });

  test("chains, one contract at a time", () => {
    // "At most one current per run" is structural: the holder holds one value,
    // and each replacement names the value it replaces, so the chain is a line
    // rather than a set.
    const first = contractOf();
    const second = contractOf({ askable: [], supersedes: contractDigest(first) });
    const third = contractOf({ granted: [], askable: [], supersedes: contractDigest(second) });

    const held = adopt(adopt(adopt(null, first), second), third);
    expect(held).toBe(third);
    // The predecessor cannot be re-adopted on top of its own successor: it names
    // nothing, and the run has moved on.
    refusal(SupersessionLineageError, () => adopt(held, first));
    // Nor can a successor be applied twice, which would be a second replacement
    // of a contract that is no longer current.
    refusal(SupersessionLineageError, () => adopt(held, second));
  });

  test("refuses a value that is not a contract this package built", () => {
    const current = contractOf();
    const forged = { ...current, supersedes: contractDigest(current) } as unknown as typeof current;
    refusal(ForgedContractError, () => adopt(current, forged));
    refusal(ForgedContractError, () => adopt(forged, current));
  });
});

describe("delegate", () => {
  const holder = contractOf({
    granted: ["command.run", "worktree.write", "delegation.issue"],
    askable: ["branch.push"],
  });

  test("issues a sub-contract carrying a subset, with the granter as issuer", () => {
    const sub = delegate(holder, {
      grantee: "run:child",
      granted: ["command.run"],
      askable: ["branch.push"],
    });

    expect(sub.issuer).toBe(GRANTEE);
    expect(sub.grantee).toBe("run:child");
    expect(sub.granted).toEqual(["command.run"]);
    expect(sub.askable).toEqual(["branch.push"]);
    // Inherited rather than chosen: the subject and the vocabulary the keys are
    // read against are the parent's, or the subset rules would be comparing
    // sets whose members mean different things.
    expect(sub.projectId).toBe(holder.projectId);
    expect(sub.configDigest).toBe(holder.configDigest);
    // Vacuous while one version is known, and written now for the same reason
    // the cumulativity case in `capability.test.ts` is: the day a second version
    // exists is the day inheriting it stops being free, and this is where that
    // shows up.
    expect(sub.vocabularyVersion).toBe(holder.vocabularyVersion);
    // A new lineage, not a continuation of the parent's: it belongs to another
    // grantee, and `adopt` on a child that holds nothing accepts exactly this.
    expect(sub.supersedes).toBeNull();
    expect(adopt(null, sub)).toBe(sub);
  });

  test("refuses a run that does not hold delegation.issue", () => {
    // Without this rule a run holding nothing but worktree.write could hand
    // that same key onward and pass both subset checks: delegating would be an
    // authority every contract carried implicitly.
    const cannotDelegate = contractOf({ granted: ["worktree.write"], askable: [] });
    refusal(UngrantedDelegationError, () =>
      delegate(cannotDelegate, {
        grantee: "run:child",
        granted: ["worktree.write"],
        askable: [],
      }),
    );
  });

  test("holding delegation.issue as askable is not holding it", () => {
    // Asking is answered by a superseding contract, not by proceeding
    // (D-0026 section 3), so an askable delegation is one that has not happened.
    const mayAsk = contractOf({ granted: ["command.run"], askable: ["delegation.issue"] });
    refusal(UngrantedDelegationError, () =>
      delegate(mayAsk, { grantee: "run:child", granted: ["command.run"], askable: [] }),
    );
  });

  test("refuses granting a child what the granter does not hold", () => {
    const caught = refusal(AmplifiedGrantError, () =>
      delegate(holder, { grantee: "run:child", granted: ["repo.clone"], askable: [] }),
    );
    expect(caught.message).toContain("repo.clone");
  });

  test("refuses granting a child what the granter may only ask about", () => {
    // The direction that matters: `branch.push` is askable for the parent, so a
    // child granted it unattended would hold more than its granter does. This
    // is how a run would widen itself if the rule were absent -- delegate to a
    // helper, then let the helper act.
    refusal(AmplifiedGrantError, () =>
      delegate(holder, { grantee: "run:child", granted: ["branch.push"], askable: [] }),
    );
  });

  test("refuses making askable something the granter does not hold at all", () => {
    // The askable check is the wider of the two, which makes it easy to write as
    // no check: `repo.clone` is in neither of the granter's sets, and a child
    // that could ask about it would be a child whose escalation reaches past
    // everything its granter has.
    const caught = refusal(AmplifiedGrantError, () =>
      delegate(holder, { grantee: "run:child", granted: [], askable: ["repo.clone"] }),
    );
    expect(caught.message).toContain("repo.clone");
  });

  test("opens the child's own lineage even when the granter is mid-lineage", () => {
    // The parent's `supersedes` belongs to the parent's grantee. Copying it into
    // the child would claim the child replaces a contract issued to somebody
    // else, and `adopt(null, child)` -- the child holding nothing yet -- would
    // then refuse the only contract it was ever given.
    const superseding = contractOf({
      granted: ["command.run", "delegation.issue"],
      askable: [],
      supersedes: OTHER_DIGEST,
    });
    const sub = delegate(superseding, {
      grantee: "run:child",
      granted: ["command.run"],
      askable: [],
    });
    expect(sub.supersedes).toBeNull();
    expect(adopt(null, sub)).toBe(sub);
  });

  test("accepts making a granted capability merely askable for the child", () => {
    // The safe direction, and refusing it would be refusing a narrowing.
    const sub = delegate(holder, {
      grantee: "run:child",
      granted: [],
      askable: ["command.run"],
    });
    expect(sub.askable).toEqual(["command.run"]);
    expect(
      classify(
        sub,
        { capabilities: ["command.run"] },
        {
          runId: "run:child",
          configDigest: CONFIG_DIGEST,
        },
      ),
    ).toMatchObject({ outcome: "needs_approval" });
  });

  test("accepts delegating nothing at all", () => {
    const sub = delegate(holder, { grantee: "run:child", granted: [], askable: [] });
    expect(sub.granted).toEqual([]);
    expect(sub.askable).toEqual([]);
  });

  test("refuses a run delegating to itself", () => {
    // Issue-time rule 5 does this, and it is what makes "a run cannot widen its
    // own grant" true: the contract a run would issue to itself does not exist.
    refusal(SelfIssuedContractError, () =>
      delegate(holder, { grantee: GRANTEE, granted: ["command.run"], askable: [] }),
    );
  });

  test("the sub-contract is subject to every issue-time rule", () => {
    // Disjointness, for one: `delegate` does not get to build a contract that
    // `delegationContract` would have refused.
    refusal(Error, () =>
      delegate(holder, {
        grantee: "run:child",
        granted: ["command.run"],
        askable: ["command.run"],
      }),
    );
  });

  test("a chain of delegations cannot grow", () => {
    // No amplification, transitively: whatever a sub-run passes on is a subset
    // of what it holds, which is a subset of what its granter held.
    const child = delegate(holder, {
      grantee: "run:child",
      granted: ["command.run", "delegation.issue"],
      askable: [],
    });
    const grandchild = delegate(child, {
      grantee: "run:grandchild",
      granted: ["command.run"],
      askable: [],
    });
    expect(grandchild.granted).toEqual(["command.run"]);
    for (const key of grandchild.granted) {
      expect(holder.granted).toContain(key);
    }
    // And the grandchild cannot reach past what its own granter held, even
    // though its grandparent holds more.
    refusal(AmplifiedGrantError, () =>
      delegate(child, { grantee: "run:other", granted: ["worktree.write"], askable: [] }),
    );
  });

  test("refuses a value that is not a contract this package built", () => {
    const forged = { ...holder } as unknown as typeof holder;
    refusal(ForgedContractError, () =>
      delegate(forged, { grantee: "run:child", granted: [], askable: [] }),
    );
  });
});
