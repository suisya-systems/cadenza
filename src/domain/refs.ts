/**
 * Validation of git ref names used as a base branch.
 *
 * The rules mirror the subset of `git check-ref-format` that matters for a
 * branch name (design doc section 3.2). They are applied lexically so that a
 * catalog stays checkable without a repository present.
 *
 * The validator's job is to move a git-level refusal earlier, so the property
 * that matters is one-directional: it must refuse everything git refuses, and it
 * is allowed to be stricter. `tests/test_refs.py` pins that direction against
 * `git check-ref-format` itself -- 62 source cases, and this belt does not port
 * them; it ports the composer that calls this function. The ledgers record that.
 */
import { InvalidBaseBranchError } from "./errors.js";
import { isControlCharacter, isPythonSpace, pythonRepr, pythonTypeName } from "./python-text.js";

const FORBIDDEN_CHARACTERS = "~^:?*[\\";

function refuse(reason: string, location: string | null): InvalidBaseBranchError {
  return new InvalidBaseBranchError(`base_branch ${reason}`, location);
}

/** Return `value` as a valid branch name, or refuse. */
export function parseBaseBranch(value: unknown, location: string | null = null): string {
  if (typeof value !== "string") {
    throw new InvalidBaseBranchError(
      `base_branch must be a string, got ${pythonTypeName(value)}`,
      location,
    );
  }
  if (value === "") {
    throw refuse("must not be empty", location);
  }
  // `for..of` yields code points, which is what iterating a Python `str` does.
  // A `for (i = 0; i < value.length; ...)` loop would yield UTF-16 code units
  // and split an astral character into two halves that are neither whitespace
  // nor control, so a surrogate pair would be inspected as something it is not.
  for (const character of value) {
    if (isPythonSpace(character) || isControlCharacter(character)) {
      throw refuse(
        `${pythonRepr(value)} must not contain whitespace or control characters`,
        location,
      );
    }
    if (FORBIDDEN_CHARACTERS.includes(character)) {
      throw refuse(
        `${pythonRepr(value)} must not contain any of ${pythonRepr(FORBIDDEN_CHARACTERS)}`,
        location,
      );
    }
  }
  if (value.includes("..")) {
    throw refuse(`${pythonRepr(value)} must not contain '..'`, location);
  }
  if (value.includes("@{")) {
    throw refuse(`${pythonRepr(value)} must not contain '@{'`, location);
  }
  if (value.includes("//")) {
    throw refuse(`${pythonRepr(value)} must not contain '//'`, location);
  }
  if (value.startsWith("/") || value.endsWith("/")) {
    throw refuse(`${pythonRepr(value)} must not start or end with '/'`, location);
  }
  if (value.startsWith("-")) {
    throw refuse(
      `${pythonRepr(value)} must not start with '-': it would be read as an option`,
      location,
    );
  }
  for (const component of value.split("/")) {
    if (component.startsWith(".")) {
      throw refuse(
        `${pythonRepr(value)} must not contain a component beginning with '.'`,
        location,
      );
    }
    if (component.endsWith(".lock")) {
      throw refuse(`${pythonRepr(value)} must not end with '.lock'`, location);
    }
  }
  if (value.endsWith(".")) {
    // git check-ref-format rejects a trailing dot outright. Accepting it here
    // would let a catalog compose cleanly and then fail at the clone, which is
    // the failure this validator exists to move earlier.
    throw refuse(`${pythonRepr(value)} must not end with '.'`, location);
  }
  if (value === "@") {
    // A bare '@' is git's shorthand for HEAD in revision syntax, so a
    // base_branch of '@' means one thing to the catalog and another to whatever
    // resolves it. Refusing beats picking a reading.
    throw refuse("must not be the single character '@'", location);
  }
  return value;
}
