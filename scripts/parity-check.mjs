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
 *                        stale licence to skip is a licence nobody reviewed.
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
];

/** Files that carry tests translating no source case. */
const TARGET_ONLY_FILES = "parity/target-only.json";

/**
 * Constructs that stop a test from running, or expect it to fail.
 *
 * Keyed by name so an approval can be counted per construct rather than per
 * file. Approving a file wholesale would mean that one approved example makes
 * every later `test.skip` in that file invisible to this check -- which is the
 * hole the check exists to close.
 */
const NON_RUNNING = {
  "test.skip": /\b(?:test|it|describe)\.skip\b/,
  "test.todo": /\b(?:test|it|describe)\.todo\b/,
  "test.fails": /\b(?:test|it)\.fails\b/,
  skipIf: /\bskipIf\(/,
  xfail: /\bxfail\(/,
};

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
 * Blank out comments and single-line strings, keeping line numbering intact.
 *
 * The sweep below matches source text, and these files *document* the mapping
 * rules they implement -- a doc comment reading "maps to `test.fails`" is prose,
 * not a non-running test, and so is a test title that mentions one. Counting
 * either would force an approval for something that does not exist, which
 * teaches the reader that the counts are noise.
 *
 * Deliberately crude: it does not understand strings containing comment
 * markers, and it leaves multi-line template literals alone. Erring toward
 * blanking means a construct hidden inside such a string would be missed -- but
 * a `test.skip` written inside a string literal is not a skip either, so the
 * error direction is harmless here.
 */
function withoutComments(source) {
  return blankStrings(stripComments(source));
}

function blankStrings(source) {
  return source.replace(
    /(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g,
    (match) => match[0] + " ".repeat(Math.max(0, match.length - 2)) + match[0],
  );
}

function stripComments(source) {
  const out = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    let kept = line;
    if (inBlock) {
      const end = kept.indexOf("*/");
      if (end < 0) {
        out.push("");
        continue;
      }
      kept = " ".repeat(end + 2) + kept.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const start = kept.indexOf("/*");
      if (start < 0) break;
      const end = kept.indexOf("*/", start + 2);
      if (end < 0) {
        kept = kept.slice(0, start);
        inBlock = true;
        break;
      }
      kept = kept.slice(0, start) + " ".repeat(end + 2 - start) + kept.slice(end + 2);
    }
    const lineComment = kept.indexOf("//");
    if (lineComment >= 0) {
      kept = kept.slice(0, lineComment);
    }
    out.push(kept);
  }
  return out.join("\n");
}

const collected = collectTargetTests();
const claimedTargets = new Map();
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

  // (3): everything the runner collects from a ported file is either claimed by
  // an entry or declared target-only.
  const targetOnly = new Set(ledger.target.target_only_tests.ids);
  for (const id of collected) {
    if (!id.startsWith(`${ledger.target.test_file}::`)) {
      continue;
    }
    if (!claimedTargets.has(id) && !targetOnly.has(id)) {
      fail("unmapped", `${ledgerPath}: target test claimed by no ledger entry: ${id}`);
    }
  }
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
  const lines = withoutComments(readFileSync(path, "utf8")).split("\n");
  for (const [index, line] of lines.entries()) {
    for (const [construct, pattern] of Object.entries(NON_RUNNING)) {
      // Every occurrence, not merely whether the line matched: two
      // `test.skip(...)` calls on one physical line would otherwise count as
      // one, and an approval for one would license the other.
      const hits = line.match(new RegExp(pattern.source, "g"));
      if (hits === null) {
        continue;
      }
      const key = `${relativePath}\u0000${construct}`;
      const seen = observed.get(key) ?? { count: 0, lines: [] };
      seen.count += hits.length;
      seen.lines.push(index + 1);
      observed.set(key, seen);
    }
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
