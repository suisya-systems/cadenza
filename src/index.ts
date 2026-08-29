/**
 * The port's public surface, as far as it has been ported.
 *
 * G1's answer to "given a name an operator typed, which project is that?" needs
 * composition and resolution, and neither is here yet: this bootstrap ports the
 * configuration digest and the value types it reads. What the barrel exports is
 * therefore a statement about progress, and `parity/` is where that statement
 * is checked.
 */
export {
  type CanonicalValue,
  canonicalJson,
  canonicalJsonBytes,
  compareByCodePoint,
  SurrogateInStringError,
} from "./domain/canonical-json.js";
export {
  type CloneSource,
  type GitUrlSource,
  gitUrlSource,
  type LocalPathSource,
  localPathSource,
  type NewRepositorySource,
  newRepositorySource,
  snapshotSource,
  toCanonical,
} from "./domain/clone-source.js";
export { canonicalPayload, configDigest } from "./domain/digest.js";
export { type Project, project } from "./domain/project.js";
