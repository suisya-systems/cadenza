/**
 * The delegation contract as a value, and the refusals that stand between a
 * caller and an invalid one.
 *
 * `docs/design/g2-delegation-contract.md` sections 4 and 5, against DECISIONS.md
 * D-0026 and D-0027.
 *
 * The load-bearing property of this module is negative: **there is no route to
 * an invalid contract**. `delegationContract` validates every rule before it
 * returns, and nothing else constructs one, so "classifying against an invalid
 * contract is refused" (D-0026 section 3) needs no branch in the classifier --
 * it cannot be handed one. That is why the type is an interface with a factory
 * rather than a class with public fields, and why the factory validates its
 * inputs at runtime even where the types already say `string`: a JavaScript
 * caller, or a cast, reaches past the types, and the contract is a persisted,
 * digested value (D-0015).
 */

import { compareByCodePoint } from "./canonical-json.js";
import {
  isCapabilityKey,
  KNOWN_VOCABULARY_VERSIONS,
  MAX_CAPABILITY_KEY_LENGTH,
  vocabularyFor,
} from "./capability.js";
import { DIGEST_PATTERN } from "./digest.js";
import {
  ForgedContractError,
  InvalidDigestError,
  InvalidIdentityError,
  OverlappingCapabilityError,
  SelfIssuedContractError,
  UnknownCapabilityError,
  UnknownVocabularyVersionError,
} from "./errors.js";
import { parseIdentifier } from "./identifiers.js";
import { isControlCharacter, isPythonSpace, pythonAscii, pythonTypeName } from "./python-text.js";

/** D-0026 section 1: opaque to cadenza, but not unbounded. Design document section 4.1. */
export const MAX_IDENTITY_LENGTH = 256;

/**
 * The mark {@link delegationContract} leaves and nothing else can.
 *
 * Without it `DelegationContract` is a structural type, so an object literal
 * with the right fields is one as far as the type checker is concerned -- and
 * "valid by construction" would be a claim the types actively fail to make.
 * The symbol is module-private, so no caller can name the property, and it
 * exists at runtime as well as in the type, so a JavaScript caller or a cast is
 * caught too (see {@link isDelegationContract}).
 */
const CONTRACT_BRAND: unique symbol = Symbol("cadenza.delegation-contract");

/** A delegation contract, frozen and valid by construction. */
export interface DelegationContract {
  /** Set only by {@link delegationContract}; unreachable from outside this module. */
  readonly [CONTRACT_BRAND]: true;
  readonly vocabularyVersion: number;
  readonly projectId: string;
  readonly configDigest: string;
  readonly issuer: string;
  readonly grantee: string;
  /** Sorted by code point, unique, frozen. Order and repetition are not semantics. */
  readonly granted: readonly string[];
  /** Sorted by code point, unique, frozen, and disjoint from {@link granted}. */
  readonly askable: readonly string[];
  /** The `contract_digest` this replaces, or `null` when it opens a lineage. */
  readonly supersedes: string | null;
}

/** What a caller supplies. Every field is validated; none is defaulted. */
export interface DelegationContractInput {
  readonly vocabularyVersion: number;
  readonly projectId: string;
  readonly configDigest: string;
  readonly issuer: string;
  readonly grantee: string;
  readonly granted: readonly string[];
  readonly askable: readonly string[];
  readonly supersedes?: string | null;
}

/**
 * Build a contract, or refuse and name what was refused.
 *
 * The order of the checks is the order of the design document's section 5 table,
 * so a reader comparing the two does not have to hold a permutation in their
 * head. It is observable -- an input wrong in two ways reports the earlier rule
 * -- which is why it is fixed here rather than left to whichever check the
 * implementation happened to write first.
 */
export function delegationContract(input: DelegationContractInput): DelegationContract {
  const version = requireKnownVersion(input.vocabularyVersion);
  const vocabulary = vocabularyFor(version) as ReadonlySet<string>;

  const granted = canonicalKeys(input.granted, "granted", version, vocabulary);
  const askable = canonicalKeys(input.askable, "askable", version, vocabulary);
  refuseOverlap(granted, askable);

  const issuer = requireIdentity(input.issuer, "issuer");
  const grantee = requireIdentity(input.grantee, "grantee");
  if (issuer === grantee) {
    throw new SelfIssuedContractError(
      `issuer ${pythonAscii(issuer)} is its own grantee: a contract cannot be self-issued`,
    );
  }

  const projectId = parseIdentifier(input.projectId, "project_id");
  const configDigest = requireDigest(input.configDigest, "config_digest");
  const supersedes =
    input.supersedes === undefined || input.supersedes === null
      ? null
      : requireDigest(input.supersedes, "supersedes");

  return Object.freeze({
    [CONTRACT_BRAND]: true as const,
    vocabularyVersion: version,
    projectId,
    configDigest,
    issuer,
    grantee,
    granted,
    askable,
    supersedes,
  });
}

/**
 * True only for a value {@link delegationContract} produced.
 *
 * The type-level half of the brand stops an object literal at compile time; this
 * is the half that survives a cast and a JavaScript caller. Anything that reads
 * a contract's semantics -- `contractDigest` today, the classifier next --
 * checks it, because a forged contract is exactly the invalid contract the
 * design document says cannot exist (section 4).
 */
export function isDelegationContract(value: unknown): value is DelegationContract {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[CONTRACT_BRAND] === true
  );
}

/** Refuse anything that did not come from {@link delegationContract}. */
export function requireContract(value: unknown): DelegationContract {
  if (!isDelegationContract(value)) {
    throw new ForgedContractError(
      "value was not produced by delegationContract(): a contract carries a mark " +
        "no caller can set, and one without it has been through no validation",
    );
  }
  return value;
}

/** Rule 1. A version this build does not know refuses the whole contract. */
function requireKnownVersion(value: unknown): number {
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
 * A key is checked against the vocabulary the contract **pinned**, never the
 * newest this build knows: a contract that gained meaning it did not have when
 * it was issued is the drift D-0026 section 1 refuses. The refusal names the
 * version for that reason -- "unknown capability" on its own sends the reader
 * hunting for a typo when the fault is a contract pinned one version too low.
 */
function canonicalKeys(
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
function refuseOverlap(granted: readonly string[], askable: readonly string[]): void {
  const asked = new Set(askable);
  // `granted` is already in code-point order, so the key named is a function of
  // the contract rather than of the order the caller wrote its lists in.
  for (const key of granted) {
    if (asked.has(key)) {
      throw new OverlappingCapabilityError(
        `capability ${pythonAscii(key)} is both granted and askable: the two sets are disjoint`,
      );
    }
  }
}

/**
 * Rule 4. Opaque, but not unbounded (design document section 4.1).
 *
 * The lone-surrogate check is not taste. `contractDigest` encodes the identity
 * through `canonicalJsonBytes`, which throws `SurrogateInStringError` on an
 * unpaired surrogate (D-0013); an identity that passed validation and then made
 * the digest throw would be a contract that exists and cannot be classified,
 * since every classification carries the digest. It is refused here, where a
 * refusal is what the caller is expecting.
 */
function requireIdentity(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new InvalidIdentityError(`${field} must be a string, got ${pythonTypeName(value)}`);
  }
  const length = Array.from(value).length;
  if (length === 0) {
    throw new InvalidIdentityError(`${field} must not be empty`);
  }
  if (length > MAX_IDENTITY_LENGTH) {
    throw new InvalidIdentityError(
      `${field} is ${length} characters, which is longer than the ${MAX_IDENTITY_LENGTH} allowed`,
    );
  }
  for (const character of value) {
    if (isControlCharacter(character)) {
      throw new InvalidIdentityError(`${field} ${pythonAscii(value)} contains a control character`);
    }
  }
  const first = Array.from(value)[0] as string;
  const last = Array.from(value)[length - 1] as string;
  if (isPythonSpace(first) || isPythonSpace(last)) {
    throw new InvalidIdentityError(
      `${field} ${pythonAscii(value)} has leading or trailing whitespace`,
    );
  }
  if (hasLoneSurrogate(value)) {
    throw new InvalidIdentityError(
      `${field} contains an unpaired surrogate, which cannot be encoded as UTF-8 ` +
        "and so could not be digested",
    );
  }
  return value;
}

/** Rules 7 and 8. */
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

/** The same scan `canonicalJson` makes, asked as a question instead of a throw. */
function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit < 0xd800 || unit > 0xdfff) {
      continue;
    }
    const isHigh = unit <= 0xdbff;
    const next = index + 1 < value.length ? value.charCodeAt(index + 1) : Number.NaN;
    if (isHigh && next >= 0xdc00 && next <= 0xdfff) {
      index += 1;
      continue;
    }
    return true;
  }
  return false;
}

/** A value in a refusal message: quoted if it is a string, named if it is not. */
function describe(value: unknown): string {
  return typeof value === "string" ? pythonAscii(value) : `${String(value)}`;
}

function known(versions: ReadonlySet<number>): string {
  return [...versions]
    .sort((left, right) => left - right)
    .map((version) => String(version))
    .join(", ");
}
