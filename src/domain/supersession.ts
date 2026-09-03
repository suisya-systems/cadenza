/**
 * Supersession and onward delegation.
 *
 * `docs/design/g2-delegation-contract.md` section 8, against D-0026 sections 1
 * and 3.
 *
 * Both functions exist because immutability alone does not answer "under which
 * contract did it do that". A contract is never mutated in flight (D-0015), so
 * an approval is a *successor*; but a twice-granted run holding two immutable
 * contracts has two answers, and D-0026 section 3 closes that with three rules
 * together -- the successor names what it replaces, at most one contract is
 * current for a run, and every classification carries the digest it was made
 * under. The third is the classifier's (section 7); the first two are here.
 *
 * "At most one current per run" is structural rather than a registry: a holder
 * holds one value, and {@link adopt} is the only way to change which one. There
 * is no table of runs here, because a table would need an identity cadenza does
 * not mint and a lifetime it does not observe (D-0026 section 2).
 */
import { type DelegationContract, delegationContract } from "./contract.js";
import { contractDigest } from "./contract-digest.js";
import {
  AmplifiedGrantError,
  SupersessionLineageError,
  SupersessionSubjectError,
  UngrantedDelegationError,
} from "./errors.js";
import { pythonAscii } from "./python-text.js";

/** The capability a run must hold to delegate at all (D-0027 section 3). */
export const DELEGATION_CAPABILITY = "delegation.issue";

/** What a granter asks {@link delegate} to issue onward. */
export interface DelegationRequest {
  /** The sub-run the contract is for. Never the delegating run: self-issue is refused. */
  readonly grantee: string;
  readonly granted: readonly string[];
  readonly askable: readonly string[];
}

/**
 * Replace the contract a run holds, or refuse.
 *
 * Returns `next` when it is a lawful successor of `current`. `current` is `null`
 * for a run that holds nothing yet, and then `next` must open a lineage rather
 * than claim to continue one.
 *
 * What this does **not** refuse is widening. Whether the issuer held what it
 * granted is the control plane's to establish -- D-0026 section 1's
 * "authentication is not authorisation" -- and cadenza's own checkable share of
 * no-amplification is the self-issue refusal at issue time plus {@link delegate}
 * below: a run cannot widen itself, because a contract it issued to itself does
 * not exist.
 */
export function adopt(
  current: DelegationContract | null,
  next: DelegationContract,
): DelegationContract {
  // `contractDigest` is the provenance gate for both arguments (D-0028): a value
  // that never came from `delegationContract` is refused before any rule runs.
  const successorDigest = contractDigest(next);

  if (current === null) {
    if (next.supersedes !== null) {
      throw new SupersessionLineageError(
        `contract ${pythonAscii(successorDigest)} names a predecessor ` +
          `(${pythonAscii(next.supersedes)}) but the run holds none`,
      );
    }
    return next;
  }

  const currentDigest = contractDigest(current);
  if (next.supersedes !== currentDigest) {
    throw new SupersessionLineageError(
      `successor names ${next.supersedes === null ? "no predecessor" : pythonAscii(next.supersedes)}, ` +
        `but the contract it would replace is ${pythonAscii(currentDigest)}`,
    );
  }
  // The subject cannot change under a lineage. A successor for another run, or
  // over another project, is not a successor at all -- it is a second contract,
  // and adopting it would be how a run quietly ends up holding two.
  if (next.grantee !== current.grantee) {
    throw new SupersessionSubjectError(
      `successor is for grantee ${pythonAscii(next.grantee)}, not ${pythonAscii(current.grantee)}`,
    );
  }
  if (next.projectId !== current.projectId) {
    throw new SupersessionSubjectError(
      `successor is over project ${pythonAscii(next.projectId)}, not ` +
        `${pythonAscii(current.projectId)}`,
    );
  }
  return next;
}

/**
 * Issue a sub-contract from what a run holds, or refuse.
 *
 * Everything not named by `request` is inherited from `held` rather than chosen:
 * the project, its digest, and the vocabulary version. The version especially --
 * the subset rules below compare key sets, and comparing them across two
 * vocabularies would compare sets whose members are read against different
 * definitions. A sub-contract at a newer version is a contract the granter
 * issues directly, not a delegation.
 *
 * The sub-contract opens its own lineage (`supersedes` is `null`); it does not
 * continue the parent's, which belongs to a different grantee.
 */
export function delegate(held: DelegationContract, request: DelegationRequest): DelegationContract {
  // Provenance again (D-0028): a forged parent would be a grant nobody issued.
  contractDigest(held);

  const granted = new Set(held.granted);
  // Asking is answered by a superseding contract, not by proceeding, so a run
  // that may only *ask* about delegating has not been granted it. This rule is
  // what makes `delegation.issue` mean anything: without it, delegating would be
  // an authority every contract carried implicitly, which is exactly what
  // "absent means not granted" denies (D-0026 section 1).
  if (!granted.has(DELEGATION_CAPABILITY)) {
    throw new UngrantedDelegationError(
      `${DELEGATION_CAPABILITY} is not granted, so this run may not delegate`,
    );
  }

  const askableOrGranted = new Set([...held.granted, ...held.askable]);
  refuseAmplification(request.granted, granted, "granted", "granted");
  // Deliberately the wider union: turning something the parent may do unattended
  // into something the child must ask about is a *narrowing*, and refusing it
  // would be refusing the safe direction. The reverse -- a child granted what
  // its parent may only ask about -- is amplification, and the check above
  // refuses it.
  refuseAmplification(request.askable, askableOrGranted, "askable", "granted or askable");

  // Every issue-time rule applies to the result as to any other contract, so a
  // run delegating to itself is refused there (issuer is `held.grantee`), as is
  // an overlap between the two sets.
  return delegationContract({
    vocabularyVersion: held.vocabularyVersion,
    projectId: held.projectId,
    configDigest: held.configDigest,
    issuer: held.grantee,
    grantee: request.grantee,
    granted: request.granted,
    askable: request.askable,
    supersedes: null,
  });
}

function refuseAmplification(
  requested: readonly string[],
  available: ReadonlySet<string>,
  field: string,
  held: string,
): void {
  if (!Array.isArray(requested)) {
    throw new AmplifiedGrantError(`${field} must be a list of capability keys`);
  }
  for (const key of requested) {
    if (!available.has(key)) {
      throw new AmplifiedGrantError(
        `cannot delegate ${field} ${pythonAscii(String(key))}: the granter does not hold it as ${held}`,
      );
    }
  }
}
