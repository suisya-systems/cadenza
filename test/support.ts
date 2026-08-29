/**
 * Test helper: build `LayerDocument`s without a filesystem.
 *
 * Translated from `tests/support.py`. Composition takes layer documents, not
 * files, so most cases never need TOML; only `test/adapters/toml-loader.test.ts`
 * goes through the adapter.
 */
import type { RawTable } from "../src/domain/clone-source.js";
import { nativePath } from "../src/domain/python-path.js";
import { type LayerDocument, layerDocument } from "../src/ports/catalog-source.js";

/**
 * Absolute, because `layerDocument` refuses a relative `baseDir`: a relative
 * anchor would leave an anchored `local_path` relative too, and the run-side
 * consumer would finish anchoring it against its own CWD.
 *
 * "Absolute" is platform-specific, and this is the trap the source records: on
 * Windows a path with no drive letter -- `/srv/catalog` -- is drive-RELATIVE, so
 * `PureWindowsPath.is_absolute()` is false for it and the refusal fires. Every
 * absolute path a test invents has to come from here rather than from a
 * POSIX-shaped literal.
 */
const ANCHOR = nativePath.name === "windows" ? "C:" : "";

/** An absolute path on this platform, for tests that need one by name. */
export function absolute(...parts: readonly string[]): string {
  return nativePath.normpath(`${ANCHOR}/${parts.join("/")}`);
}

export const CATALOG_DIR = absolute("srv", "catalog");
// `tests/support.py` also exports ELSEWHERE, and it is deliberately not here:
// only `tests/test_clone_source.py` uses it, and that file is not this belt's.
// An export nothing imports is what `npm run knip` exists to refuse, so it comes
// over with the belt that needs it.
export const TRACKED_ORIGIN = nativePath.join(CATALOG_DIR, "projects.toml");
export const LOCAL_ORIGIN = nativePath.join(CATALOG_DIR, "projects.local.toml");

export function makeLayer(
  data: RawTable,
  options: { layer?: string; origin?: string; baseDir?: string } = {},
): LayerDocument {
  const layer = options.layer ?? "tracked";
  const origin = options.origin ?? (layer === "tracked" ? TRACKED_ORIGIN : LOCAL_ORIGIN);
  return layerDocument(layer, origin, options.baseDir ?? CATALOG_DIR, data);
}

/**
 * A minimal complete project table.
 *
 * The source spells the extras as `**extra` and merges them with
 * `table.update(extra)`, which appends them **after** `source` and
 * `base_branch`. The spread below keeps that order, and the order is not
 * cosmetic: `refuseUnknownKeys` reports the first offending key it meets, so
 * moving the extras to the front would change which key a refusal names.
 *
 * The result is deliberately **not** frozen: a source case builds a table and
 * then assigns a typo'd key into it.
 */
export function gitUrlProject(
  options: { url?: string; baseBranch?: string; extra?: Record<string, unknown> } = {},
): Record<string, unknown> {
  return {
    source: { kind: "git_url", url: options.url ?? "https://example.invalid/org/repo.git" },
    base_branch: options.baseBranch ?? "main",
    ...(options.extra ?? {}),
  };
}

/**
 * Run `body`, require that it threw `kind`, and hand the error back.
 *
 * `expect(...).toThrow(Kind)` checks the class and `toThrow(/re/)` checks the
 * message, but neither yields the *instance*, and a large share of the source
 * cases go on to assert `caught.value.location`. This is `pytest.raises(...) as
 * caught`, with the same failure when nothing is raised.
 */
export function refusal<T extends Error>(
  kind: abstract new (...args: never[]) => T,
  body: () => unknown,
): T {
  try {
    body();
  } catch (error) {
    if (error instanceof kind) {
      return error;
    }
    throw error;
  }
  throw new Error(`expected ${kind.name} to be thrown, but nothing was`);
}
