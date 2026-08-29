/**
 * Project identity (design doc section 3.2).
 *
 * `projectId` is immutable and never reused; `aliases` are mutable display
 * names, ordered as declared and unique across the whole namespace.
 *
 * `ResolvedProject` -- the snapshot handed to a run, carrying `configDigest` and
 * per-field provenance -- arrived with the composition belt, which ports
 * `tests/test_resolve.py`.
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

/** Which layer, and which file within it, decided one field. */
export interface FieldOrigin {
  readonly layer: string;
  readonly file: string;
}

/** Frozen for the reason {@link project} is: provenance is reported, not edited. */
export function fieldOrigin(layer: string, file: string): FieldOrigin {
  return Object.freeze({ layer, file });
}

/**
 * What a run persists.
 *
 * `configDigest` is what makes a later audit possible: a run that recorded only
 * the typed name cannot tell that the catalog moved underneath it.
 */
export interface ResolvedProject {
  readonly projectId: string;
  readonly aliases: readonly string[];
  readonly source: CloneSource;
  readonly baseBranch: string;
  readonly configDigest: string;
  readonly provenance: Readonly<Record<string, FieldOrigin>>;
}
