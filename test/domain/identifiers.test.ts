/**
 * Identifier shape (design doc section 2): one rule for `project_id` and alias.
 *
 * Translated from `tests/test_identifiers.py`, case by case, and accounted for
 * in `parity/identifiers.ledger.json`. The kickoff (cadenza#8) named two
 * cross-language traps for this file, and both were settled by measuring the
 * port against CPython rather than by reading the two spellings side by side
 * (DECISIONS.md D-0020):
 *
 *  - **`\Z` against `$`.** The source pattern ends `\Z`, so `"web\n"` is
 *    refused. JavaScript's `$` *without* the `m` flag anchors at the end of the
 *    input, like Python's `\Z`; **with** `m` it anchors before a line terminator,
 *    like Python's `$`. The absence of the flag is therefore load-bearing, and
 *    the target-only case below is what holds it there.
 *  - **`str.isspace()` against `/\s/`.** It does not arise here, and that is a
 *    measured result rather than an assumption: `parse_identifier` consults no
 *    whitespace predicate at all. Its gate is a positive character class, so
 *    every character outside `[a-z0-9_-]` is refused for not being in the class,
 *    whichever set a whitespace predicate would have claimed it for. The
 *    target-only case below pins that both directions of the `isspace()`/`\s`
 *    disagreement are refused, so a later rewrite of the gate into a
 *    "refuse whitespace" shape cannot loosen it unnoticed.
 */
import { describe, expect, test } from "vitest";

import { CatalogError, InvalidIdentifierError } from "../../src/domain/errors.js";
import { IDENTIFIER_PATTERN, parseIdentifier } from "../../src/domain/identifiers.js";
import { refusal } from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

/** 64 characters: the documented maximum. */
const LONGEST = `a${"b".repeat(63)}`;
/** 65 characters: one past it. */
const TOO_LONG = `a${"b".repeat(64)}`;

describe("parse_identifier", () => {
  parametrize<string>(
    "accepts lowercase identifier shapes",
    [
      ["a", "a"],
      ["web", "web"],
      ["web-app", "web-app"],
      ["web_app", "web_app"],
      ["web2", "web2"],
      [LONGEST, LONGEST],
    ],
    (value) => {
      expect(parseIdentifier(value, "project_id")).toBe(value);
    },
  );

  parametrize<string>(
    "refuses identifiers outside the shape",
    [
      ["", ""],
      ["Web", "Web"], // uppercase
      ["1web", "1web"], // leading digit
      ["-web", "-web"], // leading hyphen
      ["_web", "_web"], // leading underscore
      ["web app", "web app"],
      ["web.app", "web.app"],
      ["web/app", "web/app"],
      ["web:app", "web:app"],
      // The id is pytest's, which prints a non-ASCII parameter escaped; the
      // value is the character itself.
      ["web\\xe9", "web\u00e9"], // non-ascii
      [TOO_LONG, TOO_LONG],
    ],
    (value) => {
      const caught = refusal(InvalidIdentifierError, () => parseIdentifier(value, "project_id"));
      expect(caught.message).toMatch(/is not a valid identifier/);
    },
  );

  test("refuses a trailing newline", () => {
    // The pattern ends in `$` with no `m` flag rather than in `m`'s `$`, which
    // would match before a newline and let "web\n" become a project_id that no
    // operator can type. `IDENTIFIER_PATTERN.exec` is `re.Pattern.match`: the
    // Python call anchors at the start on its own, and the pattern's own `^`
    // does it here.
    refusal(InvalidIdentifierError, () => parseIdentifier("web\n", "project_id"));
    expect(IDENTIFIER_PATTERN.exec("web\n")).toBeNull();
  });

  parametrize<unknown>(
    "refuses non-string values naming the type",
    [
      ["123", 123],
      ["None", null],
      ["True", true],
      ["value3", ["web"]],
      ["value4", { web: 1 }],
    ],
    (value) => {
      const caught = refusal(InvalidIdentifierError, () => parseIdentifier(value, "alias"));
      expect(caught.message).toMatch(/must be a string, got/);
    },
  );

  test("error names the field and the location", () => {
    const caught = refusal(InvalidIdentifierError, () =>
      parseIdentifier("Web", "alias", "config/projects.toml: project.web"),
    );
    expect(caught.location).toBe("config/projects.toml: project.web");
    expect(caught.message).toContain("alias");
    expect(caught.message.endsWith("(at config/projects.toml: project.web)")).toBe(true);
  });

  test("identifier error is a catalog error", () => {
    // Section 7: every refusal is typed and reachable through one base class.
    // `issubclass` has no expression in TypeScript, where only the class value
    // carries a prototype chain, so the question is asked of an instance --
    // which is also how a caller tells "your catalog is broken" from anything
    // else.
    const caught = refusal(InvalidIdentifierError, () => parseIdentifier("Web", "alias"));
    expect(caught).toBeInstanceOf(CatalogError);
  });
});

/**
 * Target-only: the two traps, held open.
 *
 * Neither translates a source case. `tests/test_identifiers.py` cannot state
 * them, because in Python there is nothing to state -- `\Z` is `\Z`, and
 * `str.isspace()` is the only whitespace predicate there is. Both are declared
 * in `parity/identifiers.ledger.json` under `target_only_tests`.
 */
describe("the identifier pattern's anchors and its refusal set", () => {
  test("carries no flags, because 'm' would restore Python's '$'", () => {
    expect(IDENTIFIER_PATTERN.flags).toBe("");
    // Measured, not asserted from the manual: the same source with `m` accepts
    // exactly what this belt exists to refuse, and on four terminators rather
    // than Python's one -- JavaScript's `m` also breaks a line at CR, U+2028 and
    // U+2029.
    const withMultiline = new RegExp(IDENTIFIER_PATTERN.source, "m");
    for (const terminator of ["\n", "\r", "\u2028", "\u2029"]) {
      expect(withMultiline.test(`web${terminator}`)).toBe(true);
      expect(IDENTIFIER_PATTERN.test(`web${terminator}`)).toBe(false);
    }
  });

  test("refuses whitespace on both sides of the isspace()/\\s disagreement", () => {
    // The six code points where `str.isspace()` and `/\s/` disagree, in both
    // directions: U+001C..U+001F and U+0085 are whitespace to Python only,
    // U+FEFF to JavaScript only (src/domain/python-text.ts). An identifier gate
    // written as "refuse whitespace" would admit whichever set it did not ask
    // about; this one is a positive class, so all six are refused for the same
    // reason every other outsider is.
    for (const code of [0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xfeff]) {
      const character = String.fromCodePoint(code);
      expect(IDENTIFIER_PATTERN.test(`web${character}`)).toBe(false);
      expect(IDENTIFIER_PATTERN.test(`web${character}app`)).toBe(false);
      refusal(InvalidIdentifierError, () => parseIdentifier(`web${character}`, "project_id"));
    }
  });
});
