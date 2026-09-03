/**
 * `contract_digest` -- a stable fingerprint of a delegation contract's
 * semantics.
 *
 * `docs/design/g2-delegation-contract.md` section 6. It is computed the way
 * `config_digest` is and over the same path: `canonicalJsonBytes` for the
 * encoding, {@link digestOf} for the `sha256:` framing (D-0011, D-0017). None of
 * that is re-derived here, because two parties comparing a digest are comparing
 * bytes, and a second implementation of the framing is a second thing that can
 * drift.
 *
 * The payload keys are the **wire** spellings while the fields they read are
 * camel-cased, for the reason `src/domain/digest.ts` records: a digest is
 * persisted and compared across parties, so it is not free to be idiomatic.
 */
import type { CanonicalValue } from "./canonical-json.js";
import type { DelegationContract } from "./contract.js";
import { digestOf } from "./digest.js";

/**
 * The semantics the digest covers: every field of the contract, and nothing
 * else.
 *
 * Three of them are worth naming, because leaving any of them out would be an
 * easy and undetectable mistake:
 *
 *  - **`grantee`.** The binding to a run is part of what the contract means
 *    (D-0026 section 1, "a contract is not a bearer token"), so two contracts
 *    differing only in grantee are two contracts and not one.
 *  - **`supersedes`.** Lineage is semantics: "under which contract did it do
 *    that" is answerable only if a successor's identity covers what it replaced
 *    (D-0026 section 3).
 *  - **`vocabulary_version`.** The same key list read against two vocabularies
 *    is two different grants, so the version cannot be outside the digest.
 *
 * `null` is written rather than omitted, so a contract that opens a lineage and
 * one that replaces something cannot collide into one digest.
 */
export function contractPayload(
  contract: DelegationContract,
): Readonly<Record<string, CanonicalValue>> {
  return {
    vocabulary_version: contract.vocabularyVersion,
    project_id: contract.projectId,
    config_digest: contract.configDigest,
    issuer: contract.issuer,
    grantee: contract.grantee,
    granted: [...contract.granted],
    askable: [...contract.askable],
    supersedes: contract.supersedes,
  };
}

/** `sha256:<hex>` over the canonical JSON encoding of the payload. */
export function contractDigest(contract: DelegationContract): string {
  return digestOf(contractPayload(contract));
}
