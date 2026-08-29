/**
 * Project identity (design doc section 3.2).
 *
 * `projectId` is immutable and never reused; `aliases` are mutable display
 * names, ordered as declared and unique across the whole namespace.
 *
 * `ResolvedProject` -- the snapshot handed to a run, carrying `configDigest`
 * and per-field provenance -- is not here yet. It is the subject of
 * `tests/test_resolve.py`, and resolution is a later belt.
 */
import { type CloneSource, snapshotSource } from "./clone-source.js";

export interface Project {
  readonly projectId: string;
  readonly aliases: readonly string[];
  readonly source: CloneSource;
  readonly baseBranch: string;
}

/**
 * Build a `Project`, taking a **snapshot** of the aliases.
 *
 * The copy is not a stylistic flourish. `readonly string[]` is a compile-time
 * claim only: a mutable `string[]` is assignable to it, so a caller can hand one
 * over, keep the reference and push to it afterwards -- and `configDigest` would
 * then report a different value for a project nobody edited. Python's `tuple`
 * cannot be mutated at all, and the digest is persisted (design doc section 4),
 * so the guarantee has to survive to runtime rather than stop at the type.
 *
 * Frozen as well as copied, so a cast that reaches past the `readonly` fails
 * loudly in strict mode instead of silently succeeding.
 *
 * The same applies to `source`, and for a route the aliases do not have:
 * `CloneSource` is a structural type, so an object literal is a valid one and
 * arrives unfrozen. `snapshotSource` is what closes it.
 */
export function project(
  projectId: string,
  aliases: readonly string[],
  source: CloneSource,
  baseBranch: string,
): Project {
  return Object.freeze({
    projectId,
    aliases: Object.freeze([...aliases]),
    source: snapshotSource(source),
    baseBranch,
  });
}
