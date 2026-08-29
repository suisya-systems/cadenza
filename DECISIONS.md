# Cadenza — DECISIONS

This file is the canonical, append-only record of cadenza's design decisions.

**The numbering space is cadenza's own.** It starts at `D-0001` and has nothing to do with
[`suisya-systems/continuo`](https://github.com/suisya-systems/continuo)'s `D-0001`, which is a
different decision about a different repository. Cadenza reuses a good deal of continuo's porting
machinery (D-0001), and every reference to a continuo decision below is written `continuo D-00NN`
so the two spaces can never be read as one. The same applies to
[`suisya-systems/interlock`](https://github.com/suisya-systems/interlock), cited as
`interlock D-00NN`.

## How to use this file

- **IDs are permanent.** `D-0001` ... are stable identifiers. Once assigned, an ID is never
  reused, renumbered, merged into another entry, or deleted.
- **Supersession keeps the ID.** A decision that stops being true keeps its ID and gains
  `Status: superseded by D-XXXX`; the replacement gets a new ID at the end of the list.
- **Cross-reference by ID only.** Never cite this file by line number, heading order, or table
  position.
- **Every entry states what would falsify it.** A decision taken on facts that can change records
  the fact and the version it was measured at, so a later reader can tell "still true" from "was
  true in 2026".
- **Belts hold disjoint number ranges**, so concurrent lanes conflict only in the index table above
  and never over an ID. `D-0001`..`D-0099` is the bootstrap band and the shared band for
  cross-belt decisions taken at the window. Later belts allocate their own `D-01xx`, `D-02xx`, ...
  by an entry in this band, as continuo does. The ranges are an allocation, not a meaning: nothing
  about an entry follows from which range it is in.

## Index

| ID | Title | Status |
|---|---|---|
| D-0001 | The design document is the primary oracle; the test suite is the second | accepted |
| D-0002 | Vitest is the test runner | accepted |
| D-0003 | ESM, NodeNext resolution, and explicit `.js` import suffixes | accepted |
| D-0004 | Install from the lockfile, with `--ignore-scripts` | accepted |
| D-0005 | TypeScript strictness beyond `strict` | accepted |
| D-0006 | The double-green rule, and where it is enforced | accepted |
| D-0007 | ASCII-only for anything cadenza prints | accepted |
| D-0008 | Biome, knip, and no build output yet | accepted |
| D-0009 | The parity ledger and the source inventory, and a seventh failure class | accepted |
| D-0010 | The ledger's unit is the pytest node id, not the test function | accepted |
| D-0011 | The differential oracle, and the one face this pilot implements | accepted |
| D-0012 | The TypeScript tree lives at the repository root, beside the Python package | accepted |
| D-0013 | The canonical encoder refuses a lone surrogate rather than escaping it | accepted |
| D-0014 | G2 and the interlock seam are untouched by the port | accepted |

---

## D-0001 — The design document is the primary oracle; the test suite is the second

**Status:** accepted (2026-08-30, ratified in cadenza#8)

**Decision.** When the TypeScript port and something in this repository disagree, the order in which
authorities are consulted is:

1. `docs/design/g1-project-registry.md`
2. `tests/` — the Python suite, as collected in `parity/source-inventory/`
3. `src/cadenza/` — the Python implementation

A disagreement between the port and the design document is a **defect in the port**. A disagreement
between the port and a Python test, where the design document is silent or agrees with the port, is
a finding to record in the ledger and raise — not something to transcribe.

**This is the reverse of continuo's order,** and the reversal is the reason this is `D-0001` rather
than a footnote. Continuo ports interlock, whose design record is spread across `DECISIONS.md`,
`investigation/` and `docs/parity-audit.md`, none of which claims to be a specification; there, the
suite is the specification and translating it faithfully is the whole discipline
(continuo `docs/test-translation-conventions.md`). Cadenza is the other case. Its design document
opens by saying so, in its own words:

> This document is the contract for G1. The code implements what is written here; where the two
> disagree, this document is the defect report.

That sentence was written before the port existed and is not a claim invented to justify this entry.
A port that treated the tests as primary would be treating a *derived* artefact as the contract, and
would faithfully carry across any place the tests had drifted from the document — which is exactly
the failure the document's sentence exists to prevent.

**What is reused from continuo, and what is not.** Continuo's *translation conventions* — how a
pytest construct becomes a vitest one, what a faithful translation may change and what it may not,
and the ten ways a translated case can go green by losing its subject — are reused wholesale, as
`docs/test-translation-conventions.md` in that repository. They are conventions about mechanics, and
mechanics do not care which artefact is the specification. Continuo's *oracle order* is not reused,
for the reason above. `docs/porting.md` section 2 records the boundary.

**What would falsify it.** The design document ceasing to be maintained, or being narrowed to a
subset of the code. If a future belt finds the document silent on a question the tests answer, that
is not a falsification — it is case 2 of the order above doing its job — but a document that is
silent on most questions is no longer a primary oracle, and this entry would need superseding.

---

## D-0002 — Vitest is the test runner

**Status:** accepted

**Decision.** Vitest 4.x, configured in `vitest.config.ts`, with `globals: false` so every helper is
imported explicitly.

**Why.** The suite being ported is a pytest suite, and the two properties that matter for translating
one are per-file isolation and configurable ordering; vitest has both, and its `list --json` output
is what `scripts/parity-check.mjs` reads to answer "does this target test exist?". Node's built-in
test runner would need the parity check to parse its own output format, and the parity machinery is
being vendored from continuo, which is on vitest (continuo D-0001). Matching it means the vendored
scripts are reviewed rather than rewritten.

**What would falsify it.** `vitest list --json` changing shape, which would break `parity-check.mjs`
rather than the suite; the version is pinned exactly (D-0004) so that change arrives as a diff.

---

## D-0003 — ESM, NodeNext resolution, and explicit `.js` import suffixes

**Status:** accepted

**Decision.** `"type": "module"`, `module`/`moduleResolution` both `NodeNext`, and every relative
import carries an explicit `.js` suffix even though the file on disk is `.ts`.

**Why.** It is the resolution Node itself performs, so what the type checker models and what the
runtime does are the same thing. The suffix is not a wart of the config; it is what the emitted
module graph contains, and writing it in the source keeps the two graphs identical.

Taken at the bootstrap deliberately: changing it after a suite has been ported means rewriting every
import in it.

---

## D-0004 — Install from the lockfile, with `--ignore-scripts`

**Status:** accepted

**Decision.** `package-lock.json` is committed, `.npmrc` sets `save-exact=true`, every dependency is
pinned to an exact version, and CI installs with `npm ci --ignore-scripts`.

**Why.** `npm ci` refuses to proceed when `package.json` and the lockfile disagree, so a dependency
cannot drift into a run without appearing in a diff. `--ignore-scripts` is a standing rule rather
than a reaction to a specific package: cadenza has no native dependency today and therefore nothing
that needs a build step, so allowing arbitrary install scripts would buy nothing and would hand
every transitive package code execution on every CI cell.

**What would falsify it.** A dependency that genuinely requires an install script. That is a
decision to take then, on that package, with its own entry.

---

## D-0005 — TypeScript strictness beyond `strict`

**Status:** accepted

**Decision.** `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, plus
`noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `allowUnreachableCode: false`.

**Why.** The first two are not implied by `strict` and are the two that matter for a port from
Python. `noUncheckedIndexedAccess` makes `array[i]` a `T | undefined`, which is the shape of every
lookup that a Python `IndexError` would have raised on; without it, an off-by-one in a translated
loop is a silent `undefined` flowing into a digest. `exactOptionalPropertyTypes` keeps "absent" and
"present and undefined" distinct, which is the distinction a Python `dict` makes with `in`.

The cost is real and is accepted: `parity/`-facing code and the oracle test carry a handful of
narrowing helpers that exist only to satisfy these two flags. That is cheaper than the failure they
prevent.

---

## D-0006 — The double-green rule, and where it is enforced

**Status:** accepted

**Decision.** CI runs the whole suite **twice per matrix cell, at two distinct explicit seeds**,
under randomised file and test ordering, with `retry: 0`. The shuffle is configured in
`vitest.config.ts`; CI injects only the seed, and an unset seed under `CI` is a hard error.

**Why each half is where it is.**

- *Shuffle in the config file, not on the command line.* A CLI flag can be dropped by an edit to a
  workflow file without a single test turning red, which would retire the rule silently. In the
  config it is part of what the runner is, and removing it is a diff to a file whose only job is to
  say what the runner is.
- *Seed required in CI.* A run at an unrecorded seed cannot be replayed, and an order-dependent
  failure that cannot be replayed cannot be fixed. The seed is printed on green runs too: the seed
  of a *passing* run is what a later bisect needs.
- *Two distinct seeds.* One shuffled run tests one order. Two test two, and the second is what turns
  "the suite happened to pass in that order" into evidence.
- *`retry: 0`.* A test that passes on the second attempt under a shuffled order is exactly the
  signal this rule exists to catch; retrying would erase it.

The seeds are derived in CI from the run id, the attempt number and the cell coordinates, so a
re-run of the same commit exercises different orders rather than replaying the one that happened to
be green.

**What would falsify it.** Nothing about the codebase; this is a policy. It would be *undermined* by
a test that depends on order and is quarantined rather than fixed, which is why there is no
quarantine mechanism and why every non-running construct needs a ledger approval (D-0009).

---

## D-0007 — ASCII-only for anything cadenza prints

**Status:** accepted

**Decision.** Every string that can reach a terminal — a CLI message, a thrown error's text, the
seed line `vitest.config.ts` writes — is ASCII. No em-dash, no typographic quotes, no box-drawing.

**Why.** The Windows console is cp932 in the environment this project is developed in, and a
character cp932 cannot encode does not print badly — it raises, and the process dies at the print
rather than at the bug. The failure is invisible to a test suite, because a test harness captures
output as UTF-8; it appears only on a real terminal. That is the same rule `CLAUDE.md` states for
the Python side, kept for the TypeScript side rather than re-derived.

Prose in Markdown and doc comments is exempt: it is not printed.

---

## D-0008 — Biome, knip, and no build output yet

**Status:** accepted

**Decision.** Biome 2.x is the single linter *and* formatter. Knip guards the export surface. There
is no `build` script, no `dist/`, and no `tsconfig.build.json`.

**Why one tool for lint and format.** Two tools disagree, and the disagreement is a class of CI
failure with no bug behind it. Biome does both from one config and one binary.

**Why knip.** A port grows its `src/index.ts` ahead of its consumers by construction: the barrel is
the statement of what has been ported, and every entry in it is unused until something imports it.
Knip is what stops that from being indistinguishable from an export nobody ever needed.

**Why no build.** The package is `private`, publishes nothing, and is consumed only by its own test
suite, which vitest transforms from source. A build step would be a second thing to keep correct
with no consumer on the other end of it. It arrives with the first consumer, not before.

---

## D-0009 — The parity ledger and the source inventory, and a seventh failure class

**Status:** accepted

**Decision.** Cadenza carries continuo's ledger machinery: one ledger per source test file, a
committed source inventory of collected node ids, and `scripts/parity-check.mjs` +
`scripts/source-inventory-check.mjs` wired into `npm run verify` and into CI. The six failure classes
continuo's parity check reports are kept name for name — `missing`, `duplicate`, `unmapped`,
unapproved non-running tests, `shrinkage`, `totals`.

Cadenza adds a seventh: **`unaccounted-file`**. Every collected test must belong to a file that is
either a ledger's target file or is declared in `parity/target-only.json` with a stated reason.

**Why the seventh.** Continuo's `unmapped` sweep is scoped to each ledger's own target file, so a
test file that *no* ledger mentions is swept by nothing at all. In continuo that hole is narrow,
because coverage started at a whole subsystem. In cadenza it would be most of the suite: this
bootstrap has one ledger and three unledgered files, and without the seventh class all three could
grow indefinitely outside the accounting. Making the accounting total is cheap now and impossible
to retrofit later without an audit.

**What is deliberately not carried.** Continuo's `conditionally_collected` declaration, which
excuses a target test that exists in the file but that the host did not collect — pytest collects a
skipped test and `vitest list` omits one, so a capability-probed case has a source node id and no
target id. Cadenza's source suite has no `skipif` and no `xfail` anywhere (330 collected, 330 passed,
0 skipped, at `a5672f8`), so there is nothing for it to excuse. Leaving it out fails **closed**: a
conditionally skipped case introduced later is reported as `missing`, a false red that the belt
introducing it answers by bringing the declaration over — which is the right moment to do it.

**What would falsify it.** A cadenza test that must be skipped on some hosts. See above: the check
goes red rather than quiet, which is the outcome this is designed for.

---

## D-0010 — The ledger's unit is the pytest node id, not the test function

**Status:** accepted

**Decision.** `parity/source-inventory/*.txt` holds pytest **node ids** as collected, and a ledger
entry maps one node id to one target test id. Cadenza's suite is **330 node ids** from **127 test
functions**; both numbers are recorded in `parity/source-inventory.manifest.json` and
`scripts/source-inventory-check.mjs` re-derives the second from the source files.

**Why this needs an entry.** The kickoff (cadenza#8) states the suite's size as "127 node id". 127
is the count of `def test_` functions; the count of ids pytest actually collects is 330, the
difference being parametrised cases — `tests/test_import_boundaries.py` alone is 9 functions and 97
ids. The two numbers are both correct about different things, and the ledger has to pick one.

It picks the node id, because that is the unit the ledger's guarantee is about. A function-granular
ledger would let a case parametrised over 7 projects be translated with 1 of them and still
reconcile: the entry exists, the target exists, every total adds up, and six sevenths of the
coverage is gone with no diff to point at. `tests/test_digest.py`'s own
`test_digest_changes_when_any_semantic_field_changes` is exactly that shape, which is why the pilot
would have been the first place it mattered.

Preserving node ids is also what makes a mapping *byte-stable*: `test/testkit/parametrize.ts` takes
pytest's id verbatim and produces `name[id]`, so a target id is a function of the source id rather
than of how a translator worded a title template.

**The kickoff's figure is not contradicted, it is reconciled.** The manifest records 127 alongside
330 and the check enforces both, so neither can drift without the other being re-derived.

**What would falsify it.** Nothing observed. The cost is that a ledger is larger than the source
file's function count suggests, which is a cost paid in review time and is the point.

---

## D-0011 — The differential oracle, and the one face this pilot implements

**Status:** accepted

**Decision.** Beside the ported tests, the port carries a **differential oracle**: for a fixed
corpus, the artefact the Python implementation produces and the artefact the TypeScript
implementation produces are compared field by field, including fields nobody wrote a test about.
This bootstrap implements one face — **`config_digest` byte-identity** — as
`scripts/oracle/dump_config_digest.py`, `parity/oracle/config-digest-vector.json` and
`test/domain/digest-oracle.test.ts`.

**Why a ported test is not enough.** A translated case asserts that cadenza behaves as the *Python
test* required. Everything the Python suite never thought to assert — because in Python it was true
by construction — translates into a TypeScript test that is equally silent. `tests/test_digest.py`
asserts the encoding for exactly one project, spelled entirely in ASCII; everything CPython's
`json.dumps` does that the port had to reimplement is unexercised by it.

**Why this face, first.** `config_digest` is a **persisted** value (design doc section 4): a run
records it, and a later audit reads a changed digest as "the catalog moved underneath a run that
already happened". A language-induced change to the digest would not surface as a failing test. It
would surface as an audit reporting a change that never happened, on every run recorded before the
port. That makes it the highest-risk artefact in G1 and the right thing to pin at the bootstrap
rather than at the belt that happens to reach it.

**It earned its place immediately.** The corpus row
`alias-sort-crosses-the-surrogate-boundary` exists because `sorted()` in Python compares code points
and `Array.prototype.sort` compares UTF-16 code units, which disagree for an astral character beside
one in U+E000..U+FFFF. Replacing `sort(compareByCodePoint)` with a bare `sort()` was measured
against the suite: **the thirteen ported cases stay green and the oracle turns red.** No test
translated from `tests/test_digest.py` can see that divergence, because no project in that file has
an alias it applies to.

**Cadenza's oracle is cheaper than continuo's**, and the difference is worth stating: continuo's
Python half needs a second checkout of interlock, while cadenza is being rewritten *in place*, so
`scripts/oracle/dump_config_digest.py` imports the implementation it questions straight out of
`src/`. Regenerating the vector is one command with no external dependency.

**What would falsify it.** Retiring `src/cadenza/`, which is a later PR (D-0014) and which turns the
committed vector from "reproducible on demand" into "a historical record of what CPython said".
That is a real change in what the oracle means and needs its own entry when it happens.

---

## D-0012 — The TypeScript tree lives at the repository root, beside the Python package

**Status:** accepted

**Decision.** `src/`, `test/`, `scripts/` and `parity/` at the repository root, with the Python
package remaining at `src/cadenza/` and the Python suite at `tests/`. Not `ts/src`, not a second
package directory.

**Why.** This is where the tree finally lives. The Python implementation is retired by a later PR
(D-0014), and at that point a nested layout would have to be hoisted — a diff that moves every file
and reviews as nothing. Putting it at the root now means the retirement PR deletes and does not
move.

**The cost, stated.** During coexistence `src/domain/digest.ts` sits beside `src/cadenza/domain/`,
and `test/` sits beside `tests/`. One character separates the two test directories. Both globs are
therefore anchored rather than left to a recursive search — `vitest.config.ts` includes
`test/**/*.test.ts` and `pyproject.toml` sets `testpaths = ["tests"]` — so neither runner can pick
up the other's files by accident. `setuptools`' package discovery is unaffected: it looks for
`__init__.py`, and `src/domain/` has none.

---

## D-0013 — The canonical encoder refuses a lone surrogate rather than escaping it

**Status:** accepted

**Decision.** `canonicalJson` throws `SurrogateInStringError` on an unpaired surrogate, where
`JSON.stringify` would return `"\ud800"`.

**Why.** CPython, on the same input, emits the raw character from `json.dumps` and then raises
`UnicodeEncodeError` from `.encode("utf-8")`. `JSON.stringify` has been well-formed since ES2019 and
returns a string instead. The two behaviours are not close: one refuses to produce a digest and the
other produces one. Producing a digest where the source refused would mean the port silently accepts
a project the Python implementation rejects, and writes a persisted value for it.

The exception *class* differs, and that is allowed — the refusal is what ports, not the taxonomy of
a runtime error CPython raises from its codec.

**Reachability, stated rather than implied.** No catalog file can carry a lone surrogate: `tomllib`
decodes UTF-8 strictly. It is reachable by a caller constructing a `Project` directly, which is what
the test suite itself does, and by any future input path that is not a TOML file.

**What would falsify it.** A finding that CPython's refusal is itself the defect, in which case the
design document is where that gets settled first (D-0001).

---

## D-0014 — G2 and the interlock seam are untouched by the port

**Status:** accepted

**Decision.** The port does not touch G2 (frozen at cadenza#9 pending interlock#74's TypeScript
migration) and does not open the interlock seam: `src/cadenza/adapters/interlock/` stays empty on
the Python side and has no TypeScript counterpart. The Python implementation is not removed by this
PR.

**Why.** Three separate reasons that happen to point the same way. G2 is frozen by a decision taken
elsewhere and a port is not a licence to unfreeze it. The interlock seam is deliberately empty
because `pyproject.toml` records that interlock's control-plane API and SQLite schema are marked
throwaway on interlock's own side, so depending on them would turn a spike into a dependency by
inertia — and that reasoning is unaffected by which language the dependant is written in. And
removing the Python implementation in the same PR that introduces the TypeScript one would delete
the oracle's Python half (D-0011) in the same diff that first relies on it.

**What would falsify it.** interlock#74 landing, which is the stated precondition for unfreezing G2.
