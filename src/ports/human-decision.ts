/**
 * The record that a human decision was taken at an operating surface, about one
 * named successor.
 *
 * `docs/design/operating-surface.md` section 4.3, taken as D-0036 rows `S-1`
 * (option b) and `S-2`. This is a **port**: it names a value cadenza cannot
 * compute and will not mint. rondo D-0009 part 2 makes the operating surface the
 * issuer of any widening successor, and rondo's own layer table refuses
 * `src/access -> src/cadenza`, so the surface cannot call cadenza to issue one.
 * The decision therefore travels as **data** to whichever layer composes the
 * contract, and this file is the shape of that data.
 *
 * **What it is not.** It is not authentication, and it does not detect a
 * fabricated record: a caller that composes one naming the successor it wants
 * and its own identity passes every check here, exactly as a caller supplying
 * any `issuer` does today. cadenza mints no identity and persists nothing
 * (D-0026 section 2), so it cannot tell a record that came from a surface from
 * one that came from a loop. The guarantee is a value check against a class of
 * silent error, at the same grade as the self-issue refusal, and D-0036 states
 * that price rather than burying it.
 *
 * **No transport vocabulary appears here**, and that is enforced rather than
 * intended: `test/architecture/import-boundaries.test.ts`'s "no port names a
 * transport" case walks every declared name under `src/ports/**` and refuses a
 * transport word as a whole token (D-0036 row `S-11`). A port that grew an
 * `interface GateAnswerRequest { sessionToken: string }` would be caught there,
 * where the import allowlists cannot see it -- such a type imports nothing.
 */
import { requireIdentity } from "../domain/contract.js";
import { DIGEST_PATTERN } from "../domain/digest.js";
import { InvalidDigestError, InvalidOutcomeError } from "../domain/errors.js";
import { pythonAscii, pythonTypeName } from "../domain/python-text.js";

/**
 * What a human answered. A closed union, because a third spelling would be a
 * third meaning nothing here knows how to read.
 */
export type DecisionOutcome = "approved" | "refused";

/**
 * The two members of {@link DecisionOutcome}, as a value the validator reads.
 *
 * Module-private: the type is what a consumer needs, and a second exported name
 * for the same two strings would be a second thing to keep in step. D-0033 makes
 * every name on the barrel a commitment.
 */
const DECISION_OUTCOMES: readonly DecisionOutcome[] = Object.freeze(["approved", "refused"]);

/**
 * One human decision, about one successor.
 *
 * `approved` is the field that makes this a decision rather than a permission
 * slip. A record naming only the predecessor would let **any** successor over
 * that predecessor be issued under it -- a decision about a two-key widening
 * would authorise a ten-key one -- so the human approves a specific contract,
 * identified by the digest of the exact one they were shown. The consequence
 * belongs to whoever builds the surface: the widening must be **composed before
 * it is presented**, because the digest is what is presented.
 *
 * `decisionId` is carried and never consulted here, deliberately. It exists so
 * that a refusal, an audit row and the store's own record name the same
 * decision. Its real duty -- one decision authorises at most one issuance -- is
 * *consumption*, which needs durability, and cadenza persists nothing (D-0026
 * section 2). That duty is the store's.
 */
export interface HumanDecisionRecord {
  /** The store's key for this decision. */
  readonly decisionId: string;
  /** The surface's identity, and the successor's `issuer`. */
  readonly recordedBy: string;
  readonly outcome: DecisionOutcome;
  /** The `contract_digest` replaced, or `null` when the decision opens a lineage. */
  readonly predecessor: string | null;
  /** The `contract_digest` of the successor approved. */
  readonly approved: string;
}

/**
 * Build a decision record, or refuse and name what was refused.
 *
 * **Three validators, not one**, which is D-0036 row `S-2` and the correction to
 * the obvious shorter design: reaching for `parseIdentifier` would reject every
 * digest it was given, for the colon and for the length
 * (`src/domain/identifiers.ts`). So `predecessor` and `approved` take
 * {@link DIGEST_PATTERN}, `decisionId` and `recordedBy` take `requireIdentity`
 * -- the same six checks `delegationContract()` applies to `issuer` and
 * `grantee`, **reused rather than restated**, because a restatement that dropped
 * the leading-whitespace or the lone-surrogate check would admit values the
 * promise does not cover -- and `outcome` is checked against the closed union.
 *
 * The order of the checks is the order of the fields above and is observable: an
 * input wrong in two ways reports the earlier field. It is fixed here rather
 * than left to whichever check happened to be written first, exactly as
 * `delegationContract()` fixes its own.
 *
 * The result is frozen and is a copy (D-0015). A caller who kept its input and
 * mutated it afterwards would otherwise change a record that had already been
 * checked against a contract.
 */
export function humanDecisionRecord(input: HumanDecisionRecord): HumanDecisionRecord {
  // Every field is validated at runtime even where the types already say
  // `string`: a JavaScript caller, or a cast, reaches past the types, and this
  // value decides whether a widening is issued. That is why each validator takes
  // `unknown` rather than the field's declared type.
  const decisionId = requireIdentity(input.decisionId, "decision_id");
  const recordedBy = requireIdentity(input.recordedBy, "recorded_by");
  const outcome = requireOutcome(input.outcome);
  const predecessor =
    input.predecessor === null || input.predecessor === undefined
      ? null
      : requireDigest(input.predecessor, "predecessor");
  const approved = requireDigest(input.approved, "approved");

  return Object.freeze({ decisionId, recordedBy, outcome, predecessor, approved });
}

/** The closed union, checked as a value rather than trusted as a type. */
function requireOutcome(value: unknown): DecisionOutcome {
  if (typeof value !== "string") {
    throw new InvalidOutcomeError(`outcome must be a string, got ${pythonTypeName(value)}`);
  }
  if (!(DECISION_OUTCOMES as readonly string[]).includes(value)) {
    throw new InvalidOutcomeError(
      `outcome ${pythonAscii(value)} is not one of ${DECISION_OUTCOMES.join(", ")}`,
    );
  }
  return value as DecisionOutcome;
}

/**
 * The same rule `delegationContract()` applies to `config_digest`, over the same
 * exported pattern.
 *
 * `DIGEST_PATTERN` is the shared definition (D-0011): two spellings of "sha256
 * colon hex" would be two things that could drift apart while both looking
 * right. What is restated is the refusal's wording, and that is deliberate --
 * the contract's validator is private to its module and this field is not a
 * contract field.
 */
function requireDigest(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new InvalidDigestError(`${field} must be a string, got ${pythonTypeName(value)}`);
  }
  if (!DIGEST_PATTERN.test(value)) {
    throw new InvalidDigestError(
      `${field} ${pythonAscii(value)} is not a digest: expected sha256: followed by ` +
        "64 lowercase hex digits",
    );
  }
  return value;
}
