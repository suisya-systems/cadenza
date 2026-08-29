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
