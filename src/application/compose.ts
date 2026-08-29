/**
 * Compose ordered layer documents into one catalog (design doc section 5).
 */

import { compareByCodePoint } from "../domain/canonical-json.js";
import { type CloneSource, parseCloneSource, type RawTable } from "../domain/clone-source.js";
import {
  CatalogError,
  MissingFieldError,
  NameCollisionError,
  SchemaVersionError,
  TombstoneError,
  UnknownFieldError,
} from "../domain/errors.js";
import { frozenSet } from "../domain/frozen.js";
import { parseIdentifier } from "../domain/identifiers.js";
import { type FieldOrigin, fieldOrigin, type Project, project } from "../domain/project.js";
import { pythonRepr } from "../domain/python-text.js";
import { parseBaseBranch } from "../domain/refs.js";
import type { LayerDocument } from "../ports/catalog-source.js";

export const SUPPORTED_SCHEMA_VERSIONS: ReadonlySet<number> = frozenSet([1]);

const TOP_LEVEL_KEYS = ["schema_version", "catalog", "project"];
const CATALOG_KEYS = ["allowed_local_roots"];
const PROJECT_KEYS = ["aliases", "source", "base_branch", "tombstone"];

/**
 * A composed catalog.
 *
 * The three mappings are **frozen plain objects**, which is the faithful reading
 * of the source's `MappingProxyType`: in a module (always strict mode) an
 * assignment to a frozen object's property throws `TypeError`, exactly as an
 * assignment to a mapping proxy does. A `Map` would have been the other
 * candidate and is worse here -- `Object.freeze` does not stop `map.set`, so the
 * runtime guarantee would have been lost and only the type would have kept it.
 *
 * A plain object is only safe because of what the keys are. JavaScript reorders
 * integer-like keys ahead of the rest, which would silently change the iteration
 * order Python's `dict` preserves -- but every key here is a `project_id`, an
 * alias, or a fixed field name, and the identifier shape
 * (`^[a-z][a-z0-9_-]{0,63}$`) cannot spell an array index.
 */
export interface Catalog {
  readonly projects: Readonly<Record<string, Project>>;
  readonly provenance: Readonly<Record<string, Readonly<Record<string, FieldOrigin>>>>;
  readonly names: Readonly<Record<string, string>>;
}

/** A project under construction, plus where each of its fields came from. */
interface Accumulator {
  readonly projectId: string;
  aliases: readonly string[];
  source: CloneSource | null;
  baseBranch: string | null;
  readonly origins: Map<string, FieldOrigin>;
}

/**
 * Whether `value` is a TOML table.
 *
 * Python asks `isinstance(value, Mapping)`, which a list, a string and a
 * datetime all fail. In JavaScript `typeof` reports "object" for an array and
 * for a `Date` alike, and a TOML parser produces both, so the prototype is what
 * is asked: a table is a plain object and nothing else.
 */
function isTable(value: unknown): value is RawTable {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

export function composeCatalog(documents: readonly LayerDocument[]): Catalog {
  const accumulated = new Map<string, Accumulator>();
  for (const document of documents) {
    applyDocument(document, accumulated);
  }
  return finish(accumulated);
}

function applyDocument(document: LayerDocument, accumulated: Map<string, Accumulator>): void {
  const data = document.data;
  refuseUnknownKeys(data, TOP_LEVEL_KEYS, document.origin);
  checkSchemaVersion(data, document.origin);
  const allowedLocalRoots = readAllowedLocalRoots(data, document.origin);

  const projects = Object.hasOwn(data, "project") ? data.project : {};
  if (!isTable(projects)) {
    throw new CatalogError("'project' must be a table", document.origin);
  }

  for (const [rawId, table] of Object.entries(projects)) {
    const location = `${document.origin}: project.${rawId}`;
    const projectId = parseIdentifier(rawId, "project_id", location);
    if (!isTable(table)) {
      throw new CatalogError(`project '${projectId}' must be a table`, location);
    }
    refuseUnknownKeys(table, PROJECT_KEYS, location);
    if (Object.hasOwn(table, "tombstone")) {
      applyTombstone(table, projectId, accumulated, location);
      continue;
    }
    applyProject(table, projectId, accumulated, document, allowedLocalRoots, location);
  }
}

function applyTombstone(
  table: RawTable,
  projectId: string,
  accumulated: Map<string, Accumulator>,
  location: string,
): void {
  const value = table.tombstone;
  if (typeof value !== "boolean") {
    throw new TombstoneError("'tombstone' must be a boolean", location);
  }
  if (!value) {
    // "tombstone = false" reads as an instruction and carries none; only the
    // absence of the key means "keep this project".
    throw new TombstoneError("'tombstone' is only meaningful as true", location);
  }
  if (Object.keys(table).length !== 1) {
    throw new TombstoneError("a tombstoned project must carry no other field", location);
  }
  if (!accumulated.has(projectId)) {
    // A stale or typo'd tombstone accepted silently makes the next typo silent
    // too (design doc section 5.5).
    throw new TombstoneError(
      `tombstone names project '${projectId}', which no earlier layer defines`,
      location,
    );
  }
  accumulated.delete(projectId);
}

function applyProject(
  table: RawTable,
  projectId: string,
  accumulated: Map<string, Accumulator>,
  document: LayerDocument,
  allowedLocalRoots: readonly string[],
  location: string,
): void {
  let entry = accumulated.get(projectId);
  if (entry === undefined) {
    entry = {
      projectId,
      aliases: [],
      source: null,
      baseBranch: null,
      origins: new Map<string, FieldOrigin>(),
    };
    accumulated.set(projectId, entry);
    entry.origins.set("project_id", originOf(document));
    // `aliases` defaults to empty, and a default is still a decision some layer
    // made. Recording its origin here keeps provenance total, so a caller can
    // index every field of a ResolvedProject rather than every field a project
    // happened to state (design doc section 5.7). A later layer that states
    // aliases overwrites this.
    entry.origins.set("aliases", originOf(document));
  }

  if (Object.hasOwn(table, "aliases")) {
    // Replaces whole: appending would leave no way to remove an alias.
    entry.aliases = parseAliases(table.aliases, location);
    entry.origins.set("aliases", originOf(document));
  }

  if (Object.hasOwn(table, "source")) {
    const sourceTable = table.source;
    if (!isTable(sourceTable)) {
      throw new CatalogError("'source' must be a table", `${location}.source`);
    }
    // Replaces whole: a field-wise merge of a tagged union can produce a shape
    // nobody wrote (design doc section 5.3). allowedLocalRoots is taken from the
    // document that states the source, never merged across layers.
    entry.source = parseCloneSource(
      sourceTable,
      document.baseDir,
      allowedLocalRoots,
      `${location}.source`,
    );
    entry.origins.set("source", originOf(document));
  }

  if (Object.hasOwn(table, "base_branch")) {
    entry.baseBranch = parseBaseBranch(table.base_branch, `${location}.base_branch`);
    entry.origins.set("base_branch", originOf(document));
  }
}

function finish(accumulated: ReadonlyMap<string, Accumulator>): Catalog {
  const projects: Record<string, Project> = {};
  const provenance: Record<string, Readonly<Record<string, FieldOrigin>>> = {};
  const names: Record<string, string> = {};
  const claims = new Map<string, [owner: string, origin: FieldOrigin]>();

  for (const [projectId, entry] of accumulated) {
    const definedAt = entry.origins.get("project_id") as FieldOrigin;
    if (entry.source === null) {
      throw new MissingFieldError(`project '${projectId}' has no source`, definedAt.file);
    }
    if (entry.baseBranch === null) {
      throw new MissingFieldError(`project '${projectId}' has no base_branch`, definedAt.file);
    }
    projects[projectId] = project(projectId, entry.aliases, entry.source, entry.baseBranch);
    provenance[projectId] = Object.freeze(Object.fromEntries(entry.origins));

    for (const [name, origin] of claimedNames(entry, definedAt)) {
      const previous = claims.get(name);
      if (previous !== undefined) {
        const [owner, ownerOrigin] = previous;
        throw new NameCollisionError(
          `name '${name}' is claimed by project '${owner}' ` +
            `(${ownerOrigin.layer}, ${ownerOrigin.file}) and by project ` +
            `'${projectId}' (${origin.layer}, ${origin.file})`,
          origin.file,
        );
      }
      claims.set(name, [projectId, origin]);
      names[name] = projectId;
    }
  }

  return Object.freeze({
    projects: Object.freeze(projects),
    provenance: Object.freeze(provenance),
    names: Object.freeze(names),
  });
}

function claimedNames(
  entry: Accumulator,
  definedAt: FieldOrigin,
): readonly (readonly [string, FieldOrigin])[] {
  const aliasOrigin = entry.origins.get("aliases") ?? definedAt;
  return [
    [entry.projectId, definedAt] as const,
    ...entry.aliases.map((alias) => [alias, aliasOrigin] as const),
  ];
}

function originOf(document: LayerDocument): FieldOrigin {
  return fieldOrigin(document.layer, document.origin);
}

function parseAliases(value: unknown, location: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CatalogError("'aliases' must be a list", location);
  }
  const aliases: string[] = [];
  for (const item of value as readonly unknown[]) {
    const alias = parseIdentifier(item, "alias", location);
    if (aliases.includes(alias)) {
      throw new NameCollisionError(`alias '${alias}' is listed twice`, location);
    }
    aliases.push(alias);
  }
  return aliases;
}

function checkSchemaVersion(data: RawTable, location: string): void {
  if (!Object.hasOwn(data, "schema_version")) {
    // SchemaVersionError rather than MissingFieldError: absence is the most
    // common spelling of "this file predates the version field", which is a
    // statement about the file's schema. MissingFieldError is reserved for a
    // project table missing one of its own required keys.
    throw new SchemaVersionError("'schema_version' is required", location);
  }
  const version = data.schema_version;
  // A `bigint` is Python's arbitrary-precision `int` arriving intact from a
  // caller that did not go through a TOML parser, so it is an integer here and
  // then falls through to "not supported", which is what CPython does with it.
  const isInteger =
    typeof version === "bigint" || (typeof version === "number" && Number.isInteger(version));
  if (typeof version === "boolean" || !isInteger) {
    throw new SchemaVersionError("'schema_version' must be an integer", location);
  }
  if (typeof version === "bigint" || !SUPPORTED_SCHEMA_VERSIONS.has(version)) {
    const supported = [...SUPPORTED_SCHEMA_VERSIONS].sort((a, b) => a - b).join(", ");
    throw new SchemaVersionError(
      `schema_version ${version} is not supported by this build (supported: ${supported})`,
      location,
    );
  }
}

function readAllowedLocalRoots(data: RawTable, location: string): readonly string[] {
  const catalog = Object.hasOwn(data, "catalog") ? data.catalog : {};
  if (!isTable(catalog)) {
    throw new CatalogError("'catalog' must be a table", location);
  }
  refuseUnknownKeys(catalog, CATALOG_KEYS, `${location}: catalog`);
  const roots = Object.hasOwn(catalog, "allowed_local_roots") ? catalog.allowed_local_roots : [];
  if (!Array.isArray(roots) || !roots.every((root) => typeof root === "string")) {
    throw new CatalogError(
      "'allowed_local_roots' must be a list of strings",
      `${location}: catalog.allowed_local_roots`,
    );
  }
  return roots as readonly string[];
}

function refuseUnknownKeys(table: RawTable, allowed: readonly string[], location: string): void {
  for (const key of Object.keys(table)) {
    if (!allowed.includes(key)) {
      const permitted = [...allowed].sort(compareByCodePoint).join(", ");
      throw new UnknownFieldError(
        `unknown key ${pythonRepr(key)} (permitted: ${permitted})`,
        location,
      );
    }
  }
}
