/**
 * Project identifiers: an immutable `project_id` and a mutable alias share one
 * shape (design doc section 2).
 */
import { InvalidIdentifierError } from "./errors.js";
import { pythonRepr, pythonTypeName } from "./python-text.js";

/**
 * `^[a-z][a-z0-9_-]{0,63}\Z`, and the anchor is the point.
 *
 * Python's `$` also matches *before* a trailing newline, which would let
 * `"web\n"` through as a `project_id`; the source spells the end anchor `\Z` to
 * refuse it. JavaScript's `$` without the `m` flag behaves like Python's `\Z`
 * rather than like Python's `$`, so the naive translation happens to be correct
 * -- which is exactly why `docs/porting.md` section 7 records it as a trap
 * rather than leaving it to be rediscovered. Written with `\r?\n` in mind: there
 * is no `m` flag here and there must not be one.
 */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/** Return `value` as a valid identifier, or refuse. */
export function parseIdentifier(
  value: unknown,
  field: string,
  location: string | null = null,
): string {
  if (typeof value !== "string") {
    throw new InvalidIdentifierError(
      `${field} must be a string, got ${pythonTypeName(value)}`,
      location,
    );
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidIdentifierError(
      `${field} ${pythonRepr(value)} is not a valid identifier: expected ` +
        "a lowercase letter followed by up to 63 of [a-z0-9_-]",
      location,
    );
  }
  return value;
}
