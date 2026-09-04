/**
 * The source inventory's own enforcement.
 *
 * `scripts/parity-check.mjs` checks the inventory files a **ledger** points at.
 * That is the right scope for it, and it leaves a gap: seven of cadenza's eight
 * inventories are referenced by no ledger, so nothing reads them. Duplicated
 * node ids, an `all.txt` that has drifted from the per-file inventories it
 * aggregates, a file quietly deleted, a count that no longer adds up to the
 * suite baseline -- all of that would sit in the tree green until the belt that
 * ports the file finally opened it, which is months later and by then the diff
 * that broke it is unfindable.
 *
 * So this checks the inventory as a whole against
 * `parity/source-inventory.manifest.json`, which is its index and the record of
 * how it reconciles with the Python suite.
 *
 * What it reports:
 *
 *  1. **stray**        -- an inventory file the manifest does not name, or a
 *                         manifest path with no file. Both directions matter:
 *                         an unnamed file is uncounted evidence, and a named
 *                         missing one is a count with nothing behind it.
 *  2. **shape**        -- a line that is not a node id belonging to the file's
 *                         own source path. This is what keeps the inventories
 *                         comment-free, which they must be, because
 *                         `parity-check.mjs` reads every non-empty line as a
 *                         node id -- a `# note` line there is a source case that
 *                         does not exist.
 *  3. **count**        -- a recorded `collected` that disagrees with the lines,
 *                         or totals that do not add up.
 *  4. **aggregate**    -- an `all.txt` that is not exactly the concatenation of
 *                         its files' inventories, in the manifest's order.
 *  5. **duplicate**    -- one node id in two inventories, which is how a total
 *                         reaches 330 while holding fewer distinct cases.
 *  6. **baseline**     -- the per-file counts must sum to the recorded suite
 *                         total, and the breakdown must add up to it.
 *  7. **functions**    -- RETIRED by DECISIONS.md D-0032, and named here rather
 *                         than deleted so a reader of a green run knows what it
 *                         stopped covering. It re-derived each manifest entry's
 *                         `test_functions` from its Python file's `def test_`
 *                         count, which cadenza could do and continuo could not,
 *                         because the Python source was in this repository. That
 *                         source is gone, so the count can no longer be
 *                         re-derived from anything: `test_functions` is now a
 *                         recorded historical figure, checked only for internal
 *                         consistency by (6). Nothing replaces it and nothing
 *                         needs to -- the number it guarded against drift can no
 *                         longer drift, because the file it was derived from can
 *                         no longer change.
 *  8. **unclassified** -- an inventory with no status, or one the manifest's own
 *                         status vocabulary does not define. Being in the
 *                         inventory is evidence, not a commitment to port, and
 *                         the place that says which is which has to cover every
 *                         file or the distinction is only rhetorical.
 *
 * **What it cannot check, stated so nobody reads more into a green run.** Node
 * ids are recorded in pytest's collection order, and nothing here knows what
 * that order is. So `aggregate` checks that `all.txt` is the per-file
 * inventories concatenated; it cannot check that those files are in the order
 * the collection actually emitted. Order is a claim the regeneration procedure
 * makes, and re-running that procedure is the only thing that tests it.
 *
 * Wired into `npm run verify` beside `npm run parity`, for the reason the
 * parity check states about itself: a ledger nobody checks is a spreadsheet,
 * and so is an inventory.
 *
 * Run: `node scripts/source-inventory-check.mjs`
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "parity/source-inventory.manifest.json";
const INVENTORY_DIR = "parity/source-inventory";

const problems = [];

function fail(kind, detail) {
  problems.push(`${kind}: ${detail}`);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** Non-empty lines, which is exactly what `parity-check.mjs` reads. */
function linesOf(relativePath) {
  return read(relativePath)
    .split("\n")
    .filter((line) => line !== "");
}

const manifest = JSON.parse(read(MANIFEST));
const statuses = new Set(Object.keys(manifest.statuses));

// (1): the manifest and the directory name the same set of files.
const named = new Set(manifest.files.map((entry) => entry.path));
named.add(manifest.aggregate.path);
const present = new Set(
  readdirSync(join(ROOT, INVENTORY_DIR))
    .filter((entry) => entry.endsWith(".txt"))
    .map((entry) => `${INVENTORY_DIR}/${entry}`),
);
for (const path of named) {
  if (!present.has(path)) {
    fail("stray", `${MANIFEST} names ${path} but no such file exists`);
  }
}
for (const path of present) {
  if (!named.has(path)) {
    fail("stray", `${path} exists but ${MANIFEST} does not name it; uncounted evidence`);
  }
}

// (5): a node id may appear in exactly one inventory.
const owner = new Map();

for (const entry of manifest.files) {
  if (!present.has(entry.path)) {
    continue;
  }
  const lines = linesOf(entry.path);

  // (2): every line is a node id belonging to this entry's own source file.
  const prefix = `${entry.source}::`;
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith(prefix)) {
      fail(
        "shape",
        `${entry.path} line ${index + 1} is not a node id of ${entry.source}: ${JSON.stringify(line)}`,
      );
    }
    if (line.trim() !== line) {
      fail("shape", `${entry.path} line ${index + 1} carries leading or trailing whitespace`);
    }
  }

  // (3): the recorded count is the line count.
  if (lines.length !== entry.collected) {
    fail(
      "count",
      `${entry.path} holds ${lines.length} node ids but the manifest records ${entry.collected}`,
    );
  }

  // (5), continued.
  for (const line of lines) {
    const previous = owner.get(line);
    if (previous !== undefined) {
      fail("duplicate", `${line} appears in both ${previous} and ${entry.path}`);
    }
    owner.set(line, entry.path);
  }

  // (7) was here: the function count re-derived from `entry.source` by counting
  // `^def test_`. D-0032 deleted `tests/`, so `entry.source` names a file that
  // is deliberately absent and reading it would fail every run. It is NOT
  // reintroduced as a "the file should be missing" assertion, which would be a
  // check on the deletion rather than on the inventory.
  //
  // What survives is the arithmetic, which never needed the file: a
  // parametrized function yields more node ids than functions, never fewer, so
  // a recorded pair that inverts is wrong on its face whatever the source said.
  if (entry.collected < entry.test_functions) {
    fail(
      "count",
      `${entry.path} holds ${entry.collected} node ids for ${entry.test_functions} test functions; a parametrized function yields more ids, never fewer`,
    );
  }

  // (8): every file is classified, in the manifest's own vocabulary.
  if (!statuses.has(entry.status)) {
    fail(
      "unclassified",
      `${entry.path} has status ${JSON.stringify(entry.status)}, which ${MANIFEST} does not define; defined statuses are ${[...statuses].join(", ")}`,
    );
  }
  if (!entry.note) {
    fail("unclassified", `${entry.path} has no note saying why it carries that status`);
  }
}

// (4): the aggregate is the concatenation, in the manifest's order.
const expected = manifest.files.flatMap((entry) =>
  present.has(entry.path) ? linesOf(entry.path) : [],
);
const aggregate = present.has(manifest.aggregate.path) ? linesOf(manifest.aggregate.path) : [];
if (aggregate.length !== expected.length) {
  fail(
    "aggregate",
    `${manifest.aggregate.path} holds ${aggregate.length} node ids but its files hold ${expected.length}`,
  );
} else {
  for (const [index, line] of expected.entries()) {
    if (aggregate[index] !== line) {
      fail(
        "aggregate",
        `${manifest.aggregate.path} line ${index + 1} is ${JSON.stringify(aggregate[index])} but the per-file inventories give ${JSON.stringify(line)}`,
      );
      break;
    }
  }
}
if (aggregate.length !== manifest.aggregate.collected) {
  fail(
    "count",
    `${manifest.aggregate.path} holds ${aggregate.length} node ids but the manifest records ${manifest.aggregate.collected}`,
  );
}

// (6): the totals reconcile with the files and with the recorded baseline.
const summedIds = manifest.files.reduce((total, entry) => total + entry.collected, 0);
const summedFunctions = manifest.files.reduce((total, entry) => total + entry.test_functions, 0);
if (summedIds !== manifest.totals.node_ids) {
  fail(
    "baseline",
    `totals.node_ids records ${manifest.totals.node_ids} but the files sum to ${summedIds}`,
  );
}
if (summedFunctions !== manifest.totals.test_functions) {
  fail(
    "baseline",
    `totals.test_functions records ${manifest.totals.test_functions} but the files sum to ${summedFunctions}`,
  );
}
const skippedModules = manifest.source.collection_time_skipped_modules ?? [];
if (summedIds + skippedModules.length !== manifest.source.collected) {
  fail(
    "baseline",
    `the files hold ${summedIds} node ids and ${skippedModules.length} module(s) are recorded as skipped at collection time, but source.collected is ${manifest.source.collected}`,
  );
}
if (manifest.source.passed + manifest.source.skipped !== manifest.source.collected) {
  fail(
    "baseline",
    `source.passed (${manifest.source.passed}) + source.skipped (${manifest.source.skipped}) does not equal source.collected (${manifest.source.collected})`,
  );
}
// A module recorded as skipped at collection time yields no node id, so one
// with an inventory means a case was invented for a test pytest never collected.
for (const module of skippedModules) {
  if (manifest.files.some((entry) => entry.source === module)) {
    fail(
      "fabricated",
      `${module} is recorded as skipped at collection time but has an inventory file; such a module yields no node id`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write("source inventory check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  - ${problem}\n`);
  }
  process.stderr.write(`\n${problems.length} problem(s).\n`);
  process.exit(1);
}

process.stdout.write(
  `source inventory check passed (${manifest.totals.node_ids} node ids from ` +
    `${manifest.totals.test_functions} test functions across ${manifest.files.length} files).\n`,
);
