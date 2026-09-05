/**
 * Agent type + resolved project + two identities -> the input a delegation
 * contract is built from.
 *
 * DECISIONS.md D-0031 section 1, implemented under D-0034. This module is a
 * **renderer**, and the word is load-bearing. D-0026 section 1 rejected roles
 * as the authority model because "a role name in a durable record means
 * whatever the role table meant at the time"; the agent-type record survives
 * that objection only by expanding to a grant **before** the contract exists,
 * so that the contract stores the expansion and the type name survives as
 * provenance. That expansion is this function, and it is the whole of it.
 *
 * What that rules out, stated so a later reader does not have to infer it:
 *
 *  - **It builds no contract.** `delegationContract()` is the only constructor
 *    and the only enforcement boundary; everything this returns is validated
 *    there, again, on the way in.
 *  - **It mints no identity and reads no clock.** `issuer` and `grantee` are
 *    the caller's, because a run is not a cadenza type and cadenza may not
 *    derive one.
 *  - **It adds nothing to the contract.** `agentTypeId` and `agentTypeDigest`
 *    do not enter `DelegationContract`: G2's field list is fixed, and the
 *    record's identity and digest are run provenance the host persists beside
 *    the contract, not fields inside it (D-0031 section 2).
 *  - **It is not consulted again.** If a later design needs the record at
 *    classification time, that is the rejected shape returning, and D-0026 is
 *    the entry that would have to be superseded rather than extended.
 */
import { type AgentType, requireAgentType } from "../domain/agent-type.js";
import type { DelegationContractInput } from "../domain/contract.js";
import type { ResolvedProject } from "../domain/project.js";

/** The two identities the caller supplies, because cadenza cannot derive either. */
export interface IssuanceParties {
  readonly issuer: string;
  readonly grantee: string;
}

/**
 * The contract input this record renders to, for an **initial** issuance.
 *
 * `supersedes` is `null`, which is what opens a lineage. A successor is not
 * this function's business: the digest it would have to name is the digest of a
 * contract that already exists, so it is `delegate`/`adopt`'s (D-0026 section
 * 3) and comes from the contract side rather than from the record.
 *
 * The identities are passed straight through, unvalidated here, because
 * `delegationContract()` validates them -- length, control characters, the lone
 * surrogate that would make the digest throw -- and a second copy of those
 * rules would be a second thing that can drift. The record, by contrast, is
 * checked: `requireAgentType` refuses anything that did not come from
 * `agentType()`, because an unbranded object's `granted` set was never bounded
 * by a vocabulary and that set is about to become a grant.
 */
export function contractInputForAgentType(
  record: AgentType,
  project: ResolvedProject,
  parties: IssuanceParties,
): DelegationContractInput {
  const type = requireAgentType(record);
  // Frozen, and the arrays copied: the returned value is a description of a
  // contract somebody is about to build, and a caller who mutated it between
  // here and `delegationContract()` would be issuing something other than what
  // the record says (D-0015).
  return Object.freeze({
    vocabularyVersion: type.vocabularyVersion,
    projectId: project.projectId,
    configDigest: project.configDigest,
    issuer: parties.issuer,
    grantee: parties.grantee,
    granted: Object.freeze([...type.granted]),
    askable: Object.freeze([...type.askable]),
    supersedes: null,
  });
}
