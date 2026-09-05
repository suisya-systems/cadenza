/**
 * The human-decision record's validators (D-0036, row `S-2`).
 *
 * **Target-only**: the record is a G2-adjacent port, there is no Python G2 and
 * the Python G1 is retired (#25, D-0032), so no case here translates a source
 * case; `parity/target-only.json` records the file as such.
 *
 * The cases are written against the row's own claim -- **three validators, not
 * one** -- rather than against the shape of the code. Two of them exist because
 * that claim is where the obvious shorter design goes wrong: `parseIdentifier`
 * refuses every digest it is given, and a restatement of the identity rules
 * drops the two checks a summary forgets. Both are asserted directly, so a
 * later reader is told which mistake the split prevents rather than that a
 * split exists.
 */
import { describe, expect, test } from "vitest";

import { MAX_IDENTITY_LENGTH } from "../../src/domain/contract.js";
import {
  InvalidDigestError,
  InvalidIdentifierError,
  InvalidIdentityError,
  InvalidOutcomeError,
} from "../../src/domain/errors.js";
import { parseIdentifier } from "../../src/domain/identifiers.js";
import { type HumanDecisionRecord, humanDecisionRecord } from "../../src/ports/human-decision.js";
import { refusal } from "../support.js";

const PREDECESSOR = `sha256:${"a1".repeat(32)}`;
const APPROVED = `sha256:${"b2".repeat(32)}`;

function recordOf(overrides: Partial<HumanDecisionRecord> = {}): HumanDecisionRecord {
  return humanDecisionRecord({
    decisionId: "decision:7f31",
    recordedBy: "surface:desk",
    outcome: "approved",
    predecessor: PREDECESSOR,
    approved: APPROVED,
    ...overrides,
  });
}

/** A record built without going through the validator, for the cases that need one. */
function rawRecord(overrides: Record<string, unknown>): HumanDecisionRecord {
  return {
    decisionId: "decision:7f31",
    recordedBy: "surface:desk",
    outcome: "approved",
    predecessor: PREDECESSOR,
    approved: APPROVED,
    ...overrides,
  } as HumanDecisionRecord;
}

describe("the five fields", () => {
  test("a well-formed decision is carried through unchanged", () => {
    expect(recordOf()).toEqual({
      decisionId: "decision:7f31",
      recordedBy: "surface:desk",
      outcome: "approved",
      predecessor: PREDECESSOR,
      approved: APPROVED,
    });
  });

  test("a null predecessor is what opens a lineage, and is not an omission", () => {
    expect(recordOf({ predecessor: null }).predecessor).toBeNull();
    // A field left off entirely reads as the same decision rather than as a
    // malformed one: the successor opens a lineage. `approved` has no such
    // reading, and its case is below.
    expect(humanDecisionRecord(rawRecord({ predecessor: undefined })).predecessor).toBeNull();
  });

  test("the record is a frozen copy, so the caller's object cannot change it later", () => {
    // `readonly` is a compile-time claim, and this value decides whether a
    // widening is issued (D-0015).
    const input = {
      decisionId: "decision:7f31",
      recordedBy: "surface:desk",
      outcome: "approved" as const,
      predecessor: PREDECESSOR,
      approved: APPROVED,
    };
    const record = humanDecisionRecord(input);
    expect(Object.isFrozen(record)).toBe(true);
    (input as { approved: string }).approved = `sha256:${"c3".repeat(32)}`;
    expect(record.approved).toBe(APPROVED);
    expect(() => {
      (record as { approved: string }).approved = "widened";
    }).toThrow(TypeError);
  });
});

describe("the digest validator, which is not the identifier one", () => {
  test("`parseIdentifier` would refuse the very digests these fields carry", () => {
    // This is why row `S-2` asks for three validators rather than one. A single
    // rule over all five fields cannot work, and the reason is measurable: the
    // identifier shape refuses a digest twice over, for the colon and for the
    // length.
    refusal(InvalidIdentifierError, () => parseIdentifier(PREDECESSOR, "predecessor"));
    refusal(InvalidIdentifierError, () => parseIdentifier(APPROVED, "approved"));
    expect(recordOf().approved).toBe(APPROVED);
  });

  test("a digest is refused for its prefix, its length, its case and its type", () => {
    refusal(InvalidDigestError, () => recordOf({ approved: "b2".repeat(32) }));
    refusal(InvalidDigestError, () => recordOf({ approved: `sha256:${"b2".repeat(31)}` }));
    refusal(InvalidDigestError, () => recordOf({ approved: `sha256:${"B2".repeat(32)}` }));
    refusal(InvalidDigestError, () => humanDecisionRecord(rawRecord({ approved: 7 })));
  });

  test("`approved` is required: a decision that names no successor authorises none", () => {
    // The asymmetry with `predecessor` is the whole point of the field. A record
    // naming only a predecessor would let any successor over it be issued.
    refusal(InvalidDigestError, () => humanDecisionRecord(rawRecord({ approved: null })));
    refusal(InvalidDigestError, () => humanDecisionRecord(rawRecord({ approved: undefined })));
  });

  test("a malformed predecessor is refused rather than read as a lineage opening", () => {
    refusal(InvalidDigestError, () => recordOf({ predecessor: "sha256:not-a-digest" }));
  });
});

describe("the identity validator, reused rather than restated", () => {
  test("the two checks a restatement drops are the two asserted here", () => {
    // `requireIdentity` applies six checks, not the three a summary remembers.
    // The last two are the ones a copy loses: Python's definition of leading and
    // trailing whitespace, and the lone surrogate that could not be UTF-8
    // encoded and so could not be digested (D-0013).
    refusal(InvalidIdentityError, () => recordOf({ recordedBy: " surface:desk" }));
    // U+0085 is the discriminating case rather than a plain space: Python's
    // `str.isspace()` says yes and JavaScript's `\s` says no, so a restatement
    // written with a regular expression would admit it.
    refusal(InvalidIdentityError, () => recordOf({ recordedBy: "surface:desk\u0085" }));
    refusal(InvalidIdentityError, () => recordOf({ decisionId: "decision:\ud800" }));
  });

  test("the other four checks apply to both identity fields", () => {
    refusal(InvalidIdentityError, () => humanDecisionRecord(rawRecord({ decisionId: 7 })));
    refusal(InvalidIdentityError, () => recordOf({ decisionId: "" }));
    refusal(InvalidIdentityError, () =>
      recordOf({ recordedBy: "a".repeat(MAX_IDENTITY_LENGTH + 1) }),
    );
    refusal(InvalidIdentityError, () => recordOf({ recordedBy: "surface\u0007desk" }));
    // The bound is a count of codepoints, not of UTF-16 units: an identity of
    // 256 astral characters is 512 units and is accepted.
    expect(
      recordOf({ recordedBy: "\u{1f600}".repeat(MAX_IDENTITY_LENGTH) }).recordedBy,
    ).toHaveLength(MAX_IDENTITY_LENGTH * 2);
  });
});

describe("the closed union", () => {
  test("both members are accepted, and nothing else is", () => {
    expect(recordOf({ outcome: "approved" }).outcome).toBe("approved");
    expect(recordOf({ outcome: "refused" }).outcome).toBe("refused");
    // A third spelling is a third meaning nothing here knows how to read, and
    // the one that matters is the near miss: `withdrawn` is a real gate outcome
    // in continuo and is not one of these two.
    const error = refusal(InvalidOutcomeError, () =>
      humanDecisionRecord(rawRecord({ outcome: "withdrawn" })),
    );
    expect(error.message).toContain("approved, refused");
    refusal(InvalidOutcomeError, () => humanDecisionRecord(rawRecord({ outcome: "APPROVED" })));
    refusal(InvalidOutcomeError, () => humanDecisionRecord(rawRecord({ outcome: true })));
  });
});

test("the order of the checks is the order of the fields", () => {
  // Observable, so it is fixed here rather than left to whichever check the
  // implementation happened to write first -- the discipline
  // `delegationContract()` already keeps. An input wrong in two ways reports
  // the earlier field.
  refusal(InvalidIdentityError, () =>
    humanDecisionRecord(rawRecord({ decisionId: "", outcome: "withdrawn", approved: "nope" })),
  );
  refusal(InvalidOutcomeError, () =>
    humanDecisionRecord(rawRecord({ outcome: "withdrawn", approved: "nope" })),
  );
});
