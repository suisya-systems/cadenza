/**
 * `delegationContract()`: the eight issue-time refusals, and the canonical form
 * of what it returns.
 *
 * **Target-only**: there is no Python G2 (#25), so no case here translates a
 * source case; `parity/target-only.json` records the file as such.
 *
 * The bar Issue #32 sets is that each refusal has a case that fails **when that
 * refusal is removed** -- not merely that some test somewhere goes red. So each
 * case below is written against one rule's hole and nothing else: the input it
 * builds is valid in every other respect, which is why they all start from
 * {@link valid} and change one field.
 */
import { describe, expect, test } from "vitest";

import { VOCABULARY_VERSION_1 } from "../../src/domain/capability.js";
import {
  type DelegationContract,
  type DelegationContractInput,
  delegationContract,
  isDelegationContract,
  MAX_IDENTITY_LENGTH,
} from "../../src/domain/contract.js";
import { contractDigest } from "../../src/domain/contract-digest.js";
import {
  ForgedContractError,
  InvalidDigestError,
  InvalidIdentifierError,
  InvalidIdentityError,
  OverlappingCapabilityError,
  SelfIssuedContractError,
  UnknownCapabilityError,
  UnknownVocabularyVersionError,
} from "../../src/domain/errors.js";
import { refusal } from "../support.js";

/** A digest of the right shape. Its bytes are irrelevant; its spelling is not. */
const CONFIG_DIGEST = `sha256:${"a1".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"b2".repeat(32)}`;

function valid(overrides: Partial<DelegationContractInput> = {}): DelegationContractInput {
  return {
    vocabularyVersion: 1,
    projectId: "cadenza",
    configDigest: CONFIG_DIGEST,
    issuer: "operator:desk",
    grantee: "run:0f2a",
    granted: ["worktree.write", "command.run"],
    askable: ["branch.push"],
    supersedes: null,
    ...overrides,
  };
}

describe("delegationContract", () => {
  test("accepts a well-formed contract and freezes it", () => {
    const contract = delegationContract(valid());

    expect(contract.projectId).toBe("cadenza");
    expect(contract.grantee).toBe("run:0f2a");
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.granted)).toBe(true);
    expect(Object.isFrozen(contract.askable)).toBe(true);
    // Frozen means the write throws in strict mode rather than failing quietly,
    // which is the half `Object.isFrozen` alone does not demonstrate (D-0015).
    expect(() => {
      (contract as { grantee: string }).grantee = "run:other";
    }).toThrow(TypeError);
  });

  test("takes granted and askable as sets: sorted, de-duplicated, snapshotted", () => {
    const mutable = ["worktree.write", "command.run", "worktree.write"];
    const contract = delegationContract(valid({ granted: mutable, askable: [] }));

    expect(contract.granted).toEqual(["command.run", "worktree.write"]);

    // The caller still holds its array. `readonly string[]` is a compile-time
    // claim, and the digest is persisted, so the snapshot has to be real.
    const before = contractDigest(contract);
    mutable.push("branch.push");
    expect(contract.granted).toEqual(["command.run", "worktree.write"]);
    expect(contractDigest(contract)).toBe(before);
  });

  test("accepts a contract that grants and asks nothing", () => {
    // Narrowing to nothing is how authority is taken back while revocation
    // without a successor stays deferred (D-0026 sections 1 and 3), so the
    // empty contract has to be constructible rather than an edge case.
    const contract = delegationContract(valid({ granted: [], askable: [] }));
    expect(contract.granted).toEqual([]);
    expect(contract.askable).toEqual([]);
  });

  test("accepts a successor that names the digest it replaces", () => {
    const contract = delegationContract(valid({ supersedes: OTHER_DIGEST }));
    expect(contract.supersedes).toBe(OTHER_DIGEST);
  });

  test("treats an omitted supersedes as null", () => {
    const { supersedes: _omitted, ...rest } = valid();
    expect(delegationContract(rest).supersedes).toBeNull();
  });

  // --- rule 1: the pinned vocabulary version -------------------------------

  test("refuses a vocabulary version this build does not know, naming it", () => {
    const caught = refusal(UnknownVocabularyVersionError, () =>
      delegationContract(valid({ vocabularyVersion: 2 })),
    );
    expect(caught.message).toContain("2");
    // The versions this build does know are in the message, because "unknown
    // version" alone does not tell the reader what to pin instead.
    expect(caught.message).toContain("1");
  });

  test("refuses a version that is not a positive integer", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      refusal(UnknownVocabularyVersionError, () =>
        delegationContract(valid({ vocabularyVersion: version })),
      );
    }
    refusal(UnknownVocabularyVersionError, () =>
      delegationContract(valid({ vocabularyVersion: "1" as unknown as number })),
    );
  });

  // --- rule 2: keys are read against the pinned version ---------------------

  test("refuses a capability the pinned version does not contain, naming key and version", () => {
    const caught = refusal(UnknownCapabilityError, () =>
      delegationContract(valid({ granted: ["network.fetch"] })),
    );
    expect(caught.message).toContain("network.fetch");
    // The version is named because the fault is as often a contract pinned one
    // version too low as it is a typo.
    expect(caught.message).toContain("version 1");
  });

  test("refuses an unknown capability in askable as well as in granted", () => {
    refusal(UnknownCapabilityError, () =>
      delegationContract(valid({ granted: [], askable: ["secret.read"] })),
    );
  });

  test("refuses a malformed key, which no vocabulary can contain", () => {
    for (const key of ["repo", "repo.clone.fast", "Repo.clone", "repo.clone ", "repo.clone\n"]) {
      refusal(UnknownCapabilityError, () => delegationContract(valid({ granted: [key] })));
    }
  });

  test("refuses a granted list that is not a list, and says so", () => {
    // The message is asserted, not just the class. A string is iterable, so
    // without the list check the per-key loop walks its characters and refuses
    // `'c'` -- the same error class, from a different rule, naming the wrong
    // thing. Removing the list check has to be visible here, or this case is
    // covering the key check twice instead.
    const caught = refusal(UnknownCapabilityError, () =>
      delegationContract(valid({ granted: "command.run" as unknown as string[] })),
    );
    expect(caught.message).toContain("must be a list");
  });

  // --- rule 3: granted and askable are disjoint ----------------------------

  test("refuses a key that is both granted and askable, naming it", () => {
    const caught = refusal(OverlappingCapabilityError, () =>
      delegationContract(valid({ granted: ["command.run"], askable: ["command.run"] })),
    );
    expect(caught.message).toContain("command.run");
  });

  test("names the same overlapping key whichever order the caller wrote the lists in", () => {
    // The answer is a function of the contract, not of the caller's ordering:
    // otherwise two generators emitting the same grant would get two messages.
    const first = refusal(OverlappingCapabilityError, () =>
      delegationContract(
        valid({
          granted: ["worktree.write", "command.run"],
          askable: ["command.run", "worktree.write"],
        }),
      ),
    );
    const second = refusal(OverlappingCapabilityError, () =>
      delegationContract(
        valid({
          granted: ["command.run", "worktree.write"],
          askable: ["worktree.write", "command.run"],
        }),
      ),
    );
    expect(first.message).toBe(second.message);
  });

  // --- rule 4: identities --------------------------------------------------

  test("refuses an empty or absent identity", () => {
    refusal(InvalidIdentityError, () => delegationContract(valid({ issuer: "" })));
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: "" })));
    refusal(InvalidIdentityError, () =>
      delegationContract(valid({ issuer: undefined as unknown as string })),
    );
  });

  test("refuses an identity longer than the maximum", () => {
    const long = "r".repeat(MAX_IDENTITY_LENGTH + 1);
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: long })));
    // The boundary itself is accepted: an off-by-one here would refuse a run
    // identity the control plane considers ordinary.
    expect(
      delegationContract(valid({ grantee: "r".repeat(MAX_IDENTITY_LENGTH) })).grantee,
    ).toHaveLength(MAX_IDENTITY_LENGTH);
  });

  test("refuses an identity carrying a control character or padded with whitespace", () => {
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: "run: " })));
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: "run:0f2a\n" })));
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: " run:0f2a" })));
    refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: "run:0f2a " })));
  });

  test("refuses an identity carrying an unpaired surrogate", () => {
    // The hole this closes is specific: such an identity satisfies every other
    // rule, and `contractDigest` would then throw through `canonicalJsonBytes`
    // (D-0013) -- a contract that exists and cannot be classified, since every
    // classification carries its digest.
    const caught = refusal(InvalidIdentityError, () =>
      delegationContract(valid({ grantee: "run:\ud800" })),
    );
    expect(caught.message).toContain("surrogate");
  });

  test("accepts an identity that is opaque, non-ASCII and not a G1 identifier", () => {
    // Run identities are the control plane's to mint (D-0026 section 2), so the
    // shape must not quietly become the G1 identifier shape.
    const contract = delegationContract(valid({ grantee: "urn:run:テスト/42" }));
    expect(contract.grantee).toBe("urn:run:テスト/42");
  });

  // --- rule 5: no self-issue ----------------------------------------------

  test("refuses a contract whose issuer is its own grantee", () => {
    const caught = refusal(SelfIssuedContractError, () =>
      delegationContract(valid({ issuer: "run:0f2a", grantee: "run:0f2a" })),
    );
    expect(caught.message).toContain("run:0f2a");
  });

  // --- rule 6: the subject is a project_id ---------------------------------

  test("refuses a project_id that is not a G1 identifier", () => {
    refusal(InvalidIdentifierError, () => delegationContract(valid({ projectId: "Cadenza" })));
    refusal(InvalidIdentifierError, () => delegationContract(valid({ projectId: "" })));
    refusal(InvalidIdentifierError, () =>
      delegationContract(valid({ projectId: undefined as unknown as string })),
    );
  });

  // --- rules 7 and 8: the digests ------------------------------------------

  test("refuses a config_digest that is not sha256 and 64 lowercase hex", () => {
    for (const digest of [
      "",
      "sha256:",
      "a1".repeat(32),
      `sha256:${"a1".repeat(31)}`,
      `sha256:${"A1".repeat(32)}`,
      `sha1:${"a1".repeat(32)}`,
      `sha256:${"a1".repeat(32)}\n`,
    ]) {
      refusal(InvalidDigestError, () => delegationContract(valid({ configDigest: digest })));
    }
  });

  test("refuses a supersedes that is present and malformed", () => {
    const caught = refusal(InvalidDigestError, () =>
      delegationContract(valid({ supersedes: "sha256:not-a-digest" })),
    );
    expect(caught.message).toContain("supersedes");
  });

  // --- the brand: valid by construction, and not forgeable -----------------

  test("marks what it built, and recognises nothing else", () => {
    expect(isDelegationContract(delegationContract(valid()))).toBe(true);
    expect(isDelegationContract(undefined)).toBe(false);
    expect(isDelegationContract(null)).toBe(false);
    expect(isDelegationContract("contract")).toBe(false);
    expect(isDelegationContract({})).toBe(false);
  });

  test("does not recognise an object that merely has the right fields", () => {
    // The hole this closes: `DelegationContract` is structural, so without the
    // brand this literal IS one as far as the type checker is concerned -- and
    // it is a contract that went through no validation at all, with granted and
    // askable overlapping and a vocabulary version nobody knows. "Valid by
    // construction" has to be a claim the types actually make.
    const forged = {
      vocabularyVersion: 99,
      projectId: "cadenza",
      configDigest: CONFIG_DIGEST,
      issuer: "run:0f2a",
      grantee: "run:0f2a",
      granted: ["network.fetch"],
      askable: ["network.fetch"],
      supersedes: null,
    } as unknown as DelegationContract;

    expect(isDelegationContract(forged)).toBe(false);
    refusal(ForgedContractError, () => contractDigest(forged));
  });

  test("does not recognise a copy of a real contract", () => {
    // The hole a symbol-keyed brand left: a spread carries a symbol property
    // across, so `{ ...contract, grantee: "run:forged" }` would have passed a
    // property check while holding a grantee that was never validated -- and
    // the grantee binding is what stops a contract being a bearer token.
    // Provenance a copy can inherit is not provenance, so it is identity.
    const real = delegationContract(valid());
    const copy = { ...real, grantee: "run:forged" } as unknown as DelegationContract;

    expect(isDelegationContract(copy)).toBe(false);
    refusal(ForgedContractError, () => contractDigest(copy));
    // The plain copy too: the point is where the value came from, not whether
    // the copy happens to differ.
    expect(isDelegationContract({ ...real } as unknown as DelegationContract)).toBe(false);
    expect(isDelegationContract(real)).toBe(true);
  });

  // --- D-0007: everything printed is ASCII ---------------------------------

  test("keeps a refusal's text ASCII even when the value refused is not", () => {
    // A grantee may legitimately hold any printable Unicode (design document
    // section 4.1), so a refusal quoting one would print non-ASCII -- and the
    // console this is developed against is cp932, where that kills the process
    // at the print rather than at the bug (D-0007).
    const messages = [
      refusal(SelfIssuedContractError, () =>
        delegationContract(
          valid({ issuer: "run:\u30c6\u30b9\u30c8", grantee: "run:\u30c6\u30b9\u30c8" }),
        ),
      ).message,
      refusal(UnknownCapabilityError, () =>
        delegationContract(valid({ granted: ["\u30c6.\u30b9\u30c8"] })),
      ).message,
      refusal(InvalidIdentityError, () => delegationContract(valid({ grantee: " run:\u30c6" })))
        .message,
      refusal(InvalidDigestError, () =>
        delegationContract(valid({ configDigest: "sha256:\u30c6" })),
      ).message,
      // G1's own validator formats with repr, which keeps printable Unicode.
      // Reusing the rule is right; inheriting the non-ASCII message is not.
      refusal(InvalidIdentifierError, () =>
        delegationContract(valid({ projectId: "\u30c6\u30b9\u30c8" })),
      ).message,
    ];
    for (const message of messages) {
      expect(message).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  // --- the negative property the classifier depends on ---------------------

  test("every key of a constructed contract is in the vocabulary it pinned", () => {
    // The classifier is written on the assumption that it cannot be handed an
    // invalid contract (design document section 4). This is that assumption,
    // asserted rather than trusted.
    const contract = delegationContract(valid());
    for (const key of [...contract.granted, ...contract.askable]) {
      expect(VOCABULARY_VERSION_1.has(key)).toBe(true);
    }
  });
});
