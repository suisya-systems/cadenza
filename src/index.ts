/**
 * The port's public surface, as far as it has been ported.
 *
 * G2 has begun beside it: the capability vocabulary D-0027 fixes, the delegation
 * contract as a frozen value with its issue-time refusals, `contract_digest`
 * over the same canonical-JSON path `config_digest` takes, and the total
 * three-valued classifier, and supersession with onward delegation. G2's belt is
 * complete as far as D-0026 and D-0027 fix it, and the vocabulary now has a
 * second version: D-0037 adds the five acts daily operation performs that version
 * 1 could not name, and records the acts it deliberately still cannot. Version 1
 * is untouched, so every contract pinned at it answers exactly as it did.
 *
 * Beside G2 rather than inside it: the **agent-type record** (D-0031, with its
 * schema fixed by D-0034) -- a frozen value carrying two capability key sets, a
 * loop policy the conductor reads, an executor policy nothing here reads, and
 * its own `agent_type_digest`, plus the renderer that turns one into a
 * `DelegationContractInput`. It is not a second authority: the sets are inputs
 * to contract construction, and `delegationContract()` remains the only
 * constructor.
 *
 * G1's answer to "given a name an operator typed, which project is that?" needs
 * composition and resolution, and both are here now: the digest pilot brought
 * the configuration digest and the value types it reads, and the composition
 * belt brought the composer, the resolver and the TOML layer loader. What the
 * barrel exports is a statement about progress, and `parity/` is where that
 * statement is checked.
 *
 * **This file is also the package's one public entry point** (D-0033). It is
 * the only module `exports` names, so a consumer -- rondo, under D-0029 --
 * reaches everything through `@suisya-systems/cadenza` and nothing through a
 * deep path into `dist/`. That makes the list below two things at once: the
 * progress statement it always was, and the surface cadenza is answerable for.
 * Adding a name here is now a commitment, and D-0029's falsifier is the other
 * edge of it -- a host that has to reach past this file for a value or a type
 * says the boundary is in the wrong place.
 *
 * There is deliberately **no gate API**, and D-0036 corrects how that used to be
 * said here. The verbs belong to continuo; what is new is the one shape a human
 * answer takes on the way in. It is **not** a field on a classification --
 * `ClassificationContext` is exactly `{ runId, configDigest }` and names no gate
 * -- so the older wording ("a gate outcome is an input to {@link classify}")
 * sent a reader looking for a parameter that does not exist. A human approval
 * enters cadenza's semantics as a **new contract**: a widening successor,
 * carried in by {@link supersedeOnDecision} against a
 * {@link HumanDecisionRecord} the surface supplies. That is a value check and
 * not an authority -- cadenza mints no identity, so it cannot tell a claimed
 * answerer from a proven one, and D-0036 states the price.
 */

export {
  LOCAL_FILENAME,
  TomlCatalogSource,
  TRACKED_FILENAME,
} from "./adapters/toml-catalog/loader.js";
export {
  contractInputForAgentType,
  type IssuanceParties,
} from "./application/agent-type-issuance.js";
export { type Catalog, composeCatalog, SUPPORTED_SCHEMA_VERSIONS } from "./application/compose.js";
export { supersedeOnDecision } from "./application/human-decision.js";
export { resolveProject } from "./application/resolve.js";
export {
  type AgentType,
  type AgentTypeInput,
  agentType,
  agentTypeDigest,
  agentTypePayload,
  type ExecutorPolicy,
  isAgentType,
  type LoopPolicy,
  MAX_POLICY_THRESHOLD,
  MAX_REPORTING_DUTIES,
  requireAgentType,
} from "./domain/agent-type.js";
export {
  type CanonicalValue,
  canonicalJson,
  canonicalJsonBytes,
  compareByCodePoint,
  NonIntegerNumberError,
  SurrogateInStringError,
} from "./domain/canonical-json.js";
export {
  CAPABILITY_KEY_PATTERN,
  isCapabilityKey,
  KNOWN_VOCABULARY_VERSIONS,
  MAX_CAPABILITY_KEY_LENGTH,
  VOCABULARY_VERSION_1,
  VOCABULARY_VERSION_2,
  vocabularyFor,
} from "./domain/capability.js";
export {
  type Classification,
  type ClassificationContext,
  type ClassificationReason,
  classify,
  type IntendedAction,
  type Outcome,
} from "./domain/classification.js";
export {
  ALLOWED_URL_SCHEMES,
  type CloneSource,
  type GitUrlSource,
  gitUrlSource,
  type LocalPathSource,
  localPathSource,
  type NewRepositorySource,
  newRepositorySource,
  parseCloneSource,
  type RawTable,
  snapshotSource,
  toCanonical,
} from "./domain/clone-source.js";
export {
  type DelegationContract,
  type DelegationContractInput,
  delegationContract,
  isDelegationContract,
  MAX_IDENTITY_LENGTH,
  requireContract,
} from "./domain/contract.js";
export { contractDigest, contractPayload } from "./domain/contract-digest.js";
export { canonicalPayload, configDigest, DIGEST_PATTERN, digestOf } from "./domain/digest.js";
export {
  AmplifiedGrantError,
  CadenzaError,
  CatalogError,
  DecisionMismatchError,
  ForgedAgentTypeError,
  ForgedContractError,
  InvalidBaseBranchError,
  InvalidCloneSourceError,
  InvalidDigestError,
  InvalidIdentifierError,
  InvalidIdentityError,
  InvalidOutcomeError,
  InvalidPolicyError,
  MissingFieldError,
  NameCollisionError,
  OverlappingCapabilityError,
  ProjectNotFoundError,
  SchemaVersionError,
  SelfIssuedContractError,
  SupersessionLineageError,
  SupersessionSubjectError,
  TombstoneError,
  UnapprovedDecisionError,
  UngrantedDelegationError,
  UnknownCapabilityError,
  UnknownFieldError,
  UnknownVocabularyVersionError,
} from "./domain/errors.js";
export { IDENTIFIER_PATTERN, parseIdentifier } from "./domain/identifiers.js";
export {
  type FieldOrigin,
  fieldOrigin,
  type Project,
  project,
  type ResolvedProject,
} from "./domain/project.js";
export { getCloseMatches } from "./domain/python-difflib.js";
export { nativePath, type PathFlavour, posix, windows } from "./domain/python-path.js";
export { parseBaseBranch } from "./domain/refs.js";
export {
  adopt,
  DELEGATION_CAPABILITY,
  type DelegationRequest,
  delegate,
} from "./domain/supersession.js";
export {
  type CatalogSource,
  type LayerDocument,
  layerDocument,
} from "./ports/catalog-source.js";
export {
  type DecisionOutcome,
  type HumanDecisionRecord,
  humanDecisionRecord,
} from "./ports/human-decision.js";
export type { LocalPathVerifier } from "./ports/path-verifier.js";
