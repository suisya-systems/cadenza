/**
 * `agentType()`: the refusals it stands in front of, and the immutability of
 * what it returns.
 *
 * **Target-only**: the record is G2-adjacent and there is no Python side for it
 * (#25, D-0032), so no case here translates a source case;
 * `parity/target-only.json` records the file as such.
 *
 * Two bars, both borrowed from the contract's file because the record is the
 * same kind of value. Each refusal has a case built against **one** rule's
 * hole, valid in every other respect, so removing that rule turns exactly that
 * case red. And immutability is asserted at runtime rather than at the type
 * checker: `readonly` is a compile-time claim, the record's digest is meant to
 * be persisted, and a caller who keeps its input array is the failure D-0015
 * exists for.
 */
import { describe, expect, test } from "vitest";

import {
  type AgentType,
  type AgentTypeInput,
  agentType,
  agentTypeDigest,
  type ExecutorPolicy,
  isAgentType,
  type LoopPolicy,
  MAX_POLICY_THRESHOLD,
  MAX_REPORTING_DUTIES,
  requireAgentType,
} from "../../src/domain/agent-type.js";
import { VOCABULARY_VERSION_1 } from "../../src/domain/capability.js";
import { DIGEST_PATTERN } from "../../src/domain/digest.js";
import {
  ForgedAgentTypeError,
  InvalidIdentifierError,
  InvalidPolicyError,
  OverlappingCapabilityError,
  UnknownCapabilityError,
  UnknownVocabularyVersionError,
} from "../../src/domain/errors.js";
import { refusal } from "../support.js";

function loopPolicy(overrides: Partial<LoopPolicy> = {}): LoopPolicy {
  return { maxReviewRounds: 3, noProgressWindow: 4, noProgressRepeat: 2, ...overrides };
}

function executorPolicy(overrides: Partial<ExecutorPolicy> = {}): ExecutorPolicy {
  return {
    roleName: "worker",
    modelTier: "standard",
    reportingDuties: ["post_summary", "verify_output"],
    ...overrides,
  };
}

function valid(overrides: Partial<AgentTypeInput> = {}): AgentTypeInput {
  return {
    agentTypeId: "reviewer",
    vocabularyVersion: 1,
    granted: ["worktree.write", "command.run"],
    askable: ["branch.push"],
    loopPolicy: loopPolicy(),
    executorPolicy: executorPolicy(),
    ...overrides,
  };
}

describe("agentType", () => {
  test("accepts a well-formed record and carries its own digest", () => {
    const record = agentType(valid());

    expect(record.agentTypeId).toBe("reviewer");
    expect(record.vocabularyVersion).toBe(1);
    expect(record.agentTypeDigest).toMatch(DIGEST_PATTERN);
    // The field is the digest, not a second opinion about it. Recomputing has
    // to agree, or the record carries a claim about itself that is false.
    expect(record.agentTypeDigest).toBe(agentTypeDigest(record));
  });

  test("takes granted and askable as sets: sorted, de-duplicated", () => {
    const record = agentType(
      valid({ granted: ["worktree.write", "command.run", "worktree.write"], askable: [] }),
    );
    expect(record.granted).toEqual(["command.run", "worktree.write"]);
    expect(record.askable).toEqual([]);
  });

  test("takes reporting duties as a set too", () => {
    const record = agentType(
      valid({
        executorPolicy: executorPolicy({
          reportingDuties: ["verify_output", "post_summary", "verify_output"],
        }),
      }),
    );
    expect(record.executorPolicy.reportingDuties).toEqual(["post_summary", "verify_output"]);
  });

  test("accepts a record that grants and asks nothing, and reports nothing", () => {
    // Narrowing to nothing has to be constructible for the same reason the
    // empty contract does (D-0026 sections 1 and 3): it is how authority is
    // taken back.
    const record = agentType(
      valid({
        granted: [],
        askable: [],
        executorPolicy: executorPolicy({ reportingDuties: [] }),
      }),
    );
    expect(record.granted).toEqual([]);
    expect(record.executorPolicy.reportingDuties).toEqual([]);
  });

  // --- rules 1 to 3: the three capability.ts shares with the contract -------

  test("refuses a vocabulary version this build does not know", () => {
    const caught = refusal(UnknownVocabularyVersionError, () =>
      agentType(valid({ vocabularyVersion: 2 })),
    );
    expect(caught.message).toContain("2");
    expect(caught.message).toContain("1");
  });

  test("refuses a key that is not in the vocabulary the record pinned", () => {
    const caught = refusal(UnknownCapabilityError, () =>
      agentType(valid({ granted: ["network.fetch"] })),
    );
    expect(caught.message).toContain("network.fetch");
    // The version is named, because "unknown capability" alone sends the reader
    // hunting for a typo when the fault is a version pinned one too low.
    expect(caught.message).toContain("version 1");
  });

  test("refuses a key that is both granted and askable", () => {
    const caught = refusal(OverlappingCapabilityError, () =>
      agentType(valid({ granted: ["command.run"], askable: ["command.run"] })),
    );
    expect(caught.message).toContain("command.run");
  });

  // --- rule 4: the record's own identifier ---------------------------------

  test("refuses an agent type id that is not an identifier", () => {
    for (const id of ["Reviewer", "1reviewer", "reviewer.one", "", "a".repeat(65)]) {
      refusal(InvalidIdentifierError, () => agentType(valid({ agentTypeId: id })));
    }
  });

  test("refuses an agent type id that is not a string", () => {
    refusal(InvalidIdentifierError, () =>
      agentType(valid({ agentTypeId: 7 as unknown as string })),
    );
  });

  // --- rule 5: the loop policy ---------------------------------------------

  test("refuses a loop policy that is not a table", () => {
    for (const policy of [null, 3, "three", ["three"]]) {
      refusal(InvalidPolicyError, () =>
        agentType(valid({ loopPolicy: policy as unknown as LoopPolicy })),
      );
    }
  });

  test("refuses a loop policy member that is missing or not an integer", () => {
    const { maxReviewRounds: _dropped, ...missing } = loopPolicy();
    refusal(InvalidPolicyError, () =>
      agentType(valid({ loopPolicy: missing as unknown as LoopPolicy })),
    );
    for (const value of [1.5, Number.NaN, "3", null]) {
      refusal(InvalidPolicyError, () =>
        agentType(valid({ loopPolicy: loopPolicy({ maxReviewRounds: value as number }) })),
      );
    }
  });

  test("refuses a loop policy count outside the range", () => {
    for (const value of [0, -1, MAX_POLICY_THRESHOLD + 1]) {
      const caught = refusal(InvalidPolicyError, () =>
        agentType(valid({ loopPolicy: loopPolicy({ maxReviewRounds: value }) })),
      );
      expect(caught.message).toContain("max_review_rounds");
    }
    // The ceiling itself is accepted: a bound that refused its own limit would
    // be a bound one off from what it says.
    expect(
      agentType(valid({ loopPolicy: loopPolicy({ maxReviewRounds: MAX_POLICY_THRESHOLD }) }))
        .loopPolicy.maxReviewRounds,
    ).toBe(MAX_POLICY_THRESHOLD);
  });

  test("refuses a no-progress repeat larger than its window", () => {
    // A repeat the window can never reach is a halt condition that can never
    // fire: the policy would say it halts and would not.
    const caught = refusal(InvalidPolicyError, () =>
      agentType(valid({ loopPolicy: loopPolicy({ noProgressWindow: 2, noProgressRepeat: 3 }) })),
    );
    expect(caught.message).toContain("no_progress_repeat");
    expect(caught.message).toContain("no_progress_window");
    // Equal is fine: the window is exactly long enough.
    expect(
      agentType(valid({ loopPolicy: loopPolicy({ noProgressWindow: 2, noProgressRepeat: 2 }) }))
        .loopPolicy.noProgressRepeat,
    ).toBe(2);
  });

  test("refuses a loop policy member this build does not know", () => {
    const caught = refusal(InvalidPolicyError, () =>
      agentType(
        valid({
          loopPolicy: { ...loopPolicy(), maxAttempts: 5 } as unknown as LoopPolicy,
        }),
      ),
    );
    // The table is closed because every member is digested: an unrecognised one
    // would be dropped silently, and two records a caller meant differently
    // would share one digest.
    expect(caught.message).toContain("maxAttempts");
  });

  // --- rule 6: the executor policy, structurally and only structurally ------

  test("refuses an executor policy that is not a table, or has an unknown member", () => {
    refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: null as unknown as ExecutorPolicy })),
    );
    refusal(InvalidPolicyError, () =>
      agentType(
        valid({
          executorPolicy: { ...executorPolicy(), provider: "acme" } as unknown as ExecutorPolicy,
        }),
      ),
    );
  });

  test("refuses a role name or model tier that is not an identifier", () => {
    refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: executorPolicy({ roleName: "Worker" }) })),
    );
    refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: executorPolicy({ modelTier: "gpt 5" }) })),
    );
  });

  test("refuses reporting duties that are not a list, are too many, or are not identifiers", () => {
    refusal(InvalidPolicyError, () =>
      agentType(
        valid({
          executorPolicy: executorPolicy({
            reportingDuties: "post_summary" as unknown as string[],
          }),
        }),
      ),
    );
    const tooMany = Array.from({ length: MAX_REPORTING_DUTIES + 1 }, (_, index) => `duty-${index}`);
    refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: executorPolicy({ reportingDuties: tooMany }) })),
    );
    refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: executorPolicy({ reportingDuties: ["Post Summary"] }) })),
    );
  });

  test("does not interpret the executor policy it validates", () => {
    // The one positive statement of D-0031 section 3 that can be made in a
    // test: a role name and a tier cadenza has never heard of are accepted,
    // because knowing which ones exist is the invocation adapter's job and
    // holding that knowledge here is exactly what the field exists to avoid.
    const record = agentType(
      valid({
        executorPolicy: executorPolicy({ roleName: "sous-chef", modelTier: "tier-9" }),
      }),
    );
    expect(record.executorPolicy.roleName).toBe("sous-chef");
    expect(record.executorPolicy.modelTier).toBe("tier-9");
  });

  // --- rule 7: the input table is closed too -------------------------------

  test("refuses an input member this build does not know", () => {
    const caught = refusal(InvalidPolicyError, () =>
      agentType({ ...valid(), schemaVersion: 1 } as unknown as AgentTypeInput),
    );
    expect(caught.message).toContain("schemaVersion");
  });

  test("names the first unknown member in code-point order, not in the caller's", () => {
    // Otherwise which key a refusal names would depend on how the caller's
    // object literal happened to be written.
    const caught = refusal(InvalidPolicyError, () =>
      agentType({ ...valid(), zeta: 1, alpha: 2 } as unknown as AgentTypeInput),
    );
    expect(caught.message).toContain("alpha");
  });

  // --- D-0007 --------------------------------------------------------------

  test("prints every refusal in ASCII, whatever the caller passed", () => {
    const messages = [
      refusal(InvalidIdentifierError, () => agentType(valid({ agentTypeId: "テスト" }))).message,
      refusal(InvalidPolicyError, () =>
        agentType(valid({ executorPolicy: executorPolicy({ roleName: "テスト" }) })),
      ).message,
      refusal(InvalidPolicyError, () =>
        agentType(
          valid({
            executorPolicy: executorPolicy({ reportingDuties: ["テスト"] }),
          }),
        ),
      ).message,
      refusal(InvalidPolicyError, () =>
        agentType({ ...valid(), テ: 1 } as unknown as AgentTypeInput),
      ).message,
      refusal(InvalidPolicyError, () =>
        agentType(
          valid({
            loopPolicy: loopPolicy({
              maxReviewRounds: Symbol("テ") as unknown as number,
            }),
          }),
        ),
      ).message,
    ];
    for (const message of messages) {
      expect(message).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  // --- the exotic caller: an element that changes between reads -----------

  /**
   * An array whose element reads are not stable.
   *
   * `Array.isArray` is true of it, `length` is 1, and the first read of index
   * 0 gives `first` while every later read gives `second`. This is what a
   * validate-then-re-read lets past: the check sees one value and the record
   * keeps another.
   */
  function shiftingArray(first: string, second: string): string[] {
    const array: string[] = [];
    let reads = 0;
    Object.defineProperty(array, 0, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return reads === 1 ? first : second;
      },
    });
    Object.defineProperty(array, "length", { value: 1, writable: false });
    return array;
  }

  test("reads a reporting duty once, so a shifting element cannot land in the record", () => {
    const record = agentType(
      valid({
        executorPolicy: executorPolicy({
          reportingDuties: shiftingArray("post_summary", "Not A Duty!"),
        }),
      }),
    );
    // Whichever value construction saw is the value it kept: what must not
    // happen is that a name `parseIdentifier` refuses ends up frozen inside a
    // digested record.
    expect(record.executorPolicy.reportingDuties).toEqual(["post_summary"]);
  });

  test("reads a capability key once, so a shifting element cannot widen the record", () => {
    const record = agentType(
      valid({ granted: shiftingArray("command.run", "network.fetch"), askable: [] }),
    );
    expect(record.granted).toEqual(["command.run"]);
    // The property the classifier and the renderer are both written on.
    for (const key of record.granted) {
      expect(VOCABULARY_VERSION_1.has(key)).toBe(true);
    }
  });

  test("never lets the encoder be the thing that refuses", () => {
    // A lone surrogate on the second read would reach `canonicalJsonBytes` and
    // throw `SurrogateInStringError` out of the digest -- a record that
    // validated and then could not be digested, which is the failure the shape
    // rules exist to prevent. Whatever happens here, it is a named refusal or
    // a valid record, and never that.
    let caught: unknown;
    try {
      agentType(
        valid({
          executorPolicy: executorPolicy({
            reportingDuties: shiftingArray("post_summary", "\ud800"),
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught === undefined || caught instanceof InvalidPolicyError).toBe(true);
  });

  test("refuses a call that passed no table at all, by name", () => {
    // `Object.keys(null)` throws a native TypeError, so without the table
    // check the least careful caller would meet JavaScript's refusal rather
    // than this module's.
    for (const value of [null, undefined, 7, "reviewer", ["reviewer"]]) {
      refusal(InvalidPolicyError, () => agentType(value as unknown as AgentTypeInput));
    }
  });

  test("refuses an over-long reporting list without first copying it", () => {
    // The length is the caller's. A snapshot taken before the ceiling was
    // applied would allocate the declared length on the way to refusing it, so
    // the refusal has to come first -- asserted here with a length no machine
    // should try to materialise.
    const enormous: string[] = [];
    Object.defineProperty(enormous, "length", { value: 2 ** 31, writable: false });
    const caught = refusal(InvalidPolicyError, () =>
      agentType(valid({ executorPolicy: executorPolicy({ reportingDuties: enormous }) })),
    );
    expect(caught.message).toContain(String(MAX_REPORTING_DUTIES));
  });

  // --- the order of the refusals ------------------------------------------

  test("reports the earlier rule when an input is wrong in more than one way", () => {
    // D-0034 section 8. The order is observable, so it is pinned: a refactor
    // that reordered the checks would change what a host is told without
    // anything recording that it had.
    const wrongEverywhere = {
      ...valid({
        vocabularyVersion: 2,
        granted: ["network.fetch"],
        agentTypeId: "Reviewer",
        loopPolicy: { maxReviewRounds: 0, noProgressWindow: 4, noProgressRepeat: 2 },
        executorPolicy: executorPolicy({ roleName: "Worker" }),
      }),
      unknownMember: 1,
    } as unknown as AgentTypeInput;

    // Rule 1 beats every value rule.
    refusal(InvalidPolicyError, () => agentType(wrongEverywhere));

    const { unknownMember: _dropped, ...noUnknown } = wrongEverywhere as unknown as Record<
      string,
      unknown
    >;
    // Rule 2 beats rules 3 onwards.
    refusal(UnknownVocabularyVersionError, () => agentType(noUnknown as unknown as AgentTypeInput));
    // Rule 3 beats rule 6.
    refusal(UnknownCapabilityError, () =>
      agentType(valid({ granted: ["network.fetch"], agentTypeId: "Reviewer" })),
    );
    // Rule 5 beats rule 6.
    refusal(OverlappingCapabilityError, () =>
      agentType(
        valid({ granted: ["command.run"], askable: ["command.run"], agentTypeId: "Reviewer" }),
      ),
    );
    // Rule 6 beats rule 7.
    refusal(InvalidIdentifierError, () =>
      agentType(
        valid({
          agentTypeId: "Reviewer",
          loopPolicy: loopPolicy({ maxReviewRounds: 0 }),
        }),
      ),
    );
    // Rule 7 beats rule 8. Both raise the same class, so the message is what
    // says which rule answered.
    expect(
      refusal(InvalidPolicyError, () =>
        agentType(
          valid({
            loopPolicy: loopPolicy({ maxReviewRounds: 0 }),
            executorPolicy: executorPolicy({ roleName: "Worker" }),
          }),
        ),
      ).message,
    ).toContain("max_review_rounds");
  });

  // --- immutability, at runtime --------------------------------------------

  test("freezes the record, both policy bags, and every array in them", () => {
    const record = agentType(valid());

    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.granted)).toBe(true);
    expect(Object.isFrozen(record.askable)).toBe(true);
    expect(Object.isFrozen(record.loopPolicy)).toBe(true);
    expect(Object.isFrozen(record.executorPolicy)).toBe(true);
    expect(Object.isFrozen(record.executorPolicy.reportingDuties)).toBe(true);

    // Frozen means the write throws in strict mode rather than failing quietly,
    // which is the half `Object.isFrozen` alone does not demonstrate. Each of
    // these is a cast reaching past the `readonly`.
    expect(() => {
      (record as { agentTypeId: string }).agentTypeId = "other";
    }).toThrow(TypeError);
    expect(() => {
      (record as { agentTypeDigest: string }).agentTypeDigest = "sha256:00";
    }).toThrow(TypeError);
    expect(() => {
      (record.loopPolicy as { maxReviewRounds: number }).maxReviewRounds = 99;
    }).toThrow(TypeError);
    expect(() => {
      (record.executorPolicy as { modelTier: string }).modelTier = "other";
    }).toThrow(TypeError);
    expect(() => {
      (record.granted as string[]).push("branch.push");
    }).toThrow(TypeError);
    expect(() => {
      (record.executorPolicy.reportingDuties as string[]).push("shout");
    }).toThrow(TypeError);
  });

  test("snapshots what the caller keeps holding: arrays and both policy objects", () => {
    const granted = ["worktree.write", "command.run"];
    const duties = ["post_summary"];
    const loop = loopPolicy();
    const executor = executorPolicy({ reportingDuties: duties });
    const record = agentType(valid({ granted, loopPolicy: loop, executorPolicy: executor }));
    const before = record.agentTypeDigest;

    // Everything the caller still holds a reference to, mutated afterwards.
    granted.push("branch.push");
    duties.push("shout");
    (loop as { maxReviewRounds: number }).maxReviewRounds = 99;
    (executor as { roleName: string }).roleName = "curator";

    expect(record.granted).toEqual(["command.run", "worktree.write"]);
    expect(record.executorPolicy.reportingDuties).toEqual(["post_summary"]);
    expect(record.loopPolicy.maxReviewRounds).toBe(3);
    expect(record.executorPolicy.roleName).toBe("worker");
    expect(record.agentTypeDigest).toBe(before);
    expect(agentTypeDigest(record)).toBe(before);
  });

  test("editing mints a new record and leaves the old one and its digest alone", () => {
    // D-0031 section 5: a run's stored `agent_type_digest` must still address a
    // record that exists, which is only true if editing never mutates.
    const first = agentType(valid());
    const firstDigest = first.agentTypeDigest;

    const second = agentType(valid({ loopPolicy: loopPolicy({ maxReviewRounds: 5 }) }));

    expect(second).not.toBe(first);
    expect(second.agentTypeDigest).not.toBe(firstDigest);
    expect(first.loopPolicy.maxReviewRounds).toBe(3);
    expect(first.agentTypeDigest).toBe(firstDigest);
    expect(agentTypeDigest(first)).toBe(firstDigest);
  });

  // --- the brand -----------------------------------------------------------

  test("recognises only what it built, and a copy is not what it built", () => {
    const record = agentType(valid());
    expect(isAgentType(record)).toBe(true);
    expect(requireAgentType(record)).toBe(record);

    // A spread carries every own enumerable property across, including the
    // digest, so the copy looks exactly like a record while having been through
    // no validation. Recognition is by identity for precisely this reason.
    const forged = { ...record, agentTypeId: "forged" } as unknown as AgentType;
    expect(isAgentType(forged)).toBe(false);
    refusal(ForgedAgentTypeError, () => requireAgentType(forged));
    refusal(ForgedAgentTypeError, () => agentTypeDigest(forged));

    for (const value of [null, undefined, 1, "reviewer", {}, []]) {
      expect(isAgentType(value)).toBe(false);
    }
  });

  // --- the negative property the renderer depends on -----------------------

  test("every key of a constructed record is in the vocabulary it pinned", () => {
    // The issuance renderer hands these straight to `delegationContract()`.
    // That it cannot be handed a key outside the vocabulary is the assumption
    // both sides are written on, asserted rather than trusted.
    const record = agentType(valid());
    for (const key of [...record.granted, ...record.askable]) {
      expect(VOCABULARY_VERSION_1.has(key)).toBe(true);
    }
  });
});
