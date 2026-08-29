/**
 * The port's public surface, as far as it has been ported.
 *
 * G1's answer to "given a name an operator typed, which project is that?" needs
 * composition and resolution, and both are here now: the digest pilot brought
 * the configuration digest and the value types it reads, and the composition
 * belt brought the composer, the resolver and the TOML layer loader. What the
 * barrel exports is a statement about progress, and `parity/` is where that
 * statement is checked.
 */
export {
  LOCAL_FILENAME,
  TomlCatalogSource,
  TRACKED_FILENAME,
} from "./adapters/toml-catalog/loader.js";
export { type Catalog, composeCatalog, SUPPORTED_SCHEMA_VERSIONS } from "./application/compose.js";
export { resolveProject } from "./application/resolve.js";
export {
  type CanonicalValue,
  canonicalJson,
  canonicalJsonBytes,
  compareByCodePoint,
  SurrogateInStringError,
} from "./domain/canonical-json.js";
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
export { canonicalPayload, configDigest } from "./domain/digest.js";
export {
  CadenzaError,
  CatalogError,
  InvalidBaseBranchError,
  InvalidCloneSourceError,
  InvalidIdentifierError,
  MissingFieldError,
  NameCollisionError,
  ProjectNotFoundError,
  SchemaVersionError,
  TombstoneError,
  UnknownFieldError,
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
  type CatalogSource,
  type LayerDocument,
  layerDocument,
} from "./ports/catalog-source.js";
export type { LocalPathVerifier } from "./ports/path-verifier.js";
