/**
 * Where raw layer documents come from.
 */
import type { RawTable } from "../domain/clone-source.js";
import { nativePath } from "../domain/python-path.js";
import { pythonRepr } from "../domain/python-text.js";

/**
 * One layer file, parsed but not yet validated.
 *
 * `baseDir` travels with the document because a relative `local_path` is
 * anchored to the directory of the file that declared it, never to the process
 * CWD (design doc section 3.1).
 *
 * That anchor must itself be absolute, and {@link layerDocument} refuses a
 * relative one rather than trusting its callers. A relative anchor would make
 * the anchored path relative too, so the run-side consumer would re-anchor it
 * against whatever CWD it happened to have -- the exact behaviour section 3.1
 * forbids, reached one level up. It would also make `config_digest` depend on
 * the directory cadenza was invoked from, which section 4 says it must not.
 * Resolving the anchor is the job of whoever knows where the file was found.
 */
export interface LayerDocument {
  readonly layer: string;
  readonly origin: string;
  readonly baseDir: string;
  readonly data: RawTable;
}

/**
 * Build a `LayerDocument`, refusing a relative `baseDir`.
 *
 * The refusal is a `RangeError` and deliberately **not** a `CadenzaError`. The
 * source raises a bare `ValueError` from `__post_init__` here, and that is not
 * an oversight against design doc section 7: section 7 governs *catalog*
 * refusals, which name a file and a key an operator can go and edit. This one is
 * a class invariant broken by a caller inside cadenza, and a caller's bug is not
 * an operator's typo. `RangeError` is JavaScript's `ValueError`: the type is
 * right, the value is not.
 */
export function layerDocument(
  layer: string,
  origin: string,
  baseDir: string,
  data: RawTable,
): LayerDocument {
  if (!nativePath.isPathlibAbsolute(baseDir)) {
    throw new RangeError(
      `base_dir must be absolute, got ${pythonRepr(baseDir)}; ` +
        "a relative anchor would be re-anchored to the process CWD",
    );
  }
  return Object.freeze({ layer, origin, baseDir, data });
}

/** Yields layer documents in precedence order, lowest first. */
export interface CatalogSource {
  load(): readonly LayerDocument[];
}
