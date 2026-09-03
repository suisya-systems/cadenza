/**
 * Typed refusals.
 *
 * Design doc section 7: no refusal is a bare `Error` and none is silent. Every
 * catalog-level failure carries where it happened, because the operator fixing
 * it is editing a file, not reading a stack trace.
 *
 * **The one shape change from Python, and why.** `CatalogError` in Python keeps
 * the bare text on `.message` and formats `"<message> (at <location>)"` in
 * `__str__`. `Error` in JavaScript has no `__str__`: `.message` *is* what a
 * matcher sees, and `expect(...).toThrow(/.../)` tests it the way pytest's
 * `match=` tests `str(exc)`. So `.message` here carries the **formatted** text,
 * and the bare text moves to `.detail`. Spelling it the other way round would
 * have made every `match=` translated from the Python suite silently stop
 * seeing the location.
 */

/** Base class for every error cadenza raises deliberately. */
export class CadenzaError extends Error {
  constructor(message: string) {
    super(message);
    // `new.target` rather than a literal per subclass: the name is the class's
    // own, so a subclass cannot forget to set it and report its parent's.
    this.name = new.target.name;
  }
}

/**
 * A catalog input was refused.
 *
 * `location` is either a file ("config/projects.toml") or a file and the key at
 * fault ("config/projects.toml: project.web.source.url").
 */
export class CatalogError extends CadenzaError {
  /** The refusal on its own, without the location. Python's `.message`. */
  readonly detail: string;
  readonly location: string | null;

  constructor(detail: string, location: string | null = null) {
    super(location === null ? detail : `${detail} (at ${location})`);
    this.detail = detail;
    this.location = location;
  }
}

/** `schema_version` is missing, not an integer, or unknown to this build. */
export class SchemaVersionError extends CatalogError {}

/** A key no table accepts. Tables are closed (design doc section 5.6). */
export class UnknownFieldError extends CatalogError {}

/** A required key is absent. */
export class MissingFieldError extends CatalogError {}

/** A project_id or alias does not match the identifier shape. */
export class InvalidIdentifierError extends CatalogError {}

/** A `[...source]` table is not a valid tagged union member. */
export class InvalidCloneSourceError extends CatalogError {}

/** `base_branch` is not a usable git ref name. */
export class InvalidBaseBranchError extends CatalogError {}

/** One name in the flat namespace maps to more than one project. */
export class NameCollisionError extends CatalogError {}

/** A tombstone carries extra fields or names a project no layer defines. */
export class TombstoneError extends CatalogError {}

/**
 * Resolution found no project for the given name.
 *
 * Not a `CatalogError`: the catalog is fine, the typed name is not.
 */
export class ProjectNotFoundError extends CadenzaError {}

/**
 * G2's refusals (`docs/design/g2-delegation-contract.md` section 9).
 *
 * They extend `CadenzaError` directly rather than `CatalogError`, because a
 * delegation contract is not a file in this belt: serialisation at the edge is
 * unfixed (D-0026 section 2), so there is no location to carry and a `location`
 * that was always `null` would be a field pretending to be evidence. What each
 * carries instead is what it refused -- the key, the version, the identity --
 * in the message, in ASCII (D-0007).
 *
 * `InvalidIdentifierError` above is reused unchanged for a contract's
 * `project_id`: it is the same shape from the same G1 rule, and a second error
 * type for it would say the shape had two meanings.
 */

/** A contract pinned a capability-vocabulary version this build does not know. */
export class UnknownVocabularyVersionError extends CadenzaError {}

/** A granted or askable key is not in the vocabulary version the contract pinned. */
export class UnknownCapabilityError extends CadenzaError {}

/** A key is both granted and askable, which would leave an action classifiable two ways. */
export class OverlappingCapabilityError extends CadenzaError {}

/** An issuer or grantee is absent or malformed. */
export class InvalidIdentityError extends CadenzaError {}

/** A contract's issuer is its own grantee. */
export class SelfIssuedContractError extends CadenzaError {}

/** A `sha256:<hex>` digest field is not one. */
export class InvalidDigestError extends CadenzaError {}

/** A value reached a contract-reading function without coming from `delegationContract`. */
export class ForgedContractError extends CadenzaError {}

/** A successor does not name the contract it replaces, or names one that is not current. */
export class SupersessionLineageError extends CadenzaError {}

/** A successor is for another run, or over another project, so it is not a successor. */
export class SupersessionSubjectError extends CadenzaError {}

/** A run tried to delegate without holding `delegation.issue`. */
export class UngrantedDelegationError extends CadenzaError {}

/** A sub-contract would carry more than the granter holds. */
export class AmplifiedGrantError extends CadenzaError {}
