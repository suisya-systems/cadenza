/**
 * `configDigest` -- a stable fingerprint of a project's configuration.
 *
 * Design doc section 4. The digest is `sha256:<hex>` over the canonical JSON
 * encoding of the project's **semantics**, and it is a persisted value: a run
 * records it, and a later audit uses a changed digest as the signal that the
 * catalog moved underneath a run that already happened.
 *
 * That makes byte-identity with the Python implementation a hard requirement
 * rather than a nicety, and it is why the payload keys below are the **wire**
 * spellings (`project_id`, `base_branch`) while the TypeScript fields they read
 * from are camel-cased. The digest is not free to be idiomatic; the field names
 * are.
 */
import { createHash } from "node:crypto";

import { type CanonicalValue, canonicalJsonBytes, compareByCodePoint } from "./canonical-json.js";
import { toCanonical } from "./clone-source.js";
import type { Project } from "./project.js";

/**
 * The semantics the digest covers.
 *
 * Provenance and file paths are deliberately absent: moving a catalog file, or
 * restating a field in a different layer, must not change what the digest says
 * about the project. The digest is a statement about configuration, not about
 * where it was typed.
 *
 * Aliases are sorted, so that reordering a display-only list does not read as a
 * configuration change -- sorted by **code point**, which is what Python's
 * `sorted()` does and what the default `Array.prototype.sort` does not.
 */
export function canonicalPayload(value: Project): Readonly<Record<string, CanonicalValue>> {
  return {
    project_id: value.projectId,
    aliases: [...value.aliases].sort(compareByCodePoint),
    source: toCanonical(value.source),
    base_branch: value.baseBranch,
  };
}

/** `sha256:<hex>` over the canonical JSON encoding of the payload. */
export function configDigest(value: Project): string {
  const encoded = canonicalJsonBytes(canonicalPayload(value));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}
