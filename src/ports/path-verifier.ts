/**
 * Filesystem preconditions for a local clone source.
 *
 * The domain contains a path lexically, which keeps catalog data checkable in CI
 * on a machine that has none of the operator's disks. Lexical containment is not
 * safety: a contained path can still be a symlink pointing anywhere, so a run
 * must call a verifier before cloning (design doc section 3.1).
 *
 * **An implementation ships now**, and D-0038 is where that was decided:
 * `src/adapters/local-path/verifier.ts`. The port is still the obligation's
 * name -- a caller may supply its own -- but "no implementation ships in this
 * milestone" was a hole, not a boundary. The reasoning, and the two rejected
 * owners, are in the entry.
 *
 * **The two shape changes D-0038 made to this interface, and why.**
 *
 * 1. `verify` takes the **allowed roots**. The one-argument spelling could not
 *    do the job it names: `LocalPathSource` carries only `path`, and
 *    `parseLocalPath` consumes `catalog.allowed_local_roots` and discards them,
 *    so a verifier handed only a source has nothing to be contained *in*. A
 *    verifier that answered anyway would be answering against roots it invented.
 *    The roots are layer-local (design doc section 3.3), so they travel with the
 *    call rather than being configured once per process: two layers may declare
 *    different roots, and a verifier that remembered one layer's would authorise
 *    another layer's path against it.
 * 2. `verify` **returns what it verified** rather than `void`. A check whose
 *    only output is "it did not throw" leaves the caller holding the *declared*
 *    path, so the caller walks the symlinks a second time -- and the second walk
 *    is a second answer, from a filesystem that may have moved between them. The
 *    window cannot be closed from here (see below), but handing back the exact
 *    path that was checked is what lets a caller act on the answer it was given
 *    instead of on a fresh guess.
 *
 * **What a verification is worth, stated rather than implied.** It is a
 * point-in-time answer. Between the check and the clone, a component of the path
 * can be replaced by a symlink pointing anywhere -- the classic
 * time-of-check/time-of-use window -- and nothing in a library that only reads
 * the filesystem can close it. Closing it needs the clone to be performed
 * against something the check pinned (an open directory handle, a sandbox that
 * cannot see outside the root), and that is the control plane's, not cadenza's
 * (D-0026 section 2). So this port is the precondition design doc section 3.1
 * calls mandatory, and it is not a substitute for containment at run time.
 *
 * No transport vocabulary appears here, as
 * `test/architecture/import-boundaries.test.ts` requires of every port (D-0036
 * row `S-11`).
 */
import type { LocalPathSource } from "../domain/clone-source.js";

/**
 * What a verification found, when it found nothing wrong.
 *
 * All three fields are absolute paths, and the three are deliberately distinct:
 *
 * - `declared` is what the catalog holds and what `config_digest` was computed
 *   over. It is what an audit record must name, because it is the thing an
 *   operator wrote.
 * - `real` is `declared` with every symlink resolved. It is what was actually
 *   checked, and therefore what a caller should act on.
 * - `root` is the resolved allowed root that contains `real` -- the first one
 *   that did, in the order the caller declared them. A refusal names every root;
 *   an acceptance names the one that granted it, so "why was this allowed" has
 *   an answer that does not require re-running the check.
 *
 * `declared` and `real` are equal when no component of the path is a link, which
 * is the ordinary case. When they differ, the difference is the whole reason
 * this port exists.
 */
export interface VerifiedLocalPath {
  readonly declared: string;
  readonly real: string;
  readonly root: string;
}

/**
 * Establish that a `local_path` source may be cloned from, or refuse and say
 * which of the reasons applied.
 *
 * `allowedLocalRoots` are the roots of **the layer that declared this source**,
 * exactly as `parseCloneSource` received them.
 *
 * Refusals are the `LocalPathVerificationError` family in
 * `src/domain/errors.ts`. An implementation that cannot establish the answer
 * refuses: there is no third value, and "probably fine" is the failure this
 * interface exists to prevent.
 */
export interface LocalPathVerifier {
  verify(source: LocalPathSource, allowedLocalRoots: readonly string[]): VerifiedLocalPath;
}
