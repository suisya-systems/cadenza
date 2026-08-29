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
| D-0015 | Value objects are snapshotted and frozen, not merely typed `readonly` | accepted |
| D-0016 | `smol-toml` is the port's one runtime dependency | accepted |
| D-0017 | The oracle's second face: composition, over the persisted digest only | accepted |
| D-0018 | Python's standard library is ported, not approximated | accepted |
| D-0019 | The clone-source belt: `tmp_path`-only fixtures need no filesystem, and a frozen structural type is proven at both the type checker and the runtime | accepted |
| D-0020 | The identifier belt's two predicted traps, settled by measurement | accepted |
| D-0021 | The git-parity oracle runs the real `git` binary; `match=` becomes a `RegExp` only where a plain substring would look for a character the message never contains | accepted |
| D-0022 | The import boundary is a test that parses the tree, not a lint rule: measured against Biome, chosen for the ledger | accepted |

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

**The non-running sweep reads the syntax tree, not the source text.** Continuo matches text with
comments and single-line strings blanked out. Two holes in that were raised at review of this
bootstrap and are both reproducible: a chained modifier (`test.concurrent.skip`, and
`test.skip.concurrent` -- vitest accepts either order) matches no pattern anchored to `test.` , and
blanking comments before strings lets `const marker = "/*";` open a block comment that erases every
`test.skip` up to the next close or to end of file. Getting both right in one text pass is a lexer,
and the lexer is already installed: `typescript` is a devDependency because `tsc` type-checks this
repository, so `scripts/parity-check.mjs` uses `ts.createSourceFile` and asks the tree. Comments and
string literals are not nodes, so the prose in these files -- which discusses `test.skip` at
length -- cannot be counted either.

**An alias is refused, not approved.** The approvals are *exact counts*, and a count only means
something if every disabled test is countable. `const quarantine = test.skip` followed by three
`quarantine(...)` calls is one property access and three disabled tests, so one approval would
license all of them; `const { skip } = test` leaves no chain to find at all. Resolving arbitrary
aliases is a type checker's job. So a reference to `test`, `it` or `describe` that is never called is
reported as `runner-alias` and the gate goes red -- which costs a suite nothing it needs, and keeps
the count countable. An approval with no reason is refused for the same reason a `not-ported` entry
with no reason is.

**What a runner is, is read off the imports.** `import { test as check } from "vitest"` binds the
same function to another name, and `check.skip(...)` disables a test while a sweep looking for the
literal `test` sees nothing -- the last aliasing route, and the one that decides the meaning of every
other rule here. So the roots are per-file, derived from each file's own import declarations, and a
namespace import is refused: `import * as v from "vitest"` puts every runner behind a property access
that no finite list of roots can enumerate.

All four routes were found by review, in four rounds, and each is the remaining half of the one
before it. That is worth recording as a shape rather than as four incidents: a rule about *names* in
a language with aliasing is not finished until the binding site is the thing being read.

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

---

## D-0015 — Value objects are snapshotted and frozen, not merely typed `readonly`

**Status:** accepted

**Decision.** `project()`, `gitUrlSource()`, `localPathSource()` and `newRepositorySource()` copy
what they are given and `Object.freeze` what they return. `Project.aliases` is a copy of the caller's
array, frozen, and `Project.source` is a copy rebuilt through the factories by `snapshotSource`.

**Why the type is not enough.** `readonly string[]` is a compile-time claim, and a mutable
`string[]` is assignable to it. A caller can pass an array, keep the reference, and push to it
afterwards; the `Project` would then report different aliases, and `configDigest` a different digest,
for a project nobody edited. Python cannot do this: `Project.aliases` is a `tuple`.

That asymmetry would be a curiosity if the digest were computed and discarded. It is persisted
(design doc section 4), and a later audit reads a changed digest as "the catalog moved underneath a
run that already happened" — so the failure mode is not a wrong value in a test, it is an audit
reporting an edit that never happened. The guarantee therefore has to survive to runtime.

The clone source has the same problem by a second route, and the factories alone do not close it:
`CloneSource` is a **structural** type, so `{ kind: "git_url", url }` written as an object literal is
a valid one and arrives unfrozen however carefully the factories behave. `snapshotSource` rebuilds it
through them. It is a `switch` rather than a spread so that the copy carries exactly the fields its
`kind` defines, and so that a member added later fails to compile rather than falling through to a
shared reference.

Freezing as well as copying is what makes the `readonly` claim true against a cast: in a module,
which is always strict mode, a write to a frozen object throws rather than failing silently.

**Raised by review** of the bootstrap PR, in two rounds -- the aliases first, the structurally-typed
source second -- not designed in. Recorded because the reasoning generalises
to every value object the port adds, and the next one will be written by someone who did not see the
review.

**The same asymmetry reaches the module-level constants**, and the composition belt was caught by it:
`ALLOWED_URL_SCHEMES` and `SUPPORTED_SCHEMA_VERSIONS` translate Python `frozenset`s, and a
`ReadonlySet` is an ordinary `Set` at runtime — `Object.freeze` does not help, because freezing an
object does nothing to a `Set`'s internal slots. These are **validation state on the public surface**:
`ALLOWED_URL_SCHEMES.add("ftp")` makes every later catalog accept an unauthenticated transport, and a
clone is code execution. `src/domain/frozen.ts` rebuilds `frozenset` — mutators that throw
`TypeError`, defined non-enumerable so the value still compares equal to a plain `Set`. The two
`PathFlavour` objects are frozen for the same reason one level along: `parseCloneSource` reads
`normpath` and `isRelativeTo` off them for root containment and for the path it persists.

**Raised by review** again, in the belt's fourth round, which is the argument for the entry existing:
the principle was written down after the bootstrap and still had to be rediscovered by a reviewer on
the next belt, because it had only ever been applied to value objects.

**What would falsify it.** A value object large enough that copying it per construction is
measurable. Nothing in G1 is anywhere near that; `Project` holds four fields and a short array.

---

## D-0016 — `smol-toml` is the port's one runtime dependency

**Status:** accepted

**Decision.** The TOML layer loader parses with [`smol-toml`](https://www.npmjs.com/package/smol-toml),
pinned exactly in `package-lock.json` (D-0004). It is the port's **only** runtime dependency; the
package had none before.

**Why a dependency at all.** `tomllib` is in Python's standard library and Node ships no TOML parser,
so porting `src/cadenza/adapters/toml_catalog/loader.py` meant taking a dependency or writing a
parser.

**Why not write one.** Because the ledger could not tell the difference. The 14 cases of
`tests/test_toml_loader.py` assert that a syntax error becomes a `CatalogError` naming the file, that
layers arrive lowest-precedence-first, and that the shipped `config/projects.toml` composes. Not one
of them would notice a hand-rolled parser disagreeing with `tomllib` about string escapes, integer
forms, dotted keys or inline tables — so `npm run parity` would stay green over a parser that read
catalogs differently from the specification's, and the difference would surface as a composed value,
which is to say as a **digest**. A parser is exactly the wrong place to accept untested surface.

**Why this one.** TOML 1.0.0 conformant, no dependencies of its own, and small enough to read. The
alternatives with a wider install base carry transitive dependencies, and the supply-chain surface is
the thing being spent here.

**Two known disagreements with `tomllib`**, both recorded in
`parity/toml-loader.ledger.json` and neither reachable by any ported case:

- An integer outside JavaScript's safe range is a **parse error** for `smol-toml` and an ordinary
  arbitrary-precision `int` for `tomllib`.
- A float and an integer of the same value are one number in JavaScript, so `schema_version = 1.0`
  parses to `1` and is **accepted**, where `tomllib` yields a float that design doc section 5.2
  refuses. Under D-0001 that is a defect in the port, and it is **not closable at the composer**: the
  distinction is destroyed by the parser before the composer sees the value. It is raised as a
  finding rather than transcribed silently, and it is why
  `tests/test_compose.py::test_non_integer_schema_version_is_refused[1.0]` is the belt's one
  `not-ported` case.

**Approved by the 窓口** before implementation, together with the belt's scope, because taking the
supply-chain surface from zero to one is not a decision a belt makes on its own.

**What would falsify it.** A TOML parser for Node that preserves the integer/float distinction would
close the second disagreement above and would be worth the swap on its own.

---

## D-0017 — The oracle's second face: composition, over the persisted digest only

**Status:** accepted

**Decision.** The differential oracle (D-0011) gains a **second face**: for a fixed corpus of layer
documents, the `config_digest` that CPython's `resolve_project` produces and the one the port's
`resolveProject` produces are compared, as `scripts/oracle/dump_compose_digest.py`,
`parity/oracle/compose-digest-vector.json` and `test/application/compose-oracle.test.ts`.

**Why the first face is not enough.** It questions the **encoder**, over `Project` values built by
hand. A `Project` in production is not built by hand: it is composed from ordered layer documents,
merged field by field, tombstoned, aliased and resolved, and every one of those steps feeds the value
the encoder hashes. `tests/test_compose.py` asserts *which* project comes out and *which* refusals
fire; it asserts almost nothing about the exact strings that reach the digest, because in Python
those are right by construction.

**It earned its place, measured the same way D-0011's did.** A `parseBaseBranch` that returns
`value.normalize("NFC")` — a plausible edit, since JavaScript makes normalising look like tidying —
leaves **all 103 ported tests green, the first oracle face included**, and turns the second face red
on the corpus row `base-branch-nfd`. Nothing else in the suite can see it: no ported compose or
resolve case uses a non-ASCII branch name, and the first face never calls the validator.

**What the face deliberately excludes.**

- **Refusal messages and `difflib` suggestions.** They are displayed, never persisted, so a
  divergence costs a confusing sentence rather than a suspect digest. A committed vector of message
  strings would be a large artefact defending the smaller risk.
- **`local_path` sources.** Their normalised form is platform-dependent, so a committed vector would
  be a statement about the machine that generated it and would fail the Windows cell for being
  correct. That surface is pinned by `test/domain/python-path.test.ts` instead, which asserts **both**
  flavours on **every** platform — strictly more than a single-platform vector could.

**Approved by the 窓口** before implementation, with the scope limited to the persisted value.

**What would falsify it.** The same thing that falsifies D-0011: retiring `src/cadenza/`.

---

## D-0018 — Python's standard library is ported, not approximated

**Status:** accepted

**Decision.** Where the Python implementation depends on standard-library behaviour, the port
**reproduces that behaviour explicitly** rather than reaching for the nearest platform equivalent.
This belt added four such modules: `src/domain/python-path.ts` (`os.path`, `pathlib`),
`src/domain/python-urlsplit.ts` (`urllib.parse`), `src/domain/python-difflib.ts` (`difflib`) and
`src/domain/python-text.ts` (`str.isspace`, `repr`, `type(...).__name__`). Each carries its own
target-only contract test, for the reason `test/domain/canonical-json.test.ts` already records:
reimplementing something that was true by construction in Python is what creates the surface.

**Why not the platform equivalent.** In every case the equivalent is *nearly* right, and the gap is
silent:

| Reached for | Would have been | Disagrees on |
|---|---|---|
| `node:path` | `os.path` | a trailing slash; two leading slashes; a `..` inside a UNC anchor |
| `new URL(...)` | `urllib.parse.urlsplit` | lower-casing, percent-encoding, IDNA, a dropped default port — the URL is stored **verbatim** and hashed |
| an edit-distance library | `difflib.SequenceMatcher.ratio` | it is not edit distance, so a different set of names is suggested |
| `/\s/` | `str.isspace()` | U+001C..U+001F and U+0085 (Python only); U+FEFF (JavaScript only) |

The first two feed `LocalPathSource.path` and `GitUrlSource.url`, which are **persisted** through
`config_digest`; the fourth decides which catalogs are accepted at all.

**How each port was checked.** Against real CPython 3.12, by generating inputs and comparing both
sides before any of it was committed: 6,511 paths across both flavours for `normpath`, `isabs` and
`is_absolute`, 190 more for `join` and `is_relative_to`, 39 URLs, and 112 `get_close_matches` rows
including astral characters. The committed tests are the subset a reader can check by eye; the sweep
is what established there was nothing else.

**It caught a real one.** `PureWindowsPath.is_absolute` turns on CPython's
`drv_parts[2] not in '?.'`, and `in` on a `str` is a **substring** test, not a membership test over
two characters — so the empty piece that `///C:` produces is "in" `'?.'`. Written as two character
comparisons, the port called `///C:` absolute and CPython does not.

**What would falsify it.** A platform API that matches the Python one exactly. `node:path` is not
becoming `os.path`; the more likely case is a future belt needing so little of a module that a
five-line local helper is honest, and the test that pins it is what makes that judgeable.

---

## D-0019 — The clone-source belt: `tmp_path`-only fixtures need no filesystem, and a frozen structural type is proven at both the type checker and the runtime

**Status:** accepted

**Decision.** `tests/test_clone_source.py`'s 57 node ids are ported at
`test/domain/clone-source.test.ts`, case by case in `parity/clone-source.ledger.json` (42 `ported`,
15 `adapted`, 0 `not-ported`, 0 `waived`). `parseCloneSource` itself came over with the composition
belt (D-0017's ledgers record the gap this closes); this belt is only its own 57 cases.

**Thirteen `tmp_path` cases are `adapted`, and the mapping is the composition belt's own
precedent, repeated rather than reinvented.** `parseCloneSource` never stats or reads a path —
`_normalise_path`/`normalisePath` call `normpath`, never a filesystem-resolving call — so every
case in the source file that took `tmp_path` needed only *some* absolute directory, not a real one.
`parity/compose.ledger.json` already recorded this exact substitution (`CATALOG_DIR` from
`test/support.ts`) for its own three `allowed_local_roots` cases; this belt's ledger cites that
systematic mapping rather than re-deriving it, and extends `test/support.ts` with the `ELSEWHERE`
export `tests/support.py` also carries, held back until now because nothing imported it (`npm run
knip`).

**One `monkeypatch.setenv` case has no vitest counterpart and is adapted accordingly.**
"a tilde is expanded against the home directory" sets `process.env.HOME` and `process.env.USERPROFILE`
directly and restores both with `onTestFinished`, registered at the point of acquisition rather than
in a file-level `afterEach` — `docs/porting.md`'s testkit rule 1, applied to environment variables
rather than to a resource handle. Both variables are set because `ntpath.expanduser` ignores `HOME`
entirely and reads `USERPROFILE`; setting only `HOME` would assert nothing on the Windows cell, which
is the source test's own comment.

**"sources are frozen" is adapted because the freezing mechanism itself changed, not the property.**
Python's `GitUrlSource` is a `@dataclass(frozen=True)`, and a rebinding attempt raises
`FrozenInstanceError`. `CloneSource` here is a structural interface, not a class with a runtime
identity, so `gitUrlSource` freezes the object it returns with `Object.freeze`; an ES module is
implicitly strict, so the rebinding attempt is a `TypeError` rather than a silent no-op. The ported
case adds a `@ts-expect-error` on the same assignment, which the source case has no way to state:
the guarantee is pinned at the type checker *and* the runtime, because only the structural type
needs both — a frozen dataclass's fields are already `Final` in the type checker's eyes.

**What would falsify it.** A future belt whose source cases touch a real filesystem through
`parse_clone_source` or its port — none does today, which is exactly why the `tmp_path` substitution
is sound here and would not be if a case ever asserted on `path.exists()` or a symlink.

---

## D-0020 — The identifier belt's two predicted traps, settled by measurement

**Status:** accepted

**Decision.** The kickoff (cadenza#8) predicted two cross-language traps for
`tests/test_identifiers.py`. Both are settled here by **running both implementations over a corpus
and diffing the verdicts**, not by reading the two spellings side by side and judging them alike.
The conclusion of each is recorded below with the measurement that produced it, and the two
properties the port now depends on are held by target-only cases in
`test/domain/identifiers.test.ts` rather than by this prose.

**How it was measured.** `parse_identifier` (CPython 3.12.3, from `src/cadenza/`) and
`parseIdentifier` (the port, compiled from `src/`) were run over the same 3,169 values: every code
point below U+0300 in four positions (alone, appended, embedded, prepended), the whitespace and
format controls above it (U+0085, U+1680, U+180E, U+200B, U+2028, U+2029, U+202F, U+205F, U+2060,
U+3000, U+FEFF), U+FFFD, U+E000, U+FFFF, U+10FFFF and U+1F600, ten trailing-terminator shapes, both
length boundaries (64 and 65 characters, and a 64-code-point astral value), and the six shapes the
source file itself uses. Lone surrogates were probed separately, JSON not being able to carry them.
For each value both sides recorded accept/refuse and, on refusal, the message. `str.isspace()` and
`/\s/u` were compared over the whole code point space, and CPython's `repr` against the port's over
the same.

**Trap 1 — `\Z` against `$`. Real, and the naive translation is right for a reason worth
recording.** `IDENTIFIER_PATTERN` ends `\Z`, so `"web\n"` is refused; Python's `$` would have
accepted it. JavaScript's `$` **without** the `m` flag anchors at the end of the input, as `\Z`
does, so the naive `/^[a-z][a-z0-9_-]{0,63}$/` is correct — and it is correct only while the flag
stays off. Measured: the same source under `m` accepts `web\n`, and also `web\r`, `web\u2028` and
`web\u2029`, three terminators Python's `$` does not break a line at. So the risk here is not the
translation that was written; it is the flag a later edit adds for an unrelated reason. That is what
`carries no flags, because 'm' would restore Python's '$'` pins.

**Trap 2 — `str.isspace()` against `/\s/`. Does not arise in this file, and the reason generalises.**
`parse_identifier` consults no whitespace predicate at all: its gate is a **positive** character
class, `[a-z0-9_-]`, so a space is refused for not being in the class rather than for being
whitespace. The prediction was that a `/\s/` translation would loosen the refusal — which is true of
the shape `_parse_git_url` and `parse_base_branch` use (refuse anything `isspace()`) and is why
`isPythonSpace` exists (D-0018), but there is no such shape here to get wrong. The measurement says
the same thing from the other side: over the corpus the two implementations disagree on
**zero** accept/refuse verdicts, the six whitespace-disagreement code points (U+001C..U+001F and
U+0085, whitespace to Python only; U+FEFF, to JavaScript only) included. The case
`refuses whitespace on both sides of the isspace()/\s disagreement` keeps that true if the gate is
ever rewritten into a refusal shape.

**What the measurement found that the kickoff did not predict.** Two things, both message-only and
neither reachable through this file's cases:

- **The refusal text diverges wherever CPython's `repr` escapes a non-ASCII code point.** `repr`
  decides "printable" from the Unicode character database; `pythonRepr` escapes only the ASCII
  non-printables. Swept over all 1,112,064 code points: **963,033 differ**, the first at U+0080. The
  ASCII range is exact, and so is the one non-ASCII value this file tests (U+00E9, which CPython
  prints as itself). This is the limitation `src/domain/python-text.ts` already states, now with a
  number attached; it is displayed text and reaches nothing a run persists (D-0017), so it stays
  documented rather than fixed.
- **The 64-character bound counts different units and cannot be observed doing so.** `{0,63}` counts
  UTF-16 code units in JavaScript and code points in Python, so a value with an astral character
  would be measured differently — but every value the class admits is ASCII, so no such value is
  ever accepted by either side. Recorded because the next belt to widen a character class inherits
  the question.

**Why this is a decision and not a note in the ledger.** Both conclusions are of the form "the
obvious spelling is correct **because** of a property that nothing in the code requires" — an absent
regex flag, a class that happens to be positive. A ledger entry explains one case to whoever reads
that case. This says the property out loud, so an edit that removes it is recognisable as removing
something.

**What would falsify it.** A source file whose identifier gate stops being a positive class; a
`parse_identifier` that gains a whitespace or normalisation step; or an `m` flag on
`IDENTIFIER_PATTERN`, which the target-only case turns red. The measurement is pinned to CPython
3.12.3 and Node 22; a Unicode version change would move the `repr` figure and nothing else here.

---

## D-0021 — The git-parity oracle runs the real `git` binary; `match=` becomes a `RegExp` only where a plain substring would look for a character the message never contains

**Status:** accepted

**Decision.** `tests/test_refs.py::test_the_validator_refuses_everything_git_refuses` -- the case
the design doc names by name as the reason `parse_base_branch`'s rule list is checked against `git
check-ref-format` rather than a second copy of the rules -- is ported as a real subprocess call, not
a fixed corpus of pre-recorded answers. `test/domain/refs.test.ts` spawns `git --version` once to
decide whether the suite has `git` on `PATH` at all, and `git check-ref-format refs/heads/<name>` per
corpus row, using `node:child_process.execFileSync`. No dependency was added: `execFileSync` is
`node:child_process`, already reachable everywhere Node runs, and never goes through a shell. Where
`git` is absent, the 24 cases are skipped as a group (`test.skipIf`, approved once in
`parity/refs.ledger.json` because the check that counts non-running constructs reads the syntax tree
and this is one call site inside a loop, not 24).

Second, and considered while porting the file's other parametrized case
(`test_refuses_each_documented_ref_violation`, 23 rows): pytest's `match=` is `re.search` against
`str(exc)`, and the naive translation is `expect(...).toThrow(pattern)`. For every row but two, the
source pattern carries no regex metacharacter and a plain string (`.includes()`) is the same check.
Two rows -- `r"must not contain '\.\.'"` and `r"must not end with '\.lock'"` -- are regexes whose only
metacharacter is an escaped, **literal** dot: `\.` matches the same one character `.` does here, so a
plain substring of the *rendered* text (`"must not contain '..'"`, no backslash -- confirmed against
`pythonRepr`'s actual output) is an equally correct translation, and a mismatched substring fails
`toThrow` loudly rather than passing vacuously either way. There is no silent-pass hazard in either
choice. What is NOT equivalent is transcribing the regex **source** verbatim into a plain string --
`"must not contain '\\.\\.'"`, backslashes and all -- and handing that to `toThrow`: `.includes()`
then looks for a backslash character the message never contains, and the two dots it does contain are
never checked at all. That transcription is close enough to what copying `r"...\.\.. "` out of the
Python source looks like to write by reflex, which is why this belt used a `RegExp` built from the
same characters for these two rows instead of reasoning about which characters survive the switch:
a `RegExp` and its source string mean the same thing in both languages, so there is nothing to get
backwards. The rule for later belts: a `match=` pattern with a regex metacharacter is carried over as
a `RegExp`, not re-derived as a substring by hand.

**Why not a fixed vector, the way the two digest oracles use one.** Those two compare a **persisted**
value against a committed vector so a regenerated vector re-proves it was measured against real
CPython (docs/porting.md section 4). `git check-ref-format`'s answer is not persisted anywhere and
is not migrating away from Python -- both the Python suite and this one ask the *installed* `git`
the same question at run time, and the property under test ("never more permissive than git") is
exactly the property a frozen snapshot of git's answers on one version would stop checking.

**What would falsify it.** A CI image or a contributor's machine with no `git` on `PATH` would silently
skip 24 cases rather than fail the build -- inherited from the source's own `skipif`, recorded in
`parity/refs.ledger.json`'s `inherited_limitations`, and not this belt's to tighten.

---

## D-0022 — The import boundary is a test that parses the tree, not a lint rule: measured against Biome, chosen for the ledger

**Status:** accepted

**Decision.** The TypeScript half of design section 8's dependency direction is enforced by
`test/architecture/import-boundaries.test.ts`, a vitest test file that walks `src/` and parses each
module with `ts.createSourceFile`. It is not a Biome rule, not `dependency-cruiser`, and not a
standalone script. It runs in the ordinary suite -- so under the double-green rule (D-0006) on all
six matrix cells -- and additionally as its own named step in the `checks` job, mirroring what
`tests.yml` already does for the Python half.

Its 98 cases are the target of `parity/import-boundaries.ledger.json`, which endorses all 97 node
ids of `tests/test_import_boundaries.py`: 64 `adapted`, 33 `waived`, none `ported`. That is the
kickoff's own instruction (cadenza#8) rather than a judgement made here -- re-point the file, record
the result as `adapted`, do not silently drop it.

**Biome can do the graph half, and that is not the question. Measured.**
`noRestrictedImports` has been in Biome since 1.6.0, and 2.5.10 supports both `patterns` (for the
layer rule) and `allowImportNames` (for the binding-level allowance the domain rule needs). Under an
`overrides` entry scoped to `src/domain/**`, it reported all three planted violations -- a
`node:fs` import, `createConnection` from `node:net`, and a `src/domain` -> `src/application` import.
Capability is not why it was not chosen. Three other things are:

1. **A suppression comment silently waives it, and nothing counts suppressions.** Measured: adding
   one `// biome-ignore lint/style/noRestrictedImports: shipping a hotfix` line took the run from
   three errors to two, with no other signal anywhere. The boundary would be removable in the same
   diff that crosses it. The parity machinery has a whole failure class (`unapproved-skip`) built on
   the premise that a disabled check needs an approval with a reason and an exact count; a lint
   suppression is that hole reopened next to it.
2. **It covers two of the nine source functions.** The other seven are not import-graph claims:
   module naming, a forbidden word in the text, the reserved seam's state, the walk's own
   non-vacuity, and the sweep for POSIX-only anchors in the *test* tree. Splitting one file's
   subject across a lint config and a test file makes the boundary harder to review, which is the
   thing section 8 says it exists to avoid.
3. **Decisively: the ledger's unit is a target test id, and a diagnostic has none.** D-0010 makes
   the unit a node id, and `scripts/parity-check.mjs` reads target ids from `vitest list --json`. A
   Biome rule produces findings, not collected tests, so 97 source cases would have had nowhere to
   map and the file could not have been endorsed at all. Anything that enforces this boundary has to
   be a test for the accounting to reach it.

**What was not measured, stated so nobody reads more into this entry.** `dependency-cruiser` and
`eslint-plugin-boundaries` were not evaluated: the worker sandbox's npm cache is read-only, so
nothing could be installed to try. Point 3 applies to both by construction and point 2 applies to
both as graph-only tools, but the claim here is reasoning, not measurement. Adding either would also
be a new devDependency for a job `typescript` already does -- it is a devDependency because `tsc`
type-checks this repository, and `scripts/parity-check.mjs` already parses with it rather than
sweeping text, for the reason recorded there: a text sweep misses a chained modifier and can be
derailed by a comment marker inside a string.

**The domain rule is inverted from the source's, deliberately.** `tests/test_import_boundaries.py`
states a **denylist** -- `socket`, `subprocess`, `shutil`, `sqlite3`, `http.client`,
`urllib.request` -- with `os` allowed wholesale for `expanduser`. That shape does not survive the
crossing: `node:net` *is* the socket module the denylist names first, and `isIP` is a pure predicate
that lives in it, so a denylist either forbids `node:net` and fails on
`src/domain/python-urlsplit.ts` today or admits `createConnection` along with `isIP`. The port names
the **bindings** instead -- `node:crypto` for `createHash`, `node:os` for `homedir`, `node:net` for
`isIP` -- which makes it an allowlist that fails closed: a builtin nobody thought of is a violation
rather than an omission, and a namespace or default import of an allowed module is refused because
neither can be checked binding by binding. Widening it is a diff to that table with a reason beside
it, which is the review the source's `os` allowance got once and cannot ask for again.

**How the check itself was checked.** Fourteen violations were planted one at a time and the tree
restored between each: domain -> application, ports -> application, application -> adapters,
`node:fs` in domain, `createConnection` from `node:net`, a namespace import of the *allowed*
`node:os`, interlock reached five ways (bare side-effect import, scoped `@suisya-systems/interlock`
in type position, `claude-org-runtime` through a dynamic `import()` in a function body, a re-export,
and a plain named import), a module named `runtime`, `provider-neutral` in a module's text,
`src/adapters/interlock/` created, and a POSIX-only `baseDir` literal in a test. Each turned the
expected case red and nothing else; there were no holes. A green suite is not evidence that a
boundary check guards anything, which is why this paragraph exists.

**What stops it passing vacuously**, which is the failure mode a discovery-driven check invites: 89
of the 98 cases are generated from a directory walk, and a walk that found nothing would generate
nothing. Three things, one of them new. The walk has its own case, as the source's does. The
allowlists fail closed. And -- the one the source could not have -- every generated id is claimed by
the ledger, so module churn is a red gate rather than a silent change in coverage. Measured: a new
`src/domain/*.ts` produced five `unmapped` failures, and renaming an existing one produced five
`missing` plus five `unmapped`.

**Three holes were found at review, and all three are closed.** Recorded because each one is a way
this check could have been green while guarding less than it claims, and the first is the class the
whole entry is about:

1. **A dynamic import whose specifier is not a quoted string was dropped silently.**
   ``import(`interlock`)`` is a no-substitution template -- statically known, and invisible to a
   scan that only recognised `ts.isStringLiteral`. `import(name)` cannot be read at all. The first
   is now read as the literal it is; the second is recorded as `<computed>` and **fails closed**,
   turning `no module imports interlock` and the no-I/O cases red. This is the one place the port is
   deliberately stricter than its source, which resolves the same blind spot by seeing nothing: an
   unreadable edge makes every other check optional, because one variable would let the module graph
   say whatever its author wanted.
2. **`src/application` was not swept for I/O.** Design section 8 marks `application/` `(no I/O)` in
   the same code block that marks `domain/`, and the source parametrises its case over the domain
   alone. Under D-0001 the document is the primary oracle and the narrower source test is the
   finding, so the two application modules get the same sweep. Their cases are target-only: the
   claim is the document's, and no source case states it.
3. **An import allowlist cannot see the global surface.** Node hands `fetch` to every module without
   an import, and `console` writes to a stream nobody imported either, so a domain module that
   simply called `fetch(url)` would have been reported by nothing. This has no counterpart in the
   source and could not have one -- reaching the network in Python means importing something, which
   is exactly why a denylist over modules was a complete answer there. A target-only case now sweeps
   both pure layers for `fetch`, `WebSocket`, `EventSource`, `XMLHttpRequest` and `console`, and for
   any use of `process` beyond `env` and `platform` -- the two `src/domain/python-path.ts` already
   depends on, `env` being the same `expanduser` allowance the source records in the same words.

Eight further violations were planted to check the three fixes, and each turned the expected case
red: a template specifier, a computed one, a concatenated one, `node:fs` in `src/application`,
`fetch()` in the domain, `console.log()` in the application, `process.cwd()`, and a bare `process`.
`process.env` and `process.platform` stay green where the port already uses them.

**A second review round found four more, all of the same family: a rule that answered "allowed"
for a shape nobody had thought of.** Each is closed, and the pattern is worth naming because three
of the four were denylists.

4. **The layer rule was a denylist and the port has a barrel.** `src/index.ts` is in no layer and
   re-exports across all of them, so a domain module importing `../index.js` matched no forbidden
   prefix and reached `src/application` through the re-export. `ALLOWED_BY_LAYER` now names what
   each layer *may* import, and `UNLAYERED_MODULES` names the one module allowed to belong to no
   layer -- so a new top-level module under `src/` fails until it is classified, rather than
   inheriting the barrel's exemption by accident.
5. **`globalThis.fetch(url)` slipped past the global sweep**, because `fetch` there is the *name*
   half of a property access and the sweep suppresses those -- correctly, since `catalog.fetch` is
   somebody else's property. `globalThis` and `global` are refused outright instead, which closes
   the property route and the `globalThis["fetch"]` element-access route in one line.
6. **A side-effect import of an allowlisted builtin bound nothing, so nothing was checked.**
   `import "node:net";` executes the module and produces an empty binding list, which the
   binding-level loop iterated zero times and passed. An allowance granted for `isIP` is not an
   allowance for that, and an empty binding list is now an offender.
7. **The POSIX-anchor sweep recognised only quotes.** ``baseDir: `/srv` ``, `"/srv" as const` and
   `("/srv")` have the same runtime value and are not `StringLiteral` nodes, so all three escaped
   the guard and would have failed on the windows-latest cells instead -- the exact failure the
   case exists to prevent. Parentheses, `as`, `satisfies` and angle-bracket assertions are peeled
   first, and a no-substitution template is read as the literal it is.

Nine more violations were planted for these four and each turned the expected case red: `../index.js`
imported from `src/domain` and from `src/ports`, a new unlayered `src/toplevel.ts`,
`globalThis.fetch`, `globalThis["process"]`, `import "node:net"` in the domain, and `baseDir` written
as a template, as `as const`, and parenthesised.

**A third round found three more, and the entry stops there.** Two are closed and one is recorded
open, which is the honest end state rather than a clean one.

8. **`createRequire` manufactures a loader the scan cannot follow.** `const load =
   createRequire(import.meta.url); load("interlock")` is valid ESM, and only a callee literally
   spelled `require` was followed. The pure layers already refused `node:module` by allowlist, so
   the gap was `src/adapters` and the barrel. Tracking the alias is scope analysis; refusing the one
   import that can produce it is two lines, and `node:module` is now refused everywhere under
   `src/`. Measured: the two-line `createRequire` route turns the adapter's case red.
9. **The anchor sweep unwrapped every call, including the one that fixes the problem.**
   `absolute("/srv")` was reported for being what `test/support.ts` exists to provide. Unwrapping
   now skips a call to `absolute` and nothing else, so `nativePath.join("/srv", x)` is still caught.
10. **An anchor behind a name is still not seen** — `const ROOT = "/srv"` then `baseDir: ROOT`.
    **Left open**, and recorded in the ledger's `inherited_limitations` rather than fixed: the source
    has the identical hole for the identical reason (`_posix_only_literal` returns `None` for an
    `ast.Name`), and following the name means resolving a binding in its scope. The wrappers that
    *are* peeled were widened past the source precisely because they need no scope analysis. This
    case is a second line of defence behind `absolute()`; the windows-latest cells are the first.

The three rounds converged rather than circling: no finding recurred, the severities fell (one P1
family, then four, then none), and each round's findings were narrower than the last. Items 8 and 9
were fixed after the third review and have not themselves been through one.

**What would falsify it.** A way to make a lint suppression countable and reviewable the way
`approved_non_running` is, which would remove reason 1; or a Biome rule that could be addressed by a
ledger entry, which would remove reason 3. Reason 2 would go if the other seven claims found a
natural home elsewhere, which would mean section 8's boundary had stopped being one subject.
