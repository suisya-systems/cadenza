/**
 * Filesystem preconditions for a local clone source.
 *
 * The domain contains a path lexically, which keeps catalog data checkable in CI
 * on a machine that has none of the operator's disks. Lexical containment is not
 * safety: a contained path can still be a symlink pointing anywhere, so a run
 * must call a verifier before cloning (design doc section 3.1). No
 * implementation ships in this milestone; the port names the obligation.
 */
import type { LocalPathSource } from "../domain/clone-source.js";

export interface LocalPathVerifier {
  verify(source: LocalPathSource): void;
}
