/**
 * The agent-type record: a frozen value that renders into a delegation
 * contract, carrying its own digest and two policy bags.
 *
 * DECISIONS.md D-0031 fixes what the record means and D-0034 fixes what it
 * *is* -- the grammar of each field, the order of the refusals, the canonical
 * payload the digest is taken over, and the fact that this belt supplies the
 * value and no store.
 *
 * Three properties are the whole point of the module, and each is easy to lose
 * by accident:
 *
 *  - **The record is not an authority.** `granted` and `askable` are *inputs to
 *    contract construction* (D-0031 section 1). Nothing here classifies
 *    anything, `delegationContract()` is still the only constructor of a
 *    contract, and `src/application/agent-type-issuance.ts` is a renderer that
 *    reaches this record for its key sets and nothing else.
 *  - **`executorPolicy` is carried, never interpreted** (D-0031 section 3).
 *    This module validates its shape, snapshots it and digests it. It does not
 *    read what a tier or a role *means*, and nothing in `domain`,
 *    `application`, `ports` or the conductor's loop may.
 *  - **Immutability is deep and snapshot-based** (D-0015). `readonly` is a
 *    compile-time claim; a caller who keeps its input array and pushes to it
 *    afterwards would otherwise change a record whose digest was already
 *    persisted. Every array and every nested object is copied and frozen.
 *
 * The digest lives here rather than in a module of its own, which is the one
 * place this file's shape differs from G2's. `contract_digest` is computed on
 * demand from a contract, so `src/domain/contract-digest.ts` can sit beside
 * `contract.ts`; `agent_type_digest` is a **field of the record**, so a
 * separate module would have to import this one to read the record while this
 * one imported it to build the field.
 */

import type { CanonicalValue } from "./canonical-json.js";
import { compareByCodePoint } from "./canonical-json.js";
import {
  canonicalCapabilityKeys,
  describe,
  refuseCapabilityOverlap,
  requireKnownVocabularyVersion,
  vocabularyFor,
} from "./capability.js";
import { digestOf } from "./digest.js";
import { ForgedAgentTypeError, InvalidIdentifierError, InvalidPolicyError } from "./errors.js";
import { parseIdentifier } from "./identifiers.js";
import { escapeNonAscii, pythonTypeName } from "./python-text.js";

/**
 * The ceiling on every `loopPolicy` count.
 *
 * A bound rather than an open positive integer, for two reasons that are not
 * taste. A count is written by a human and read by the conductor's loop, so a
 * value three orders of magnitude past anything a review loop could run is a
 * typo rather than a policy, and refusing it here is cheaper than discovering
 * it at attempt 100000. And every member is digested, so an unbounded field is
 * unbounded input to a persisted value.
 */
export const MAX_POLICY_THRESHOLD = 1024;

/** The ceiling on how many reporting duties one record may carry. */
export const MAX_REPORTING_DUTIES = 32;

/**
 * What the conductor reads (D-0031 section 3).
 *
 * **Exactly three members, and the absence of a fourth is deliberate.**
 * `docs/design/conductor.md` names a reader for each: section 4 gives review to
 * the conductor, so `maxReviewRounds` has one; section 6.3 spells the halt
 * condition `NoProgress(window, repeat, key=verify detail)`, so the other two
 * do. Section 10 walks the loop end to end and names no third reader. A hard
 * attempt cap was drafted and dropped: it is digested like everything else, so
 * a member added now and removed later moves every record's `agent_type_digest`
 * -- a field with no reader is not free, and D-0031 admitted `loopPolicy` on
 * exactly the ground that its members have interpreters.
 *
 * Counts, not clocks. No duration, no deadline, no predicate and no callback:
 * a halt condition over a running process needs an observer and a clock, and
 * cadenza's layers have neither (D-0026 section 2).
 */
export interface LoopPolicy {
  /** How many review rounds the loop may run. Integer, 1..{@link MAX_POLICY_THRESHOLD}. */
  readonly maxReviewRounds: number;
  /** How many recent attempts the no-progress condition looks at. Integer, in range. */
  readonly noProgressWindow: number;
  /** How many repeats within that window mean no progress. Integer, 1..`noProgressWindow`. */
  readonly noProgressRepeat: number;
}

/**
 * What the invocation adapter reads, and nothing here does (D-0031 section 3).
 *
 * Every member is validated **structurally** -- it is a string of the
 * identifier shape, or a list of them -- and never semantically. cadenza does
 * not know which roles exist, what a tier denotes, or whether a duty is
 * satisfiable; rondo's invocation adapter owns all three (rondo D-0014, and
 * C-15 is its gate's). That is what lets a model tier be expressible without
 * naming an executor anywhere in `domain`, `application` or `ports`.
 *
 * The identifier grammar is G1's, reused rather than reinvented: it is ASCII,
 * bounded, and already the shape this repository means by "a name of our own".
 * It is also what keeps a concrete model name from fitting comfortably, though
 * cadenza cannot and does not check that -- refusing a provider's product name
 * would require knowing the provider, which is the knowledge this field exists
 * to avoid holding.
 */
export interface ExecutorPolicy {
  /** cadenza's own neutral role name. The adapter maps it onto an executor's roster. */
  readonly roleName: string;
  /** A neutral tier label. What it denotes is the adapter's, and is unspent today. */
  readonly modelTier: string;
  /** Sorted by code point, unique, frozen. Order and repetition are not semantics. */
  readonly reportingDuties: readonly string[];
}

/**
 * What a caller supplies. Every field is validated; none is defaulted; the
 * digest is **not** among them -- it is computed, never accepted.
 */
export interface AgentTypeInput {
  readonly agentTypeId: string;
  readonly vocabularyVersion: number;
  readonly granted: readonly string[];
  readonly askable: readonly string[];
  readonly loopPolicy: LoopPolicy;
  readonly executorPolicy: ExecutorPolicy;
}

/**
 * The type-level half of the mark {@link agentType} leaves.
 *
 * Declared and never created, exactly as `contract.ts`'s is, and for the reason
 * recorded there: a real symbol property is carried across by a spread, so
 * `{ ...record, loopPolicy: other }` would pass a brand check while holding
 * fields that had been through no validation. {@link MINTED} is the half a copy
 * cannot inherit.
 */
declare const AGENT_TYPE_BRAND: unique symbol;

/** The records this process actually built. Weak, and readable only by identity. */
const MINTED = new WeakSet<object>();

/** An agent-type record: frozen, digested, and valid by construction. */
export interface AgentType {
  /** Set only by {@link agentType}; unreachable from outside this module. */
  readonly [AGENT_TYPE_BRAND]: true;
  readonly agentTypeId: string;
  readonly vocabularyVersion: number;
  /** Sorted by code point, unique, frozen. Order and repetition are not semantics. */
  readonly granted: readonly string[];
  /** Sorted by code point, unique, frozen, and disjoint from {@link granted}. */
  readonly askable: readonly string[];
  readonly loopPolicy: LoopPolicy;
  readonly executorPolicy: ExecutorPolicy;
  /** `sha256:<hex>` over {@link agentTypePayload}. Computed here, never supplied. */
  readonly agentTypeDigest: string;
}

/** The members each closed table accepts, and nothing else. */
const INPUT_KEYS = new Set([
  "agentTypeId",
  "vocabularyVersion",
  "granted",
  "askable",
  "loopPolicy",
  "executorPolicy",
]);
const LOOP_POLICY_KEYS = new Set(["maxReviewRounds", "noProgressWindow", "noProgressRepeat"]);
const EXECUTOR_POLICY_KEYS = new Set(["roleName", "modelTier", "reportingDuties"]);

/**
 * Build a record, or refuse and name what was refused.
 *
 * The order of the checks is D-0034 section 8's table, and it is observable:
 * an input wrong in two ways reports the earlier rule. It is fixed there
 * rather than left to whichever check this implementation happened to write
 * first, and a case in `test/domain/agent-type.test.ts` pins it.
 *
 * The numbering below is that table's, and it is deliberately **not** the
 * numbering of `docs/design/g2-delegation-contract.md` section 5: these are
 * different rules over a different value, and a reader who assumed rule 4 meant
 * the same thing in both places would be reading the wrong document.
 *
 * Rules 2 to 4 are `capability.ts`'s, shared with `delegationContract()` --
 * the same three rules over the same vocabulary, so a second implementation
 * would be a second thing that can drift apart while both look right.
 */
export function agentType(input: AgentTypeInput): AgentType {
  // Rule 1.
  refuseUnknownMembers(input, INPUT_KEYS, "the agent-type record");

  const version = requireKnownVocabularyVersion(input.vocabularyVersion);
  const vocabulary = vocabularyFor(version) as ReadonlySet<string>;

  const granted = canonicalCapabilityKeys(input.granted, "granted", version, vocabulary);
  const askable = canonicalCapabilityKeys(input.askable, "askable", version, vocabulary);
  refuseCapabilityOverlap(granted, askable);

  const agentTypeId = requireAgentTypeId(input.agentTypeId);
  const loopPolicy = requireLoopPolicy(input.loopPolicy);
  const executorPolicy = requireExecutorPolicy(input.executorPolicy);

  // The digest is taken over the validated, canonical fields rather than over
  // the record, because the record does not exist until the digest does. It is
  // the same payload `agentTypePayload` builds -- the test that the two agree
  // is what keeps that sentence true.
  const agentTypeDigest = digestOf(
    payloadOf({
      agentTypeId,
      vocabularyVersion: version,
      granted,
      askable,
      loopPolicy,
      executorPolicy,
    }),
  );

  const record = Object.freeze({
    agentTypeId,
    vocabularyVersion: version,
    granted,
    askable,
    loopPolicy,
    executorPolicy,
    agentTypeDigest,
  }) as AgentType;
  MINTED.add(record);
  return record;
}

/**
 * True only for a value {@link agentType} produced.
 *
 * The type-level brand stops an object literal at compile time; this is the
 * half that survives a cast and a JavaScript caller. Anything that reads a
 * record's semantics checks it, because a record whose fields went through no
 * validation is a record whose `granted` set was never bounded by a vocabulary
 * -- and that set becomes a contract.
 */
export function isAgentType(value: unknown): value is AgentType {
  return typeof value === "object" && value !== null && MINTED.has(value);
}

/** Refuse anything that did not come from {@link agentType}. */
export function requireAgentType(value: unknown): AgentType {
  if (!isAgentType(value)) {
    throw new ForgedAgentTypeError(
      "value was not produced by agentType(): a record is recognised by identity, and a " +
        "copy of one has been through no validation",
    );
  }
  return value;
}

/**
 * The semantics the digest covers: every field of the record except the digest
 * itself.
 *
 * The keys are the **wire** spellings while the fields they read are
 * camel-cased, for the reason `src/domain/digest.ts` records: a digest is
 * persisted and compared across parties, so it is not free to be idiomatic.
 *
 * Both policy bags are written whole. `executorPolicy` is covered even though
 * nothing here reads it, and that is the point: a record whose tier changed
 * under an unchanged digest would make "under what policy did it run" -- the
 * question D-0031 section 2 gives the digest to answer -- unanswerable.
 */
export function agentTypePayload(value: AgentType): Readonly<Record<string, CanonicalValue>> {
  // Checked rather than trusted, the way `contractPayload` checks: a digest
  // over an unvalidated object would be a digest two parties could agree on
  // while one of them held something that was never a record.
  return payloadOf(requireAgentType(value));
}

/**
 * `sha256:<hex>` over the canonical JSON encoding of the payload.
 *
 * Always equal to the record's own `agentTypeDigest`; it recomputes rather than
 * returning the field, so that the field is checkable rather than merely
 * asserted. The framing is `digestOf` -- the same path `config_digest` and
 * `contract_digest` take (D-0011, D-0017) -- and deliberately not
 * `configDigest`, which is typed over a `Project` and whose oracle corpus this
 * belt does not touch.
 */
export function agentTypeDigest(value: AgentType): string {
  return digestOf(agentTypePayload(value));
}

/** The payload, over fields already validated. */
function payloadOf(value: {
  readonly agentTypeId: string;
  readonly vocabularyVersion: number;
  readonly granted: readonly string[];
  readonly askable: readonly string[];
  readonly loopPolicy: LoopPolicy;
  readonly executorPolicy: ExecutorPolicy;
}): Readonly<Record<string, CanonicalValue>> {
  return {
    agent_type_id: value.agentTypeId,
    vocabulary_version: value.vocabularyVersion,
    granted: [...value.granted],
    askable: [...value.askable],
    loop_policy: {
      max_review_rounds: value.loopPolicy.maxReviewRounds,
      no_progress_window: value.loopPolicy.noProgressWindow,
      no_progress_repeat: value.loopPolicy.noProgressRepeat,
    },
    executor_policy: {
      role_name: value.executorPolicy.roleName,
      model_tier: value.executorPolicy.modelTier,
      reporting_duties: [...value.executorPolicy.reportingDuties],
    },
  };
}

/**
 * Rule 5, in ASCII.
 *
 * The rule is G1's and is reused unchanged; what is added is the escaping, for
 * the reason `contract.ts`'s `requireProjectId` records. `parseIdentifier`
 * formats the refused value with `repr`, which keeps printable Unicode --
 * correct there, because the ported suite pins those messages against
 * CPython's -- and D-0007 requires everything cadenza prints to be ASCII.
 */
function requireAgentTypeId(value: unknown): string {
  try {
    return parseIdentifier(value, "agent_type_id");
  } catch (error) {
    if (error instanceof InvalidIdentifierError) {
      throw new InvalidIdentifierError(escapeNonAscii(error.detail), error.location);
    }
    throw error;
  }
}

/** Rule 6. Three counts, each in range, and a window that its repeat fits inside. */
function requireLoopPolicy(value: unknown): LoopPolicy {
  const table = requireTable(value, "loop_policy");
  refuseUnknownMembers(table, LOOP_POLICY_KEYS, "loop_policy");

  const maxReviewRounds = requireCount(table.maxReviewRounds, "loop_policy.max_review_rounds");
  const noProgressWindow = requireCount(table.noProgressWindow, "loop_policy.no_progress_window");
  const noProgressRepeat = requireCount(table.noProgressRepeat, "loop_policy.no_progress_repeat");
  if (noProgressRepeat > noProgressWindow) {
    // A repeat larger than the window can never be reached, so the condition it
    // parameterises could never fire: the loop would run to nothing rather than
    // halt. That is a policy which says one thing and does another, which is
    // worse than one refused at the door.
    throw new InvalidPolicyError(
      `loop_policy.no_progress_repeat ${noProgressRepeat} is larger than ` +
        `loop_policy.no_progress_window ${noProgressWindow}, so the condition could never fire`,
    );
  }
  return Object.freeze({ maxReviewRounds, noProgressWindow, noProgressRepeat });
}

/**
 * Rule 7. Structural, and structural only.
 *
 * Read what this does **not** do: it never asks whether `roleName` is a role
 * that exists, whether `modelTier` denotes a model, or whether a duty is one
 * anything can discharge. Those are the invocation adapter's questions, and a
 * check here would make cadenza a second interpreter of a bag D-0031 section 3
 * says has exactly one.
 */
function requireExecutorPolicy(value: unknown): ExecutorPolicy {
  const table = requireTable(value, "executor_policy");
  refuseUnknownMembers(table, EXECUTOR_POLICY_KEYS, "executor_policy");

  const roleName = requireNeutralName(table.roleName, "executor_policy.role_name");
  const modelTier = requireNeutralName(table.modelTier, "executor_policy.model_tier");

  const supplied = table.reportingDuties;
  if (!Array.isArray(supplied)) {
    throw new InvalidPolicyError(
      `executor_policy.reporting_duties must be a list, got ${pythonTypeName(supplied)}`,
    );
  }
  // Read once, then work only from what was read, and keep the *validated*
  // return rather than revisiting the input. An array index may be an accessor
  // -- `Array.isArray` stays true for such an array and for a Proxy over one --
  // so a validate-then-re-read would let the second read put a name
  // `parseIdentifier` refuses into a frozen record, or put a lone surrogate
  // into the payload and make `digestOf` throw where a named refusal was
  // promised. This module exists to make an invalid record unreachable, and
  // "unreachable" has to hold against the exotic caller too.
  const entries = [...supplied];
  if (entries.length > MAX_REPORTING_DUTIES) {
    throw new InvalidPolicyError(
      `executor_policy.reporting_duties holds ${entries.length} entries, which is more than ` +
        `the ${MAX_REPORTING_DUTIES} allowed`,
    );
  }
  const validated = entries.map((duty) =>
    requireNeutralName(duty, "executor_policy.reporting_duties"),
  );
  // Sorted and de-duplicated for the reason the capability sets are: two
  // callers who mean the same duties produce the same value and therefore the
  // same digest.
  const reportingDuties = Object.freeze([...new Set(validated)].sort(compareByCodePoint));
  return Object.freeze({ roleName, modelTier, reportingDuties });
}

/** A non-null, non-array object -- the shape a policy bag has. */
function requireTable(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidPolicyError(`${field} must be a table, got ${pythonTypeName(value)}`);
  }
  return value as Record<string, unknown>;
}

/**
 * Closed tables, the move G1 section 5.6 makes for every table in the catalog.
 *
 * Here it protects the digest rather than the operator. Every member of every
 * table is digested, so a member this build does not recognise would be
 * dropped silently -- and two records a caller meant differently would share
 * one `agent_type_digest`, which is the single failure the digest exists to
 * prevent.
 *
 * `DelegationContractInput` is **not** closed to match, and that divergence is
 * deliberate: D-0031's consequences say G2 is not reopened by the record's
 * belt, so the difference is recorded in D-0034 rather than smoothed over.
 */
function refuseUnknownMembers(value: object, allowed: ReadonlySet<string>, field: string): void {
  // Sorted, so the key a refusal names is a function of the input rather than
  // of the order the caller's object literal happened to be written in.
  const unknown = Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort(compareByCodePoint);
  if (unknown.length > 0) {
    throw new InvalidPolicyError(
      `${field} has no member ${describe(unknown[0] as string)}: the table is closed`,
    );
  }
}

/** A count: an integer, at least one, and not past the ceiling. */
function requireCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    // Non-integers are refused here rather than at the encoder, where the same
    // value would throw `NonIntegerNumberError` from inside a digest (D-0013).
    // A record that exists and cannot be digested would be a record that
    // cannot be persisted, and the refusal belongs where the caller is
    // expecting one.
    throw new InvalidPolicyError(`${field} must be an integer, got ${pythonTypeName(value)}`);
  }
  if (value < 1 || value > MAX_POLICY_THRESHOLD) {
    throw new InvalidPolicyError(
      `${field} is ${value}, which is outside 1..${MAX_POLICY_THRESHOLD}`,
    );
  }
  return value;
}

/** A name of cadenza's own: the G1 identifier shape, refused in ASCII. */
function requireNeutralName(value: unknown, field: string): string {
  try {
    return parseIdentifier(value, field);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) {
      throw new InvalidPolicyError(escapeNonAscii(error.detail));
    }
    throw error;
  }
}
