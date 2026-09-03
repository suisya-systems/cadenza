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
  InvalidDigestError,
  InvalidIdentityError,
  OverlappingCapabilityError,
  SelfIssuedContractError,
  UnknownCapabilityError,
  UnknownVocabularyVersionError,
} from "./errors.js";
import { parseIdentifier } from "./identifiers.js";
import { isControlCharacter, isPythonSpace, pythonRepr, pythonTypeName } from "./python-text.js";

/** D-0026 section 1: opaque to cadenza, but not unbounded. Design document section 4.1. */
export const MAX_IDENTITY_LENGTH = 256;

/** A delegation contract, frozen and valid by construction. */
export interface DelegationContract {
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
      `issuer ${pythonRepr(issuer)} is its own grantee: a contract cannot be self-issued`,
    );
  }

  const projectId = parseIdentifier(input.projectId, "project_id");
  const configDigest = requireDigest(input.configDigest, "config_digest");
  const supersedes =
    input.supersedes === undefined || input.supersedes === null
      ? null
      : requireDigest(input.supersedes, "supersedes");

  return Object.freeze({
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
        `capability ${pythonRepr(key)} is both granted and askable: the two sets are disjoint`,
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
      throw new InvalidIdentityError(`${field} ${pythonRepr(value)} contains a control character`);
    }
  }
  const first = Array.from(value)[0] as string;
  const last = Array.from(value)[length - 1] as string;
  if (isPythonSpace(first) || isPythonSpace(last)) {
    throw new InvalidIdentityError(
      `${field} ${pythonRepr(value)} has leading or trailing whitespace`,
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
      `${field} ${pythonRepr(value)} is not a digest: expected sha256: followed by ` +
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
  return typeof value === "string" ? pythonRepr(value) : `${String(value)}`;
}

function known(versions: ReadonlySet<number>): string {
  return [...versions]
    .sort((left, right) => left - right)
    .map((version) => String(version))
    .join(", ");
}
