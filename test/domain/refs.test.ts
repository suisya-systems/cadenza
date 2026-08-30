/**
 * `parse_base_branch`: the git ref rules for a catalog's `base_branch`
 * (design doc section 3.2), one case per stated refusal, plus the corpus that
 * pins the validator's one-directional property against `git
 * check-ref-format` itself.
 *
 * Ported from `tests/test_refs.py`. The mapping, case by case, is
 * `parity/refs.ledger.json`.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { InvalidBaseBranchError } from "../../src/domain/errors.js";
import { parseBaseBranch } from "../../src/domain/refs.js";
import { refusal } from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

const ACCEPTS: readonly (readonly [id: string, value: string])[] = [
  ["main", "main"],
  ["develop", "develop"],
  ["feature/g1-registry", "feature/g1-registry"],
  ["release-1.2.0", "release-1.2.0"],
  ["v1.0", "v1.0"],
  ["a.b", "a.b"],
];

/**
 * `[id, value, expected]`. `expected` is a `RegExp` in the two rows whose
 * source pattern is itself a regex -- `main..dev` and
 * `main.lock`/`feature/x.lock`, whose `match=` is `r"...'\.\.'"` /
 * `r"...'\.lock'"` -- carried over as a `RegExp` built from the same
 * characters rather than re-derived by hand as a substring of the rendered
 * text (DECISIONS.md D-0021: the source regex's only metacharacter is an
 * escaped, literal dot, so a plain substring of what `pythonRepr` actually
 * prints -- no backslash -- would have been an equally correct translation,
 * but transcribing the regex source's backslashes into a plain string instead
 * would not be, and a `RegExp` is what removes the choice). Every other row is
 * a plain substring, exactly as pytest's `match=` reduces to for a pattern
 * with no other regex metacharacters.
 */
const VIOLATIONS: readonly (readonly [id: string, value: string, expected: string | RegExp])[] = [
  ["-must not be empty", "", "must not be empty"],
  [
    "main branch-whitespace or control characters",
    "main branch",
    "whitespace or control characters",
  ],
  [
    "main\\tbranch-whitespace or control characters",
    "main\tbranch",
    "whitespace or control characters",
  ],
  [
    "main\\nbranch-whitespace or control characters",
    "main\nbranch",
    "whitespace or control characters",
  ],
  ["main\\x01-whitespace or control characters", "main\x01", "whitespace or control characters"],
  ["main\\x7f-whitespace or control characters", "main\x7f", "whitespace or control characters"],
  ["main~1-must not contain any of", "main~1", "must not contain any of"],
  ["main^-must not contain any of", "main^", "must not contain any of"],
  ["refs:main-must not contain any of", "refs:main", "must not contain any of"],
  ["main?-must not contain any of", "main?", "must not contain any of"],
  ["main*-must not contain any of", "main*", "must not contain any of"],
  ["main[0]-must not contain any of", "main[0]", "must not contain any of"],
  ["main\\\\branch-must not contain any of", "main\\branch", "must not contain any of"],
  ["main..dev-must not contain '\\\\.\\\\.'", "main..dev", /must not contain '\.\.'/],
  ["main@{1}-must not contain '@", "main@{1}", "must not contain '@"],
  ["/main-must not start or end with '/'", "/main", "must not start or end with '/'"],
  ["main/-must not start or end with '/'", "main/", "must not start or end with '/'"],
  ["feature//x-must not contain '//'", "feature//x", "must not contain '//'"],
  ["-main-would be read as an option", "-main", "would be read as an option"],
  [".main-component beginning with", ".main", "component beginning with"],
  ["feature/.hidden-component beginning with", "feature/.hidden", "component beginning with"],
  ["main.lock-must not end with '\\\\.lock'", "main.lock", /must not end with '\.lock'/],
  ["feature/x.lock-must not end with '\\\\.lock'", "feature/x.lock", /must not end with '\.lock'/],
];

const NON_STRING: readonly (readonly [id: string, value: unknown])[] = [
  ["1", 1],
  ["None", null],
  ["True", true],
  ["value3", ["main"]],
];

/**
 * Every shape the validator makes a decision about, plus the two Codex found.
 * The point of the corpus is that git, not this file, says what the answer is.
 */
const PARITY_CORPUS: readonly string[] = [
  "main",
  "feat/cadenza-bootstrap",
  "release-1.2",
  "a.b",
  "release.",
  "a.",
  "feat/x.",
  "x.lock",
  "feat/x.lock",
  ".hidden",
  "feat/.hidden",
  "a..b",
  "a b",
  "a~b",
  "a^b",
  "a:b",
  "a?b",
  "a*b",
  "a[b",
  "a\\b",
  "a@{b",
  "a//b",
  "/leading",
  "trailing/",
];
/** pytest doubles the one literal backslash in `"a\\b"` when it builds the id. */
const PARITY_CORPUS_IDS: readonly string[] = PARITY_CORPUS.map((name) =>
  name === "a\\b" ? "a\\\\b" : name,
);

const CODEX_SHAPES: readonly string[] = ["release.", "a.", "feat/x.", "@"];

/**
 * `shutil.which("git")`, mechanically: spawn it and see whether the OS can
 * find it on `PATH`. `execFileSync` never invokes a shell, so this asks the
 * same question `subprocess.run([str(GIT), ...])` does and nothing more.
 */
function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = gitAvailable();

/** `git check-ref-format refs/heads/<name>`, returncode-only, check=False. */
function gitAcceptsBranchName(name: string): boolean {
  try {
    execFileSync("git", ["check-ref-format", `refs/heads/${name}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("parse_base_branch", () => {
  parametrize("accepts ordinary branch names", ACCEPTS, (value) => {
    expect(parseBaseBranch(value)).toBe(value);
  });

  parametrize(
    "refuses each documented ref violation",
    VIOLATIONS.map(([id, value, expected]) => [id, { value, expected }] as const),
    ({ value, expected }) => {
      expect(() => parseBaseBranch(value)).toThrow(expected);
    },
  );

  parametrize("refuses non-string values naming the type", NON_STRING, (value) => {
    expect(() => parseBaseBranch(value)).toThrow("must be a string, got");
  });

  test("error carries the location it was given", () => {
    const location = "config/projects.toml: project.web.base_branch";
    const caught = refusal(InvalidBaseBranchError, () => parseBaseBranch("main..dev", location));
    expect(caught.location).toBe(location);
    expect(caught.message.endsWith(`(at ${location})`)).toBe(true);
  });

  // Not routed through `testkit/parametrize`: pytest's `skipif` marker applies
  // once to the whole parametrized function, and vitest has no per-case
  // equivalent that composes with the shared helper. `test.skipIf` is applied
  // per case instead -- one call site, so the non-running sweep counts it once
  // regardless of how many cases the loop produces -- approved in this
  // ledger's `target.approved_non_running`.
  for (let index = 0; index < PARITY_CORPUS.length; index += 1) {
    const name = PARITY_CORPUS[index] as string;
    const id = PARITY_CORPUS_IDS[index] as string;
    test.skipIf(!GIT_AVAILABLE)(`the validator refuses everything git refuses[${id}]`, () => {
      // The validator's whole job is to move a git-level refusal earlier, so
      // being *more* permissive than git is the one direction that is a
      // defect: the catalog would compose and the clone would fail. Being
      // stricter is allowed and is checked case by case above, not here.
      if (gitAcceptsBranchName(name)) {
        return;
      }
      expect(() => parseBaseBranch(name)).toThrow(InvalidBaseBranchError);
    });
  }

  parametrize(
    "the shapes codex review found",
    CODEX_SHAPES.map((name) => [name, name] as const),
    (name) => {
      // Regression pins for the round-1 review finding: a trailing dot is
      // refused by git, and a bare '@' collides with git's shorthand for HEAD.
      expect(() => parseBaseBranch(name)).toThrow(InvalidBaseBranchError);
    },
  );
});
