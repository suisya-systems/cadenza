/**
 * Name -> ResolvedProject (design doc section 6).
 */
import { compareByCodePoint } from "../domain/canonical-json.js";
import { configDigest } from "../domain/digest.js";
import { ProjectNotFoundError } from "../domain/errors.js";
import type { ResolvedProject } from "../domain/project.js";
import { getCloseMatches } from "../domain/python-difflib.js";
import type { Catalog } from "./compose.js";

const MAX_SUGGESTIONS = 5;

export function resolveProject(catalog: Catalog, name: string): ResolvedProject {
  const projectId = Object.hasOwn(catalog.names, name) ? catalog.names[name] : undefined;
  if (projectId === undefined) {
    throw new ProjectNotFoundError(notFoundMessage(catalog, name));
  }
  const found = catalog.projects[projectId] as (typeof catalog.projects)[string];
  return Object.freeze({
    projectId: found.projectId,
    aliases: found.aliases,
    source: found.source,
    baseBranch: found.baseBranch,
    // The digest is what lets a later reader tell that the catalog moved under a
    // run that already happened (design doc section 3.2).
    configDigest: configDigest(found),
    provenance: catalog.provenance[projectId] as Readonly<
      Record<string, (typeof catalog.provenance)[string][string]>
    >,
  });
}

function notFoundMessage(catalog: Catalog, name: string): string {
  // Python's `sorted()` on a dict yields its keys in code-point order, which is
  // also the order the suggestions are drawn from.
  const known = Object.keys(catalog.names).sort(compareByCodePoint);
  const suggestions = getCloseMatches(name, known, MAX_SUGGESTIONS);
  if (suggestions.length === 0) {
    return `no project is named '${name}'`;
  }
  return `no project is named '${name}'. Closest known names: ${suggestions.join(", ")}`;
}
