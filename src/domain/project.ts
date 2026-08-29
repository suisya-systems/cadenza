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
import type { CloneSource } from "./clone-source.js";

export interface Project {
  readonly projectId: string;
  readonly aliases: readonly string[];
  readonly source: CloneSource;
  readonly baseBranch: string;
}

export function project(
  projectId: string,
  aliases: readonly string[],
  source: CloneSource,
  baseBranch: string,
): Project {
  return { projectId, aliases, source, baseBranch };
}
