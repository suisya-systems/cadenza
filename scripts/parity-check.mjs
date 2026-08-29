/**
 * The parity ledger's enforcement.
 *
 * A ledger nobody checks is a spreadsheet. This is the check, and it is wired
 * into `npm run verify` and into CI so that the ways a port silently loses
 * coverage all turn the gate red:
 *
 *  1. **missing**     -- a source case with no ledger entry, or a ledger entry
 *                        naming a target test that does not exist.
 *  2. **duplicate**   -- one source case claimed twice, or two source cases
 *                        pointing at one target test (which would look like
 *                        full coverage while half of it was never written).
 *  3. **unmapped**    -- a target test in a ported file that no ledger entry
 *                        claims, and that is not declared target-only. Without
 *                        this, a case could be deleted from the ledger and left
 *                        running, or added to the file and never accounted for.
 *  4. **unapproved non-running tests** -- any `skip`, `todo`, `fails` or
 *                        `xfail` construct anywhere under `test/` beyond what a
 *                        ledger approves, with a reason. Approvals declare an
 *                        exact count per construct per file, so one approved
 *                        example does not license every later skip in that file;
 *                        an approval matching nothing is flagged too, because a
 *                        stale licence to skip is a licence nobody reviewed, and
 *                        an approval with no reason is refused outright. The
 *                        same class covers `runner-alias`, which refuses a
 *                        reference to `test`/`it`/`describe` that is never
 *                        called: an alias is what makes an exact count
 *                        uncountable.
 *  5. **shrinkage**   -- fewer source cases in the inventory than the recorded
 *                        baseline.
 *  6. **totals**      -- the recorded totals must reconcile exactly with the
 *                        entries, per disposition. "Not fewer than" is satisfied
 *                        by lowering the baseline in the same edit that removes
 *                        the coverage; exact reconciliation is not.
 *
 * Those six are continuo's, kept name for name (DECISIONS.md D-0009). Cadenza
 * adds a seventh, because its ledger coverage starts at one file and continuo's
 * started at a subsystem:
 *
 *  7. **unaccounted-file** -- a test file no ledger names and
 *                        `parity/target-only.json` does not declare. In
 *                        continuo the unmapped sweep (3) is scoped to each
 *                        ledger's own target file, so a whole file that no
 *                        ledger mentions is swept by nothing at all. With one
 *                        ledger and three unledgered files that hole is most of
 *                        the suite, so the accounting is made total: every
 *                        collected test belongs to a file that is either a
 *                        ledger's target or a declared target-only file with a
 *                        stated reason.
 *
 * **What is deliberately absent.** continuo carries a `conditionally_collected`
 * declaration for a case whose title exists in the file but which the host did
 * not collect: pytest *collects* a skipped test and `vitest list` omits one, so
 * a capability-probed case has a source node id and no target id. Cadenza's
 * source suite has no `skipif` and no `xfail` anywhere (330 collected, 330
 * passed, 0 skipped), so there is nothing for that machinery to excuse. Leaving
 * it out fails **closed**: a conditionally skipped case introduced later is
 * reported as `missing` -- a false red that the belt introducing it has to
 * answer by bringing the declaration over, which is the right moment to do it.
 *
 * Run: `node scripts/parity-check.mjs`
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One ledger per **source test file**, because that is the unit this check
 * reasons about: `source.file.inventory` is a single file's collected node ids
 * and `target.test_file` is a single target file's prefix. A belt appends its
 * ledgers as a labelled block, so a merge conflict between concurrent belts is
 * a block boundary rather than an edit to a shared line.
 */
const LEDGERS = [
  // pilot -- the config_digest belt
  "parity/digest.ledger.json",
  // the composition belt
  "parity/compose.ledger.json",
  "parity/resolve.ledger.json",
  "parity/toml-loader.ledger.json",
  // the clone-source belt
  "parity/clone-source.ledger.json",
];

/** Files that carry tests translating no source case. */
const TARGET_ONLY_FILES = "parity/target-only.json";

/**
 * Constructs that stop a test from running, or expect it to fail.
 *
 * Reported under the names `test.skip`, `test.todo`, `test.fails`, `skipIf` and
 * `xfail`, so an approval can be counted per construct rather than per file.
 * Approving a file wholesale would mean that one approved example makes every
 * later `test.skip` in that file invisible to this check -- which is the hole
 * the check exists to close.
 */
/** Modifiers, reported as `test.<modifier>` whichever root they hang off. */
const RUNNER_MODIFIERS = ["skip", "todo", "fails"];
/**
 * The names **vitest exports** that a modifier may hang off.
 *
 * Not the names a file spells: `import { test as check } from "vitest"` binds
 * the same function to `check`, and `check.skip(...)` disables a test just as
 * surely. `runnerRootsOf` maps these to whatever each file calls them, so the
 * sweep follows the import rather than assuming the conventional spelling.
 */
const RUNNER_EXPORTS = ["test", "it", "describe"];
/** The module those names have to come from for a local binding to count. */
const RUNNER_MODULE = "vitest";
/** Bare helpers that mean the same thing, wherever they are referenced. */
const NON_RUNNING_HELPERS = ["skipIf", "xfail"];

/** The `runner-alias` message for a reference that is never called. */
function aliasDetail(chain) {
  return `references '${chain}' without calling it; an alias makes the non-running count uncountable, so it is refused rather than approved`;
}

const problems = [];

function fail(kind, detail) {
  problems.push(`${kind}: ${detail}`);
}

/** Every test id the runner would collect, as `<relative file>::<full name>`. */
function collectTargetTests() {
  const raw = execFileSync(
    process.execPath,
    [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "list", "--json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // `vitest list` loads vitest.config.ts, which fails closed under CI
      // without a seed (D-0006). Listing is not a test run and has no seed of
      // its own, so CI is cleared for this child only.
      env: { ...process.env, CI: "", CADENZA_TEST_SEED: "" },
    },
  );
  const start = raw.indexOf("[");
  if (start < 0) {
    throw new Error(`could not parse 'vitest list --json' output:\n${raw}`);
  }
  return JSON.parse(raw.slice(start)).map(
    (entry) => `${relative(ROOT, entry.file).split("\\").join("/")}::${entry.name}`,
  );
}

/** Every file under `test/`, so the non-running sweep cannot miss a directory. */
function testFiles(directory = join(ROOT, "test")) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...testFiles(path));
    } else if (entry.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Every non-running construct in one file, found in its **syntax tree**.
 *
 * continuo does this by matching source text with comments and single-line
 * strings blanked out, and that approach has two holes this port does not
 * inherit -- both raised at review, both reproducible:
 *
 *  1. **Chained modifiers.** Vitest accepts `test.concurrent.skip(...)` and
 *     `test.skip.concurrent(...)` alike, and a pattern requiring `skip` to
 *     follow `test` immediately matches neither. A skipped test would sit in a
 *     ledger as an ordinary running target with the gate green.
 *  2. **Comment markers inside strings.** Blanking comments *before* blanking
 *     strings means `const marker = "/*";` opens a block comment that runs to
 *     the next `*` + `/` or to end of file, erasing every `test.skip` in
 *     between. Doing it the other way round moves the hole rather than closing
 *     it, and getting both right in one text pass is a lexer.
 *
 * So the lexer is the one already installed: `typescript` is a devDependency
 * because `tsc` type-checks this repository, and `ts.createSourceFile` answers
 * the question exactly. Comments and string literals are not nodes in the tree
 * at all, so prose mentioning `test.skip` -- of which these files have a great
 * deal -- cannot be counted, and a modifier chain is a property-access chain
 * whatever order it was written in.
 *
 * Detection is on the **property-access chain**, and only the outermost link of
 * one is counted, or `test.skip.concurrent` would be counted twice: once for
 * `test.skip` and once for the whole.
 *
 * **Aliasing is refused rather than counted**, which is the third hole and the
 * one an exact count cannot survive. `const quarantine = test.skip;` followed by
 * three `quarantine(...)` calls is one property access and three disabled tests,
 * so a single approval would license any number of them; `const { skip } = test;`
 * is worse, because the chain never appears at all. Counting the registrations
 * instead would mean resolving arbitrary aliases, which is a type checker's job.
 * So a reference to a runner that is neither called nor the start of a
 * property-access chain is reported as `runner-alias` and the gate goes red. An
 * approval is a licence for a *counted* construct, and this is what keeps the
 * count countable.
 *
 * The **import** is the fourth route and the one that decides what "a runner"
 * even means here: `import { test as check } from "vitest"` binds the same
 * function to another name, and `check.skip(...)` disables a test while a sweep
 * looking for the literal `test` sees nothing. So the roots are read off each
 * file's own imports (`runnerRootsOf`) rather than assumed, and a namespace
 * import -- which would put every runner behind a property access -- is refused.
 */
function nonRunningIn(path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const hits = [];
  const aliases = [];

  const lineOf = (node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  /**
   * What this file calls vitest's runners, read off its own imports.
   *
   * `import { test } from "vitest"` binds `test`; `import { test as check }`
   * binds `check`, and `check.skip(...)` is every bit as disabled. Assuming the
   * conventional spelling was the last aliasing route left open, and it is the
   * one a text sweep could never have closed either.
   *
   * A namespace import is **refused** rather than followed. `import * as v from
   * "vitest"` makes every runner reachable as a property of `v`, so the roots
   * are no longer a set of identifiers at all -- and a file that needs one has
   * not been written yet. Refusing keeps the sweep's subject a finite list.
   */
  function runnerRootsOf() {
    const roots = new Set();
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier) || specifier.text !== RUNNER_MODULE) {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        aliases.push({
          detail: `imports ${RUNNER_MODULE} as a namespace ('${bindings.name.text}'), which puts every runner behind a property access the non-running sweep cannot enumerate; import the runners by name`,
          line: lineOf(bindings),
        });
        continue;
      }
      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        continue;
      }
      for (const element of bindings.elements) {
        // `propertyName` is set only for `x as y`; otherwise the local name is
        // the exported name.
        const exported = (element.propertyName ?? element.name).text;
        if (RUNNER_EXPORTS.includes(exported)) {
          roots.add(element.name.text);
        }
      }
    }
    return roots;
  }

  const RUNNER_ROOTS = runnerRootsOf();

  /** `test.concurrent.skip` -> ["test", "concurrent", "skip"]; null if not a plain chain. */
  function chainOf(node) {
    const parts = [];
    let current = node;
    while (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
    }
    if (!ts.isIdentifier(current)) {
      return null;
    }
    parts.unshift(current.text);
    return parts;
  }

  /** Whether `node` is the callee of the call it sits in. */
  const isCallee = (node) =>
    node.parent !== undefined &&
    ts.isCallExpression(node.parent) &&
    node.parent.expression === node;

  /** Whether `node` is the object half of a longer property-access chain. */
  const continuesChain = (node) =>
    node.parent !== undefined &&
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.expression === node;

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      // Only the outermost link: an inner one is part of the same chain.
      if (!continuesChain(node)) {
        const chain = chainOf(node);
        if (chain !== null && RUNNER_ROOTS.has(chain[0])) {
          const modifiers = RUNNER_MODIFIERS.filter((modifier) =>
            chain.slice(1).includes(modifier),
          );
          if (modifiers.length > 0 && !isCallee(node)) {
            aliases.push({ detail: aliasDetail(chain.join(".")), line: lineOf(node) });
          } else {
            for (const modifier of modifiers) {
              hits.push({ construct: `test.${modifier}`, line: lineOf(node) });
            }
          }
        }
      }
    }
    if (ts.isIdentifier(node) && RUNNER_ROOTS.has(node.text)) {
      // A bare `test` that is neither called nor the start of a chain is an
      // alias in the making: `const t = test;` and `const { skip } = test;` both
      // land here, and neither leaves a chain for the sweep above to find. An
      // import specifier and a declaration name are how the runner gets into
      // scope in the first place, and are not references to it.
      const parent = node.parent;
      // Nor is the NAME half of somebody else's property access. `/\s/.test(x)`
      // and `pattern.test(x)` put an identifier called `test` in the tree that
      // has nothing to do with vitest, and reporting it as an alias is a false
      // `runner-alias` on ordinary regular-expression code. The chain sweep
      // above already covers a real `test.skip`, where `test` is the
      // `expression` half rather than the `name` half.
      if (parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.name === node) {
        ts.forEachChild(node, visit);
        return;
      }
      const isBinding =
        parent !== undefined &&
        (ts.isImportSpecifier(parent) ||
          ts.isImportClause(parent) ||
          ts.isBindingElement(parent) ||
          ts.isParameter(parent) ||
          ts.isVariableDeclaration(parent) ||
          ts.isFunctionDeclaration(parent)) &&
        (parent.name === node ||
          // `import { test as check }`: `test` here names the export being
          // bound, not a reference to the runner.
          (ts.isImportSpecifier(parent) && parent.propertyName === node));
      if (!isBinding && !isCallee(node) && !continuesChain(node)) {
        aliases.push({ detail: aliasDetail(node.text), line: lineOf(node) });
      }
    }
    if (ts.isIdentifier(node) && NON_RUNNING_HELPERS.includes(node.text)) {
      // The helper's own definition and its import are not uses of it. Both are
      // declaration names rather than expressions, which the tree distinguishes
      // and a text sweep cannot.
      const parent = node.parent;
      const isDeclaration =
        parent !== undefined &&
        (ts.isFunctionDeclaration(parent) ||
          ts.isImportSpecifier(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isVariableDeclaration(parent) ||
          ts.isPropertyAssignment(parent)) &&
        parent.name === node;
      if (!isDeclaration) {
        hits.push({ construct: node.text, line: lineOf(node) });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(tree);
  return { hits, aliases };
}

const collected = collectTargetTests();
const claimedTargets = new Map();
/**
 * What the `unmapped` sweep needs, one row per ledger.
 *
 * The sweep runs **after** every ledger has been read, not inside the loop that
 * reads them, and the difference is not cosmetic. A ledger entry may claim a
 * target test in another belt's file -- `tests/test_digest.py`'s
 * "the digest survives the catalog moving to another file" is re-pointed at
 * `test/application/resolve.test.ts`, because its subject is composition and the
 * machinery it needs did not exist when its own file was ported. Swept inside
 * the loop, whether that claim is seen depends on which ledger `LEDGERS` happens
 * to list first: the claiming ledger before the owning one is green, the other
 * order is a spurious `unmapped`. Order of a list is not something a gate should
 * be sensitive to.
 */
const unmappedSweep = [];
const approvedNonRunning = new Map();
const ledgerTargetFiles = new Set();

for (const ledgerPath of LEDGERS) {
  const ledger = JSON.parse(readFileSync(join(ROOT, ledgerPath), "utf8"));
  ledgerTargetFiles.add(ledger.target.test_file);

  // (1) and (5): the source inventory is a committed snapshot taken at the
  // recorded revision, so this runs without re-collecting the Python suite.
  const inventory = readFileSync(join(ROOT, ledger.source.file.inventory), "utf8")
    .trim()
    .split("\n")
    .filter((line) => line !== "");
  if (inventory.length !== ledger.source.file.collected) {
    fail(
      "shrinkage",
      `${ledgerPath}: inventory holds ${inventory.length} source cases but the ledger records ${ledger.source.file.collected}`,
    );
  }

  const seenSources = new Set();
  for (const entry of ledger.entries) {
    if (seenSources.has(entry.source_nodeid)) {
      fail("duplicate", `${ledgerPath}: source case claimed twice: ${entry.source_nodeid}`);
    }
    seenSources.add(entry.source_nodeid);

    if (entry.target_id !== null) {
      const previous = claimedTargets.get(entry.target_id);
      if (previous !== undefined) {
        fail(
          "duplicate",
          `${ledgerPath}: target test claimed by two source cases: ${entry.target_id} (${previous.source} and ${entry.source_nodeid})`,
        );
      }
      claimedTargets.set(entry.target_id, { source: entry.source_nodeid, ledgerPath });
    }

    if (entry.disposition !== "ported" && (entry.reason ?? "") === "") {
      fail(
        "unexplained",
        `${ledgerPath}: ${entry.source_nodeid} is '${entry.disposition}' with no reason`,
      );
    }
  }

  for (const nodeid of inventory) {
    if (!seenSources.has(nodeid)) {
      fail("missing", `${ledgerPath}: source case has no ledger entry: ${nodeid}`);
    }
  }
  for (const nodeid of seenSources) {
    if (!inventory.includes(nodeid)) {
      fail(
        "unknown-source",
        `${ledgerPath}: ledger entry names a case absent from the inventory: ${nodeid}`,
      );
    }
  }

  // (6): the recorded totals must reconcile EXACTLY with the entries. A
  // one-sided check (`mapped < recorded`) is satisfied by lowering the baseline
  // in the same edit that removes the coverage -- both numbers shrink together
  // and the gate stays green. Reconciling instead means the totals cannot be
  // quietly re-based; a genuine change to them is a diff a reviewer sees.
  const counted = {
    source_cases: ledger.entries.length,
    ported: ledger.entries.filter((entry) => entry.disposition === "ported").length,
    adapted: ledger.entries.filter((entry) => entry.disposition === "adapted").length,
    not_ported: ledger.entries.filter((entry) => entry.disposition === "not-ported").length,
    waivers: ledger.entries.filter((entry) => entry.disposition === "waived").length,
  };
  for (const [key, value] of Object.entries(counted)) {
    if (ledger.totals[key] !== value) {
      fail(
        "totals",
        `${ledgerPath}: totals.${key} records ${ledger.totals[key]} but the entries count ${value}`,
      );
    }
  }
  const dispositions = new Set(["ported", "adapted", "not-ported", "waived"]);
  for (const entry of ledger.entries) {
    if (!dispositions.has(entry.disposition)) {
      fail(
        "totals",
        `${ledgerPath}: ${entry.source_nodeid} has an unknown disposition '${entry.disposition}'; it would be counted in no total`,
      );
    }
  }

  const mapped = ledger.entries.filter((entry) => entry.target_id !== null).length;
  if (mapped !== counted.ported + counted.adapted) {
    fail(
      "totals",
      `${ledgerPath}: ${mapped} entries carry a target id but ${counted.ported + counted.adapted} are ported or adapted; a ported case with no target, or a not-ported case with one, is a bookkeeping error`,
    );
  }

  // (3) is deferred to a second pass: see `unmappedSweep` below.
  const targetOnly = new Set(ledger.target.target_only_tests.ids);
  unmappedSweep.push({ ledgerPath, testFile: ledger.target.test_file, targetOnly });
  for (const id of targetOnly) {
    if (!collected.includes(id)) {
      fail("missing", `${ledgerPath}: declared target-only test does not exist: ${id}`);
    }
  }
  if (targetOnly.size !== ledger.target.target_only_tests.count) {
    fail(
      "totals",
      `${ledgerPath}: target_only_tests.count records ${ledger.target.target_only_tests.count} but ${targetOnly.size} ids are listed`,
    );
  }

  for (const approval of ledger.target.approved_non_running ?? []) {
    // An approval is a licence, and a licence with no reason is one nobody
    // reviewed. Checked here rather than trusted, because the counts alone
    // would otherwise be enough to authorise a skip.
    if (!approval.reason) {
      fail("unexplained", `${ledgerPath}: approved_non_running for ${approval.file} has no reason`);
    }
    approvedNonRunning.set(approval.file, approval);
  }
}

// (1, continued): every claimed target has to exist. Swept once, after every
// ledger has been read, because `claimedTargets` is global.
for (const [id, claim] of claimedTargets) {
  if (!collected.includes(id)) {
    fail(
      "missing",
      `${claim.ledgerPath}: ${claim.source} maps to a target test that does not exist: ${id}`,
    );
  }
}

// (3): everything the runner collects from a ported file is either claimed by an
// entry -- in ANY ledger -- or declared target-only by that file's own ledger.
for (const { ledgerPath, testFile, targetOnly } of unmappedSweep) {
  for (const id of collected) {
    if (!id.startsWith(`${testFile}::`)) {
      continue;
    }
    if (!claimedTargets.has(id) && !targetOnly.has(id)) {
      fail("unmapped", `${ledgerPath}: target test claimed by no ledger entry: ${id}`);
    }
  }
}

// (7): every collected test belongs to an accounted-for file.
const targetOnlyFiles = JSON.parse(readFileSync(join(ROOT, TARGET_ONLY_FILES), "utf8"));
const declaredTargetOnly = new Map();
for (const row of targetOnlyFiles.files) {
  if (!row.why) {
    fail("unexplained", `${TARGET_ONLY_FILES}: ${row.path} is declared target-only with no reason`);
  }
  if (ledgerTargetFiles.has(row.path)) {
    fail(
      "unaccounted-file",
      `${TARGET_ONLY_FILES}: ${row.path} is a ledger's target file and cannot also be target-only; its unmapped tests belong in that ledger's target_only_tests`,
    );
  }
  declaredTargetOnly.set(row.path, row);
}
const collectedFiles = new Set(collected.map((id) => id.slice(0, id.indexOf("::"))));
for (const file of collectedFiles) {
  if (!ledgerTargetFiles.has(file) && !declaredTargetOnly.has(file)) {
    fail(
      "unaccounted-file",
      `${file} is named by no ledger and is not declared in ${TARGET_ONLY_FILES}; a whole file of tests that nothing accounts for is how a port loses a subsystem quietly`,
    );
  }
}
// A declaration for a file that no longer exists is a stale exemption.
for (const file of declaredTargetOnly.keys()) {
  if (!collectedFiles.has(file)) {
    fail(
      "unaccounted-file",
      `${TARGET_ONLY_FILES}: ${file} is declared target-only but the runner collects nothing from it`,
    );
  }
}

// (4): every skip, todo, fails or xfail under test/ has to be approved, and the
// approval has to account for it *individually*. Approvals declare an exact
// count per construct, so adding one more skip to an already-approved file is a
// count mismatch rather than a free ride.
const observed = new Map();
for (const path of testFiles()) {
  const relativePath = relative(ROOT, path).split("\\").join("/");
  // Every occurrence, not merely whether the file has one: two `test.skip(...)`
  // calls on one line are two, and an approval for one must not license the
  // other.
  const { hits, aliases } = nonRunningIn(relativePath, readFileSync(path, "utf8"));
  for (const hit of hits) {
    const key = `${relativePath}\u0000${hit.construct}`;
    const seen = observed.get(key) ?? { count: 0, lines: [] };
    seen.count += 1;
    seen.lines.push(hit.line);
    observed.set(key, seen);
  }
  for (const alias of aliases) {
    fail("runner-alias", `${relativePath}:${alias.line} ${alias.detail}`);
  }
}

for (const [key, seen] of observed) {
  const [relativePath, construct] = key.split("\u0000");
  const approval = approvedNonRunning.get(relativePath);
  const allowed = approval?.constructs?.[construct];
  if (allowed === undefined) {
    fail(
      "unapproved-skip",
      `${relativePath} uses '${construct}' at line(s) ${seen.lines.join(", ")} and no ledger approves that construct in that file`,
    );
    continue;
  }
  if (allowed !== seen.count) {
    fail(
      "unapproved-skip",
      `${relativePath} uses '${construct}' ${seen.count} time(s) (line(s) ${seen.lines.join(", ")}) but the ledger approves exactly ${allowed}; a new one needs its own approval and reason`,
    );
  }
}

// An approval that no longer matches anything is a stale licence to skip.
for (const [relativePath, approval] of approvedNonRunning) {
  for (const [construct, allowed] of Object.entries(approval.constructs ?? {})) {
    if (!observed.has(`${relativePath}\u0000${construct}`) && allowed > 0) {
      fail(
        "stale-approval",
        `${relativePath} has an approval for ${allowed} '${construct}' use(s) but none are present; remove the approval`,
      );
    }
  }
}

if (problems.length > 0) {
  process.stderr.write("parity ledger check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  - ${problem}\n`);
  }
  process.stderr.write(`\n${problems.length} problem(s).\n`);
  process.exit(1);
}

process.stdout.write(`parity ledger check passed (${collected.length} target tests collected).\n`);
