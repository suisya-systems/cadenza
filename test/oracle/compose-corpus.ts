/**
 * The TypeScript half of the composition oracle's corpus.
 *
 * Stated **independently** of `scripts/oracle/dump_compose_digest.py`, which is
 * the point: the comparison in `test/application/compose-oracle.test.ts` reads
 * only the *outputs* from the committed vector, never the inputs. A corpus read
 * out of the vector would agree with itself no matter how wrong it was.
 *
 * Every non-ASCII character is written as an escape rather than as a literal, so
 * this file is pure ASCII. Two of these cases differ only by Unicode
 * normalisation; spelled as literals they would be a pair no reviewer can tell
 * apart and no editor promises to leave alone.
 *
 * The ids and their order must match the Python half exactly; the test asserts
 * that before it compares a single digest.
 *
 * **The anchor differs from the Python half's on purpose.** That half writes
 * `/srv/catalog`, which `layerDocument` would refuse on Windows because a
 * drive-less path is drive-relative there; this half asks `test/support.ts` for
 * an absolute path on whatever platform is running. The two agree anyway, and
 * that they must is the claim of design doc section 4 -- file paths are outside
 * the payload -- which the corpus's own `restated-in-both-layers` case states
 * directly.
 */
import type { RawTable } from "../../src/domain/clone-source.js";
import type { LayerDocument } from "../../src/ports/catalog-source.js";
import { makeLayer } from "../support.js";

const WEB_URL = "https://example.invalid/org/web.git";

function gitUrlProject(
  options: { url?: string; baseBranch?: string; aliases?: readonly string[] } = {},
): RawTable {
  const table: Record<string, unknown> = {
    source: { kind: "git_url", url: options.url ?? WEB_URL },
    base_branch: options.baseBranch ?? "main",
  };
  if (options.aliases !== undefined) {
    table["aliases"] = [...options.aliases];
  }
  return table;
}

function tracked(projects: Record<string, unknown>): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects });
}

function local(projects: Record<string, unknown>): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects }, { layer: "local" });
}

export interface ComposeCase {
  readonly id: string;
  readonly documents: readonly LayerDocument[];
  /** The name handed to `resolveProject`. */
  readonly name: string;
}

export const COMPOSE_CORPUS: readonly ComposeCase[] = [
  { id: "single-layer", documents: [tracked({ web: gitUrlProject() })], name: "web" },
  {
    id: "aliases-sorted-into-the-payload",
    documents: [tracked({ web: gitUrlProject({ aliases: ["site", "frontend"] }) })],
    name: "web",
  },
  {
    id: "aliases-sorted-across-punctuation",
    documents: [tracked({ web: gitUrlProject({ aliases: ["z", "a_b", "a-b", "a0b"] }) })],
    name: "web",
  },
  {
    id: "local-layer-overrides-base-branch",
    documents: [
      tracked({ web: gitUrlProject({ aliases: ["site"] }) }),
      local({ web: { base_branch: "develop" } }),
    ],
    name: "web",
  },
  {
    id: "local-layer-replaces-the-source-whole",
    documents: [tracked({ web: gitUrlProject() }), local({ web: { source: { kind: "new" } } })],
    name: "web",
  },
  {
    id: "local-layer-removes-an-alias",
    documents: [
      tracked({ web: gitUrlProject({ aliases: ["site", "frontend"] }) }),
      local({ web: { aliases: ["site"] } }),
    ],
    name: "web",
  },
  {
    id: "resolved-by-alias",
    documents: [tracked({ web: gitUrlProject({ aliases: ["site"] }) })],
    name: "site",
  },
  {
    // U+4E3B U+7DDA -- "main line", two ordinary BMP characters the ref
    // validator admits and the encoder must carry through unescaped.
    id: "non-ascii-base-branch",
    documents: [tracked({ web: gitUrlProject({ baseBranch: "\u4e3b\u7dda" }) })],
    name: "web",
  },
  {
    // "cafe" + U+00E9: composed.
    id: "base-branch-nfc",
    documents: [tracked({ web: gitUrlProject({ baseBranch: "caf\u00e9" }) })],
    name: "web",
  },
  {
    // "cafe" + U+0301 COMBINING ACUTE ACCENT: decomposed, and a different
    // configuration, because nothing normalises and nothing should.
    id: "base-branch-nfd",
    documents: [tracked({ web: gitUrlProject({ baseBranch: "cafe\u0301" }) })],
    name: "web",
  },
  {
    id: "survivor-of-a-tombstone",
    documents: [
      tracked({ web: gitUrlProject({ aliases: ["site"] }), api: gitUrlProject() }),
      local({ web: { tombstone: true } }),
    ],
    name: "api",
  },
  {
    // U+00FC in the host: stored as written, never as a URL parser would
    // rewrite it.
    id: "idn-host",
    documents: [
      tracked({ web: gitUrlProject({ url: "https://b\u00fccher.example/org/web.git" }) }),
    ],
    name: "web",
  },
  {
    id: "restated-in-both-layers",
    documents: [tracked({ web: gitUrlProject() }), local({ web: gitUrlProject() })],
    name: "web",
  },
];
