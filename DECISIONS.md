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
| D-0014 | G2 and the interlock seam are untouched by the port | superseded by D-0023 |
| D-0015 | Value objects are snapshotted and frozen, not merely typed `readonly` | accepted |
| D-0016 | `smol-toml` is the port's one runtime dependency | accepted |
| D-0017 | The oracle's second face: composition, over the persisted digest only | accepted |
| D-0018 | Python's standard library is ported, not approximated | accepted |
| D-0019 | The clone-source belt: `tmp_path`-only fixtures need no filesystem, and a frozen structural type is proven at both the type checker and the runtime | accepted |
| D-0020 | The identifier belt's two predicted traps, settled by measurement | accepted |
| D-0021 | The git-parity oracle runs the real `git` binary; `match=` becomes a `RegExp` only where a plain substring would look for a character the message never contains | accepted |
| D-0022 | The import boundary is a test that parses the tree, not a lint rule: measured against Biome, chosen for the ledger | accepted |
| D-0023 | interlock is a frozen source, not a decision-maker: cadenza's open questions are settled at cadenza's own human gate | accepted |
| D-0024 | The syntax tree comes from the compiler, through one module, and the parse is asserted against its own input | accepted |
| D-0025 | G2's unfreeze condition is D-0023's candidate 2: it opens on a design decision taken here, not on the port or on lifting the freeze | accepted |
| D-0026 | What the delegation contract must express: an enumerated grant, a seam that is a document rather than an API, and a total three-valued bound on unattended action | accepted |
| D-0027 | The capability vocabulary: a two-segment key matched by equality, a cumulative version pinned per contract, and seven keys to start | proposed |

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

**Status:** superseded by D-0023

D-0023 restates what this entry decided that still holds — the port neither unfreezes G2 nor opens
the interlock seam — and replaces its account of *why*. The body below is left as written, per this
file's rule that an ID is never rewritten, and is a record of what was believed in August 2026. Read
through D-0023: "pending interlock#74's TypeScript migration" and "interlock#74 landing, which is
the stated precondition for unfreezing G2" describe a precondition cadenza is **not** waiting on.
G2's unfreeze condition is cadenza's to set, and is not set yet.

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

**A fourth round, run because items 8 and 9 changed behaviour after the third, found two P2s and no
P1.** One is closed, one is recorded open.

11. **The seam check asked about a directory, and a file is the other shape.** `src/adapters/
    interlock.ts` is the same seam spelled differently, and an `existsSync` on one extensionless
    path stayed green for it. The question is asked of `MODULES` now, so no module anywhere under
    `src/` may be called `interlock` — as a directory it sits in or as its own name. The ledger
    would have noticed such a file too, by the four target ids it adds, but a gate reporting
    "unaccounted target test" is not the gate that should be reporting an opened interlock seam.
12. **The anchor sweep's `absolute` exemption matches a name, not a binding.** A test declaring its
    own `const absolute = (value: string) => value` would be exempted. **Left open**, recorded in
    the ledger's `inherited_limitations`: resolving the binding is the same line this file already
    draws at `isShadowedOrDeclared`, and shadowing the helper with an identity function is a longer
    way to write a POSIX-only anchor than writing one.

**A fifth round, run for the same reason, found two more P2s and no P1. Both closed, both one
line.** `import { createRequire } from "module"` is the same builtin as `"node:module"` and only the
prefixed spelling was refused; and `{ ["baseDir"]: "/srv" }` is a `ComputedPropertyName` that sets
exactly the property `baseDir: "/srv"` does, which the anchor sweep skipped.

**A sixth round returned a P1, and it is the finding that changed the design.** Rounds four and five
had been P1-clear and had returned a tail of *syntactic spellings* -- a file instead of a directory,
`"module"` instead of `"node:module"`, a computed key instead of a plain one -- which looked like
grammar enumeration. The sixth named `eval('import("interlock")')`, and that made the pattern legible
rather than incidental: `<computed>`, then `createRequire` from `node:module`, then `"module"`
unprefixed, then `eval`/`Function` were **four spellings of one category** -- a module loading
something this scan cannot follow -- and each had been closed by name, leaving the next one open.
`node:vm` and `process.getBuiltinModule` were still open and nobody had named them yet.

Enumerating loaders is a losing game, so the rule was inverted instead. `ALLOWED_EXTERNALS_BY_LAYER`
approves **every** bare specifier per layer, not merely for the two pure layers -- six entries, one
of which is `src/adapters`' `node:fs` and `smol-toml` and two of which are empty -- and `eval` and
`Function` are refused outright because they build code from a string and leave nothing to read.
Together those close the import half of the category at once, the members nobody has thought of
included. Measured: `node:vm` in the adapter and `smol-toml` in the domain both turn red, and neither
was ever named in a denylist. The non-import half took one more round -- see below.

That round's two P2s are closed with it. A triple-slash `reference` directive is recorded on the
`SourceFile` rather than in the tree, so `forEachChild` never reached one; both directive lists are
read now, and a `reference path=` into another layer turns the inward case red. And the walk took
only `.ts`, so a `.mts`, `.cts` or `.tsx` module would have been skipped entirely -- no cases, no
ledger ids, free to cross a layer. All four extensions are discovered, and a file under `src/` the
walk does not recognise is now itself a failure rather than a silent skip. `src/cadenza/` was
excluded by name at this point, because the Python half lives under `src/` too until D-0014 retires
it -- an exclusion the tenth round showed was drawn one level too wide.

**A seventh round returned one P1, and it was against that paragraph's own claim.**
`process.getBuiltinModule("module").createRequire(import.meta.url)("interlock")` still worked in
`src/adapters` and in the barrel, because the `process` rule had been written for the pure layers
only -- while the text above said the route was closed. The rule now applies in every layer, and
`LOADER_ROUTE_GLOBALS` states the complete set in one place: `eval` and `Function` build code from a
string; `globalThis` and `global` reach those as properties, where a name-based sweep sees somebody
else's property; and `process` is admitted for named members and refused otherwise.

Making it uniform immediately found the layer that legitimately needs more: `src/adapters` is the
layer permitted I/O, and its `os.path.abspath` port consults `process.cwd()`. So the allowance is
per-layer -- `env` and `platform` everywhere, `cwd` in the adapters and nowhere else -- which is the
same shape every other rule in this file converged on, arrived at from the opposite direction.

With the per-layer import allowlist beside it, the set is now closed rather than enumerated: a module
reaches another by importing it (approved per layer), by building code from a string, by taking a
builtin off `process`, or by reaching any of those through the global object. `import.meta.resolve`
produces a URL and still needs an `import()`, which fails closed as `<computed>`.

**An eighth round found the last loader route, and a false positive the earlier ones had hidden.**
`require` and `module` are loaders in their own right and both survive an alias: `const load =
require; load("interlock")` leaves no call with a callee named `require`, and
`module.require("interlock")` leaves none either. Both are refused as references now -- the same
answer `scripts/parity-check.mjs` gives an aliased test runner, for the same reason, that an alias is
what makes an enumeration uncountable.

The other three were about reading the tree correctly rather than about boundaries:

- **`.tsx` is a different grammar, not TypeScript with extra tokens.** Parsed as `ScriptKind.TS` it
  is wrong in both directions -- a dynamic import inside JSX is not exposed, and JSX text can be read
  as code that is not there. Every `createSourceFile` here now asks `scriptKindOf`. Measured: a
  `.tsx` module with `import("interlock")` inside JSX is invisible before the fix and red after.
- **`.d.ts` ends with `.ts`**, so a declaration file was discovered as an ordinary module, and
  `stemOf("interlock.d.ts")` gave `interlock.d` -- meaning a declaration counterpart of the reserved
  seam would have walked past the case guarding it. Declarations are matched first and reported as
  unrecognised.
- **A false positive, and the only one in eight rounds.** `import { fetch as loadRecord } from
  "./record.js"` visits `fetch` as the specifier's *property* name while `parent.name` is
  `loadRecord`, so `isShadowedOrDeclared` did not exclude it and an ordinary relative import was
  reported as global network I/O. Worth recording next to the rest: every other finding was a check
  that admitted too much, and a rule tightened seven times running is exactly where the opposite
  error hides.

**A note the belt earned the hard way.** Writing a `reference types=` directive out in full inside a
comment made knip report the repository as depending on interlock: a tool scanning text rather than
syntax read the comment as the directive it describes. That is the same confusion
`scripts/parity-check.mjs` records about its own sweep, met from the other side, in the file arguing
for syntax trees.

**A ninth round found `Object.constructor("return import(...)")()`** -- the `Function` constructor
reached from any value at all, naming neither `Function` nor a global. `constructor` is refused as a
property name now, in both the dotted and the bracketed spelling, and bracketed access to any loader
global goes with it.

**A tenth round found three P1s, all of one shape: a branch that stopped asking.** None is a new
loader spelling -- the ninth round was the last of those -- and all three are places where a rule
returned "nothing to say" about a region it was responsible for.

13. **The walk skipped `src/cadenza/` whole, and it was the one place nothing looked.** `tsconfig.json`
    type-checks every TypeScript file under `src/`, so `src/cadenza/domain/runtime.ts` would have been
    compiled and free to import anything, while `tests/test_import_boundaries.py` walks `*.py` and
    would not have seen it either. Excluding a *directory* was the error; excluding the *Python files*
    is the rule that was meant. The walk descends now, ignores `.py`, `.pyc`, `.pyi` and `.pyo` under
    that directory alone, and reports anything else there as unrecognised. Measured: an empty
    `src/cadenza/domain/runtime.ts` turns the walk's own case red and nothing else. The eleventh
    round narrowed the ignore list further -- see below.
14. **A module augmentation reached a module and was not recorded.** `declare module
    "../application/compose.js" { ... }` inside an external module is not a namespace declaration:
    the compiler resolves that specifier exactly as an import does and merges the declarations into
    the module it names. So it is a real dependency, and it was the one spelling of one that
    `importsIn` never read -- while `import type` from the same file, saying less, was refused.
    String-named module declarations are recorded as `*` now. Measured: the augmentation above,
    placed in `src/domain/digest.ts`, turns the inward case red.
15. **Being in no layer exempted the barrel from the inward check entirely.** The case confirmed the
    module was allowed to be unlayered and then returned, so every relative import `src/index.ts`
    writes went unread -- and nothing else read them, because `unapprovedExternalsIn` considers bare
    specifiers only, by design, on the grounds that relative ones are this case's question. `export
    { absolute } from "../test/support.js"` therefore reached out of the package past both checks.
    The `UNLAYERED_MODULES` assertion stays and the case no longer returns: an unlayered module is
    checked against `ALLOWED_FOR_UNLAYERED`, the four layer roots, which is the barrel's job and
    nothing more. Measured: that re-export turns `src/index.ts`'s case red.

Three P2s went with them. `localStorage`, `sessionStorage` and `indexedDB` join `FORBIDDEN_GLOBALS`
for the reason `fetch` is there -- the list says what a pure layer may not reach, not what today's
runtime happens to offer it. `tsconfig.json` now includes `src` as a directory and `knip.json`
matches all four module extensions, closing the gap the eighth round opened: the walk accepted
`.mts`, `.cts` and `.tsx`, and a glob for `.ts` alone would have type-checked none of them. And
`isShadowedOrDeclared` was extended to class members and enum members -- `class Layer { module =
"domain"; }` was reported as a loader route for the word it names its own field with, the second
false positive in ten rounds and, like the first, produced by a rule tightened repeatedly.

**An eleventh round returned one P1, against the fix above rather than against a new route.** The
ignore list item 13 introduced covered `.pyi` and `.pyo` as well, and `.pyi` is a *source* file with
imports in it: `tests/test_import_boundaries.py` walks `rglob("*.py")` and does not match a stub
either, so `src/cadenza/domain/stub.pyi` importing interlock would have been read by neither scan --
the identical hole, one extension smaller, recreated by the line that closed it. The list is now
exactly what the Python scan does read: `.py`, and the `.pyc` compiled from one. `.pyo` went with
`.pyi` because Python 3 does not produce one, so ignoring it swallows a file nobody can account for
and buys nothing. Measured: a `.pyi` under `src/cadenza/` turns the walk's own case red and nothing
else, and the Python suite stays at 330.

That is the shape worth naming, because it is the second time it has happened: an *exclusion* is a
claim about what something else is already checking, and it is wrong exactly when that claim is
untrue. Item 13 was the directory version of it and this is the extension version. The rule the file
now follows is to exclude by pointing at the scan that covers the exclusion, rather than by naming a
category that sounds adjacent.

**A twelfth round returned one P1 and two P2s, and none of the three is fixed here. The rounds
stop at this one.** The P1 is `const { constructor: F } = () => {};` followed by
`F('return import("interlock")')()` -- the `Function` constructor destructured out, which is a
`BindingElement` and matches neither of the two spellings the ninth round closed. That is the
category the sixth round named, arriving for the fifth time, and the reason to stop rather than to
write a third `constructor` branch: destructuring is a third syntax for the same read, a parameter
default is a fourth, and any function that returns the value is a fifth. Closing them one at a time
is the losing game this entry already described, and the paragraph below is where the file says so
in advance -- an evasion has to be written deliberately, in a shape a reviewer sees, and
`const { constructor: F }` is written deliberately and visible on the line. So the finding lands
outside the guarantee that was declared rather than against it, which is what makes stopping here a
boundary rather than a shrug.

The two P2s are recorded with it, and both are the opposite of the P1 -- a rule being wrong about
ordinary code rather than admitting clever code:

16. **The global sweep suppresses the wrong half of an export alias.** `export { local as fetch }`
    names an export and reads no global, but `isShadowedOrDeclared` suppresses an `ExportSpecifier`'s
    `propertyName` and reports its `name`. It is the exact mirror of the import-alias false positive
    the eighth round fixed -- the two specifier kinds carry the exported name in opposite halves and
    share one branch -- and the third false positive in twelve rounds, all three produced by the
    same rule being tightened repeatedly. Nothing under `src/` exports such a name, so the suite is
    green.
17. **The anchor sweep does not peel a non-null assertion.** `baseDir: "/srv"!` wraps the literal in
    a `NonNullExpression`, which is the same family as the parentheses, `as` and `satisfies` the
    seventh round taught it to peel and was missed when that list was written. The consequence is the
    failure the case exists to prevent: the anchor is drive-relative on Windows, so it would be
    reported by the windows-latest cells instead of by the guard.

All three are recorded in the ledger's `inherited_limitations`, which is where this file keeps what
it knows it does not catch, and are left to a follow-up. The two P2s are one-line fixes and are
deferred for the reason the P1 is: each changes which nodes a sweep reports, and a rule tightened
across twelve rounds wants its own planted case rather than a line appended at the end of a belt.

**Why the rounds stop here rather than at a clean round.** Two clean rounds would not mean more than
one: the last five findings against the loader sweep were members of a class the language keeps
generating, so review converges on the *stated boundary* rather than on zero findings. Round twelve
is where a finding first landed outside that boundary instead of inside it, which is the signal the
paragraph below was written to be read against.

**Where this stops, and what the check does not claim.** It is not a sandbox and cannot become one.
A static scan of JavaScript cannot prove a module loads nothing, because the language computes at
runtime what this file has to decide by reading, and four rounds running found one more value that
could be made to yield a loader. The claim that *is* made, and that the eleven rounds
support, is narrower: every route by which a module loads something **without looking like it** is
refused, so an evasion has to be written on purpose and in a shape a reviewer can see. Accidents are
stopped outright; determination is made loud. That is also what
`tests/test_import_boundaries.py` achieves — it simply had fewer chances to be wrong, because Python
offers fewer ways to reach a module without naming it.

Six limitations are recorded open in the ledger. Two need binding resolution and are shared with the
Python source; one is this paragraph's, a property of the language rather than of the check; and
three came from the twelfth round -- the destructured `Function` constructor, which is a member of
this same class, and two rules that are wrong about ordinary code rather than lenient about clever
code. The bar applied is the one that matters for a gate: no P1, and every *route* a reviewer named
either closed or recorded.

No finding ever recurred once closed, and no fix was reverted. What recurred was a *category*, four
times, which is what a per-spelling denylist guarantees and what the inversion above ended. Every fix
was reviewed by the round after it.

**What would falsify it.** A way to make a lint suppression countable and reviewable the way
`approved_non_running` is, which would remove reason 1; or a Biome rule that could be addressed by a
ledger entry, which would remove reason 3. Reason 2 would go if the other seven claims found a
natural home elsewhere, which would mean section 8's boundary had stopped being one subject.

---

## D-0023 — interlock is a frozen source, not a decision-maker: cadenza's open questions are settled at cadenza's own human gate

**Status:** accepted

**Context.** Several documents in this repository described interlock as an active party with
something still to decide. `README.md` held G2 as "blocked on interlock settling its own contract";
`docs/design/g1-project-registry.md` section 9 and `docs/repository-policy.md` section 5 said
cadenza does not depend on interlock "yet", with the reason resting on a state of interlock's that
was implied to be temporary; D-0014 recorded "interlock#74 landing" as "the stated precondition for
unfreezing G2", and cadenza#9 restated the same shape.

None of those conditions can be met. Interlock is the frozen source this successor stack is ported
from: its last commit is 2026-08-21 (UTC), its own delegation-contract question — interlock's open
issue #63, "Operating-layer delegation contract", opened 2026-08-21 — was recorded and left
unanswered, and interlock#74 is the kickoff for porting it away, not a contract that will be settled
there. (Issue numbers in interlock's *git history* are not interlock's: commits inherited from
`claude-org-runtime`, which interlock forked at `befd309`, carry that repository's numbering, so a
`Closes #63` dated before the fork is a different issue entirely. Cite interlock issues by title as
well as by number.) A condition that cannot occur is not a condition; it is an unbounded
wait wearing one. The test applied across the sweep was: **could a reader — human or agent — take
this sentence at face value and conclude that waiting is the correct behaviour?** Where the answer
was yes, the sentence was wrong, not merely imprecise. Continuo reached the same conclusion about
the same upstream on the same date (continuo D-0036), from its own evidence.

**Decision.** interlock is the **frozen source** of this stack. It supplies design lineage, prior
reasoning, the questions that were asked, and — for continuo — test cases. It supplies **no
decisions and no answers to cadenza**. Concretely:

1. **No cadenza status, gate or document is "blocked upstream", "pending upstream", or held until
   interlock settles anything.** There is no upstream process left to be pending on. Where such a
   phrase appears it is rewritten, not annotated.
2. **An interlock issue number cited here names a question interlock left unanswered, or a record of
   what was decided there before the freeze.** The citation stays — it is the record of what was
   asked and where it came from — but its status is *unanswered*, never *open pending upstream*, and
   never a precondition.
3. **If cadenza needs one of those questions answered, cadenza answers it**, at this repository's
   human gate, as a `D-` entry, on cadenza's own terms. Declining to answer stays legitimate: this
   entry does not force G2's unfreeze condition, or the shape of the delegation contract, to be
   settled now. What it forbids is recording the decline as *waiting*.
4. **The human gate on this repository is the only decision-making body over cadenza.** "Undecided"
   means undecided *here*.

**Consequences.**

- `README.md`'s "explicitly not here yet" list no longer holds G2 behind an interlock-side contract
  question. The question itself is kept in full — what a delegated run may do, on whose authority,
  and how that is expressed at the seam to a control plane — together with the interlock#63
  citation, marked unanswered. The interlock dependency bullet states the reason as a settled fact
  about a frozen repository rather than as a temporary condition.
- `docs/design/g1-project-registry.md` section 9 and `docs/repository-policy.md` section 5 drop
  "yet" and say that whether cadenza takes a control-plane dependency is decided here. Section 9's
  bare `(D-0026)` is also corrected to `(interlock D-0026)`, which is what this file's own citation
  rule requires.
- **D-0014 is superseded by this entry, and its body is not rewritten** — the ID keeps its text, per
  this file's rule, and gains `Status: superseded by D-0023`. What D-0014 decided is restated here
  without the upstream precondition, so a reader who lands on D-0014 alone is sent to a live entry
  rather than left with the old framing: **the TypeScript port does not touch G2 and does not open
  the interlock seam.** `src/cadenza/adapters/interlock/` stays empty on the Python side and has no
  TypeScript counterpart, and the Python implementation is retired by its own later PR, not by the
  PR that introduced the port — removing it earlier would delete the oracle's Python half (D-0011)
  in the same diff that first relies on it. G2 stays frozen because nobody has decided to start it,
  and a port is not the change that starts it. What is dropped is D-0014's claim that G2 is "frozen
  at cadenza#9 pending interlock#74's TypeScript migration" and that interlock#74 landing is "the
  stated precondition for unfreezing G2"; there is no such precondition.
- Nothing about the port changes. G2 stays frozen and the seam stays empty on this change; what
  changes is who is understood to hold the condition for lifting either.

**The unfreeze condition for G2 is not chosen by this entry.** It records the candidates so the next
reader argues about the choice rather than rediscovering that the old condition was unreachable.
Three, none adopted:

1. **Gate on G1's TypeScript port.** G2 opens when the port is complete and `src/cadenza/` is
   retired (D-0014's second half). Concrete, already tracked, and close: as of this entry the belts
   have reached 330 of 330 collected node ids. It says nothing about whether the delegation contract
   is *ready to be designed*, only that the language question is behind us.
2. **Gate on a design decision taken here.** G2 opens when a `D-` entry in this file fixes what a
   delegation contract must express — the authority model, the seam to a control plane, and what a
   run may do without asking. This is the condition that matches the actual reason G2 was deferred
   (designing against an undefined seam), with the difference that the definition is cadenza's to
   write rather than someone else's to supply.
3. **Lift the freeze and gate the work instead.** G2 stops being frozen; work on it is admitted the
   way any other work is, behind the human gate and the review policy, with cadenza#9 closed and
   replaced by an ordinary design issue. This treats the freeze as having been a stand-in for "no
   one has decided to start", which is what it now is once the upstream condition is removed.

They are not exclusive: 1 and 2 compose as a conjunction, and 3 is what remains if neither is judged
worth stating. The choice is a human-gate decision and is expected to be taken against the
successor-stack sequencing work running in parallel; whichever is taken should be a new `D-` entry
that names this one.

**Where the candidates are recorded, and why here rather than in `README.md`.** `README.md` states
what is true of the repository now; a list of options nobody has chosen is not that, and would
either rot or read as a plan. This file is the place that already carries undecided reasoning with a
falsifier attached, and the one a later `D-` entry can supersede by ID.

**Rejected alternative: leave the text and correct the reading in a convention.** Rejected because
the failure mode is a reader forming a false belief from the document in front of them; every new
agent starts from the text, and a convention held elsewhere is not in that path.

**Rejected alternative: delete the interlock citations.** Rejected because they carry real
information — what was asked, and why it went unanswered. Deleting them trades one wrong reading
("someone will answer this") for another ("nobody ever noticed this").

**What would falsify it.** interlock being un-frozen with someone answering its open questions,
which would restore the premise and make this entry worth revisiting. Short of that: a reader found
treating a cadenza freeze or an empty seam as an external blocker despite this sweep, which would
mean the rewrite did not reach the text they read — the answer then is to find that text, not to
restate the rule.

**Source.** Task `cadenza-upstream-authority-sweep`, 2026-08-30, and the owner's instruction that
the text producing the misreading is what has to go. Continuo's D-0036 is the same decision taken
about the same upstream, in its own numbering space.

## D-0024 — the syntax tree comes from the compiler, through one module, and the parse is asserted against its own input

**Status:** accepted

**Context.** Two checks in this repository read TypeScript rather than running it:
`scripts/parity-check.mjs` counts non-running test constructs, and
`test/architecture/import-boundaries.test.ts` walks the module graph. Both are written against a
syntax tree on purpose (D-0022, and the header of the parity sweep): comments and string literals
are not nodes, so prose about `test.skip` cannot be miscounted, and an import hidden in a function
body is still an import. Both obtained that tree by calling `ts.createSourceFile` on text they had
read themselves.

TypeScript 7 removes it. The compiler is a Go program now; the `typescript` package's main export is
`{ version, versionMajorMinor }` and nothing else. The tree is still reachable, but only as data the
compiler sends back — decoded by `typescript/unstable/ast`, requested through
`typescript/unstable/sync`. Parsing stopped being a pure function over a string and became a
question put to a running program.

The break was worse than the pull request's red suggested. The visible failure was one step, `npm
run parity`, because the branch predated the import-boundary belt; once `main` merged in, the type
check failed with 89 errors and 61 of the 99 boundary cases failed with it. Nothing in `src/` needed
changing: under TypeScript 7 this repository's own code type-checks unaltered, and the whole of the
breakage was in the two files that read the compiler's API. Continuo took the same bump green
because it never consumed that API.

**Decision.** The plumbing lives in `scripts/lib/ts-ast.mjs` and nowhere else, and it keeps the old
signature: `parseSourceFile(fileName, source)` parses **the text it is given**, as though that text
lived at that path. It does so by mounting the text in a virtual filesystem — one file plus a
`tsconfig.json` with `noLib` and `noResolve` — and asking the compiler about that. No disk is
touched, and one compiler process is shared for the life of the host and shut down explicitly.

**Why the text and not the file on disk.** Asking the compiler for the file at a path reads better
and is wrong here: the boundary sweep's detector cases parse hand-written snippets attributed to
`src/domain/probe.ts`, a module that has never existed. Those cases are how the detector is tested,
so a parse that could only see real files would have silently cost the sweep its own test.

**Why the parse is asserted against its input.** `parseSourceFile` compares `tree.text` to the
source it was handed and throws when they differ. This is not defensiveness in the abstract; it is
the trap this change actually fell into. Invalidating the compiler's copy takes
`fileChanges: { changed: [...] }`, and the near-miss spelling — `changedFiles`, which the neighbouring
`ProjectFileChanges` type does use — is accepted, returns a fresh snapshot, and hands back the
**previous** file's tree. Under it, both sweeps examine their first input a few dozen times and
report nothing wrong with any of the others. Every symptom of that bug is a green run, so the
guarantee has to be checked rather than reasoned about.

**Rejected alternative: stay on TypeScript 5.8.3.** It works and costs nothing today, and it means
the repository's two static checks pin the compiler for the whole tree. The removal is not a
deprecation to wait out; the JavaScript compiler is gone in 7.

**Rejected alternative: one copy of the plumbing in each caller.** Rejected because the lifecycle —
spawn, mount, invalidate, shut down — is exactly where the silent failure above lives, and a second
copy is a second chance to get the invalidation wrong in a way that looks green.

**What this accepts.** `typescript/unstable/*` is named unstable and may change shape within
TypeScript 7. The exposure is one module of about forty lines; a rename lands there and nowhere
else, and the assertion above means a semantic change surfaces as a red gate rather than as a sweep
that stops finding things.

**What would falsify it.** A TypeScript release restoring a supported standalone parse, which would
make the virtual-filesystem mount unnecessary machinery. Short of that: `parseSourceFile` throwing
its stale-tree error, which would mean the invalidation contract moved and the sweeps must not be
trusted until it is answered.

**Source.** Task `cadenza-ts7-compat`, 2026-08-30, superseding the bump in cadenza#12.

---

## D-0025 — G2's unfreeze condition is D-0023's candidate 2: it opens on a design decision taken here, not on the port or on lifting the freeze

**Status:** accepted (2026-08-31, taken at cadenza's human gate)

**Context.** D-0023 removed G2's original unfreeze condition — interlock settling its own
delegation-contract question — as unreachable, and recorded three candidate replacements without
adopting any: (1) gate on G1's TypeScript port completing and `src/cadenza/` being retired, (2) gate
on a `D-` entry taken here that fixes what the delegation contract must express, (3) lift the freeze
and treat G2 as ordinary work. cadenza#9 restated the same three and left the choice open. This entry
is the choice.

**Decision.** Candidate 2 is adopted. G2 opens when a `D-` entry in this file fixes what the
delegation contract must express: the authority model, the seam to a control plane, and what a run
may do without asking — the three things D-0023 names. Until such an entry exists, G2 stays not
started against cadenza#9. This entry does not write that `D-` entry; it only sets the condition
under which one would open G2.

**Why candidate 2, and not 1 or 3.**

- **The freeze's original rationale is gone, and nothing replaces it with a wait.** D-0023 already
  established that interlock cannot answer this question: it is frozen, it recorded the same
  question as its own open issue #63, and left it unanswered. There is no "wait for interlock" left
  to fall back on, which is why this choice has to be made here rather than deferred again.
- **Candidate 1 chains one undecided question onto another.** G1's TypeScript port is done — 330 of
  330 collected node ids, per D-0022's index entry — but the Python implementation's retirement
  (cadenza#25) carries its own open question: retiring `src/cadenza/` turns the `config_digest`
  differential oracle's committed vectors (D-0011, D-0017) from something regenerable on demand into
  a historical record, and whether that is acceptable is not settled. Whether G2 can be *designed*
  does not depend on whether a Python implementation still exists beside the TypeScript one, so
  tying G2's gate to Python's retirement would make G2 wait on an unrelated unresolved question for
  no reason connected to what G2 actually needs.
- **Candidate 3 is coherent but carries the highest risk of an invented contract.** Lifting the
  freeze and treating G2 as ordinary work is a legitimate reading of "no one has decided to start"
  (D-0023's own framing), but G2 has no design at all — no authority model, no control-plane seam, no
  stated boundary on what a run may do unattended. Admitting it as ordinary work risks whoever picks
  it up inventing the delegation contract as they implement it, rather than the contract being fixed
  first and reviewed as a document. The `needs-decision` label on cadenza#9 reduces that risk by
  flagging the marker, but does not remove it.
- **Candidate 2 is a design-before-implementation gate that chains to nothing else.** It replaces an
  unbounded wait with a condition this repository can meet on its own schedule, and it does not make
  G2 depend on any other open question's resolution.

**Consequences.**

- cadenza#9's body is updated: the two open-decision items this entry resolves (which candidate, and
  who/when) are replaced with a reference to this entry, and the remaining condition — a `D-` entry
  fixing what the delegation contract must express — is restated as the issue's acceptance criterion.
- `README.md`'s G2 bullet, which pointed to D-0023's unresolved candidate list, is updated to name
  this entry as the one that made the choice.
- **This entry does not design the delegation contract.** The authority model, the control-plane seam,
  and the bound on what a run may do without asking remain unwritten; a future `D-` entry naming this
  one is what writes them and what actually opens G2.

**What would falsify it.** A `D-` entry existing in this file that fixes what the delegation contract
must express, with G2 still unable to open — that would mean this condition was met and something
else is nonetheless blocking it, which would make this choice of gate wrong rather than merely
unmet.

**Source.** Human gate decision, 2026-08-31, cadenza#9.

---

## D-0026 — what the delegation contract must express: an enumerated grant, a seam that is a document rather than an API, and a total three-valued bound on unattended action

**Status:** accepted (2026-08-31, taken at cadenza's human gate)

**This is the entry D-0025 set as G2's unfreeze condition, and it opens G2.** D-0025 adopted
D-0023's candidate 2: G2 opens when a `D-` entry here fixes what the delegation contract must
express — the authority model, the seam to a control plane, and what a run may do without asking.
The three sections below fix those three, and each names what it deliberately leaves open. The full
argument, with the options weighed and the rejected alternatives, is
`docs/design/g2-delegation-contract-proposal.md`; this entry is the decision, and where the two
disagree this entry is what was decided.

**What this entry is not.** It is not an implementation, and it does not describe one. There is no
capability vocabulary, no module and no type here. The belt that writes those comes after this
entry, against it.

### 1. The authority model: an enumerated grant

**Decision.** A delegated run's authority is a **closed, enumerated grant** carried by the contract
that authorised it. Roles are not the model.

- **Authority is exactly the grant.** Nothing is authority by default, by role name, by convention,
  by what a neighbouring run was allowed, or by the run's own reading of its task. Absent means not
  granted.
- **Grants are closed.** An unrecognised capability key refuses the whole contract, naming the key
  — G1 §5.6's rule extended to G2, for its reason: a typo that falls back to a default is the
  failure this layer exists to prevent.
- **A capability key's meaning is permanent.** A key is never redefined, broadened, or reused for
  something else; a wider power is a new key. The contract pins the vocabulary version it was
  written against and refuses a version this build does not know, as G1 §5.2 does for
  `schema_version`. Without this, a later release could widen every contract already issued at an
  unchanged digest.
- **No amplification.** A run cannot widen its own grant, and anything it delegates onward carries a
  subset. Widening happens only by a new contract from the granter (§3).
- **The subject is pinned.** The contract names its project by `project_id` — never an alias — and
  pins the `config_digest` (G1 §4) it was issued against. A catalog that has moved on makes the
  contract **stale**; stale is invalid (§3).
- **A contract is not a bearer token.** It names its **grantee**, the run identity it was issued
  for, and that binding is part of its semantics and so of its digest. Presented on behalf of any
  other run it classifies as `refused`. Run identity is the control plane's to mint (§2), so the
  control plane reserves the run and the granter then issues against it.
- **The issuer is carried, and authentication is not authorisation.** A contract without an issuer
  identity is refused. Cadenza asserts nothing about who the issuer really was — that is the control
  plane's at the edge — but the control plane must establish that the issuer may grant *this*
  authority over *this* project. Two rules are cadenza's own: a contract whose issuer is its own
  grantee is refused, and a granter passes on only what it holds.
- **A contract is a frozen value with a digest.** Immutable once issued (D-0015), carrying a
  `contract_digest` over its semantics computed the way `config_digest` is (G1 §4; D-0011, D-0017
  for the technique and its oracle), so two parties can prove they mean the same contract.

**Why not roles.** A role name in a durable record means whatever the role table meant *at the time*:
change the table and the meaning of every past record changes with it. That is the alias failure
G1 §2 already rejects — `project_id` is immutable and durable, aliases are display-only — and it is
the drift interlock recorded from the other side in its unanswered issue #63 ("prose↔practice
drift", the hardcoded permission-mode mirrors). A role is an alias for an authority. Roles stay
admissible later strictly as a **rendering**: a role expands to a grant before the contract exists,
the contract stores the expansion, and the role name survives only as provenance (G1 §5.7).

**Why not a predicate policy** evaluated at action time. It is the most expressive and the least
reconstructable: if the decision depends on state the granter could not see, what was authorised
cannot be recovered from the record — and it puts an evaluator, with the I/O and clock an evaluator
needs, inside a layer G1 keeps pure.

**Deliberately not fixed.** The capability vocabulary itself; whether role presets ever exist as the
rendering above; how issuer or grantee identity is authenticated, and whether contracts are signed;
whether an unbound template may be authored before a run is reserved; **expiry, and revocation with
no successor to issue** — supersession (§3) is the supported way authority is replaced or taken
back, and what is left open is the case with no successor and the case of a contract lapsing with
time, which would need a signal that is not a contract and a clock cadenza does not have.

### 2. The seam to a control plane: a document and its digest, not an API

**Decision.** Cadenza produces and validates delegation contracts and classifications as **values**.
The control plane transports, stores and enforces them.

- **The dependency points inward.** A control plane may depend on cadenza; cadenza takes no
  dependency on one — no import, no requirement, no extra. This is the existing rule and its
  existing scope: what is prohibited is the import and the direction (G1 §8,
  `tests/test_import_boundaries.py`, D-0022's TypeScript counterpart), not the mention. Naming a
  control plane in prose, or reserving an empty adapter directory for one, is not a dependency.
- **What cadenza cannot compute purely is an input.** Run identity, session identity, wall-clock
  time, randomness, durability and retry are supplied by the caller. Cadenza never mints a run id
  and never reads a clock — which is what makes a contract reproducible from its inputs, and its
  digest worth having.
- **The contract is the authority; the control plane is the enforcer.** Cadenza classifies an
  *intended* action against a contract and returns the classification. It does not stop anything,
  and a system that consults it and then ignores the answer is not defended against here.
- **`adapters/interlock/` stays empty.** G2 does not open the interlock seam. Whether a delegated
  run ever reaches interlock specifically is a separate decision, taken here when someone needs the
  answer (D-0023), and this entry is not it.

**Why not an outbound port** that a control plane implements. It reads naturally if cadenza is
pictured as the orchestrator, and it requires cadenza to hold a lifecycle, a clock and I/O — and
every port shape would be a guess about a control plane this repository has explicitly not chosen.
The empty seam exists so the first real integration is a new file in an agreed place, not a set of
interfaces designed against a repository nobody has committed to. **Why not a shared durable
schema:** G1 §9 refuses it already — interlock's control-plane API and SQLite schema are marked
throwaway on interlock's own side (interlock D-0026, a different numbering space) and interlock is
frozen, so sharing rows converts a spike into a dependency by inertia.

**Deliberately not fixed.** Serialisation at the edge (TOML, JSON, or a row in someone's table); the
event or journal schema, and whether cadenza has any say in it; whether the control plane is ever
interlock; gate management (G3) — a gate outcome is an input to a classification, and what gates are
is not settled here.

### 3. What a run may do without asking: three values, and the classification is total

**Decision.** Every intended action classifies as exactly one of `allowed`, `needs_approval`,
`refused`.

- **The classification is total.** There is no fourth state, and no rule anywhere turns "not
  classified" into "allowed".
- **The boundary is the contract's, not the run's.** A run does not judge when to ask; it asks
  exactly when the classification says `needs_approval`. A run that proceeded because it judged the
  action harmless acted outside its contract, and the outcome being fine does not change that.
- **Silence is not consent.** An unanswered `needs_approval` is not a proceed. The run stalls or
  ends; no timeout, backoff or retry converts asking into permission.
- **An approval is a superseding contract, not a widening of the running one.** A contract is never
  mutated in flight (D-0015). Immutability alone does not make "under which contract did it do
  that" answerable — a twice-granted run holds two contracts that may both authorise the same later
  action — so three things go with it: the successor names the `contract_digest` it replaces, at
  most one contract is current for a run at a time, and every classification carries the
  `contract_digest` it was made under. A successor is not required to widen: narrowing, and
  narrowing to nothing, is how authority is taken back while revocation is otherwise deferred (§1).
- **Asking is itself bounded.** The contract declares what is **askable** alongside what is granted,
  and **the two sets are disjoint** — a contract listing the same capability in both is refused at
  issue time, since an overlap is the one shape that would leave an action classifiable two ways.
  Refusing beats inventing a precedence at classification time, as G1 §5.4 refuses a colliding
  namespace rather than resolving it by order. Anything in neither set is `refused` outright and is
  not escalatable, so a run cannot escalate its way toward arbitrary authority.
- **A stale contract is invalid, and classifying against an invalid contract is `refused`.**
  Staleness (§1) is checked before the grant is consulted at all, so totality holds without an
  implementation inventing whether staleness refuses or asks. Refusing rather than asking is what
  this repository already does when a record no longer matches what it was written against (G1 §5.2,
  an unknown `schema_version`); what happens next is the granter's move, not the classifier's.

**Why not a binary bound** — inside the grant act, outside it refuse, nothing askable. It is the
most auditable shape and the least survivable one: every real delegation meets a case that is
neither clearly granted nor clearly forbidden, and if the only escape is reissuing by hand, the
practice becomes issuing a very wide grant up front. Its simplicity converts into over-grant under
pressure. **Why budgets are not here:** counters, review-round limits and elapsed-time bounds are a
refinement on top of this shape rather than a third shape, and they need state and a clock, which
by §2 are not cadenza's. They remain available later.

**Deliberately not fixed.** Budgets; who approves (human, automated, or a quorum — the rules above
hold whichever it is); escalation transport and timeout values, of which only the meaning is fixed:
never yes; the action vocabulary being classified.

**What would falsify it.**

- **Against §1.** A run whose correct authority genuinely cannot be enumerated at issue time because
  it depends on state only visible mid-run — that would mean the predicate policy was the right
  shape and an enumerated grant is a lie told at issue time.
- **Against §2.** A contract that cannot be produced without cadenza reading a clock, minting an
  identity, or calling a control plane — that would mean the seam is an API after all and the
  outbound port was needed.
- **Against §3's totality.** An action genuinely required by ordinary work that is expressible
  neither as a grant entry nor as an askable escalation, so the classification forces either a
  refusal that blocks the work or a grant so wide it stops being a bound.
- **Against §3's supersession.** Approvals answered in practice by editing the live contract because
  reissuing costs too much — that would mean either the rule is unworkable or the contract is too
  large a unit to be the thing reissued.
- **Against the gate.** This entry existing with G2 still unable to open, which is D-0025's own
  falsifier and would make its choice of gate wrong rather than merely unmet.

**Consequences.**

- **G2 is no longer frozen.** cadenza#9's acceptance criterion is met by this entry, and the marker
  closes. Work on G2 is admitted the way any other work is, against this entry: an implementation
  that contradicts a fixed point above is a defect in the implementation, and a question this entry
  names as not fixed is settled by the belt that needs it, as a new `D-` entry.
- `README.md`'s G2 bullet no longer says G2 is not designed and names this entry instead.
- `docs/design/g2-delegation-contract-proposal.md` stays in the tree as the argument behind this
  entry — the options weighed and the alternatives rejected — with its status pointing here. It is
  not a second contract: this entry is what was decided, and G2's own design document, when the
  implementing belt writes one, takes G1's document's role for G2 (D-0001).
- Nothing in the port changes, and no code is added by this entry.

**Source.** Human gate decision, 2026-08-31, cadenza#9, on the proposal produced by task
`cadenza-g2-delegation-design` and reviewed over four rounds. The six points the review added —
permanent capability meanings with a pinned vocabulary version, the grantee binding, issuer
authorisation, supersession lineage, the disjoint askable set, and stale-as-invalid — are in the
decision above rather than recorded as amendments, because none of them had a version that was
decided and then changed.

---

## D-0027 — the capability vocabulary: a two-segment key matched by equality, a cumulative version pinned per contract, and seven keys to start

**Status:** proposed (2026-09-04, cadenza#32). This entry is the human-gate item D-0026 §1 called
for when it left "the capability vocabulary itself" unfixed; it becomes `accepted` when the gate
takes it, and no `src/` change that depends on it lands before then (Issue #32, "What the belt has
to settle, and where").

**Context.** D-0026 §1 fixes that authority is a closed, enumerated grant over a capability
vocabulary, that an unrecognised key refuses the whole contract naming the key, that a key's meaning
is permanent, and that a contract pins the vocabulary version it was written against and refuses a
version this build does not know. It deliberately does not say what a key looks like, how the
version is pinned, or which keys exist. There is no grant without those three, so this entry fixes
them and nothing else. The implementation they feed is `docs/design/g2-delegation-contract.md`.

### 1. A key is two lowercase segments, and it is matched by equality

**Decision.** A capability key matches `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` and is at most 64
characters: exactly two segments, `<subject>.<action>`, separated by one dot. Recognition is
**exact string equality against the pinned version's key set**. No prefix match, no hierarchy, no
wildcard, and no code anywhere may treat the dot as a separator for matching purposes.

**Why exactly two segments.** One segment (`clone`) loses the subject and collides across
subjects as the set grows. Three or more invites reading the key as a path, and a path invites
`repo.*` — a wildcard is an open set, and D-0026 §1's whole point is that the grant is closed. Two
segments give a human scanning a grant the subject and the verb, and give the reader no tree to
generalise over.

**Why not the G1 identifier shape** (`^[a-z][a-z0-9_-]{0,63}$`). A capability key is not a name in
G1's flat namespace, and reusing that shape would say the two were the same kind of thing. The dot
is what keeps them visibly distinct in a record that carries both. Hyphens are excluded so there is
one word separator, not two spellings of the same key waiting to be typo'd apart.

### 2. The version is an integer, pinned per contract, and versions are cumulative

**Decision.**

- A contract carries `vocabulary_version`, a positive integer, and it is part of the contract's
  semantics and so of its `contract_digest`.
- This build knows a frozen set of versions. A contract pinning a version outside it is refused as
  a whole, naming the version and the versions this build knows — the treatment G1 §5.2 gives an
  unknown `schema_version`, which D-0026 §1 names as the precedent.
- Every key in a contract is recognised **against the version that contract pins**, never against
  the newest the build knows. A contract pinned at version 1 listing a key introduced in version 2
  is refused.
- Versions are **cumulative and append-only**: version `n+1` contains every key of version `n` with
  the same meaning, plus what it adds. A key is never removed and never narrowed. A key that turns
  out to be a mistake is superseded by a narrower *new* key and discouraged in documentation; it
  keeps meaning what it meant.

**Why per-contract and not per-build.** A grant read back a month later has to mean what it meant
when it was issued. If the key set were the build's, upgrading the build would re-read every stored
contract against a set it was not written against — the drift D-0026 §1 refuses in the sentence "a
later release could widen every contract already issued at an unchanged digest", arriving through
the vocabulary instead of through a redefinition.

**Why cumulative.** It makes "the set this contract's keys are read against" a lookup rather than a
reconstruction, and it makes moving a contract to a newer version a widening of *vocabulary* only,
never of authority: the keys already listed keep meaning what they meant, and the contract still
grants exactly what it enumerates.

### 3. Version 1's key set: seven keys, cut where this repository's own delegations are cut

**Decision.** Version 1 is exactly:

| key | what it covers |
| --- | --- |
| `repo.clone` | materialise the contract's pinned clone source (G1 §3.1) |
| `worktree.write` | create, modify or delete files in the run's own worktree |
| `command.run` | execute a command in the worktree whose effects no other key of the pinned version names (the residual, below) |
| `commit.create` | record a commit on the run's branch |
| `branch.push` | publish commits to a remote |
| `pull_request.create` | open a pull request |
| `delegation.issue` | issue a further delegation contract to a sub-run (D-0026 §1, attenuated) |

**Why these seven.** Issue #32 asks for "the smallest set that lets a real delegation be written,
not a taxonomy", so the set is cut where a real delegation this repository already writes is cut.
A worker brief in this organisation grants a run its worktree, its commands and its commits, and
withholds `branch.push` and `pull_request.create`, which go through a human-facing desk instead:
that is the boundary these keys have to be able to draw, and with these seven it is drawn by
enumeration rather than by prose. `delegation.issue` is present because D-0026 §1 fixes what onward
delegation may carry, and a run that cannot be told whether it may delegate at all leaves that rule
with nothing to bind.

**What is deliberately not in it.** Anything cadenza cannot yet be asked about: network access,
secret reading, issue and comment writing, merging, deploying. Each is a key someone adds in
version 2 the day a contract needs it, which costs one entry in a cumulative set and changes no
contract already issued.

**`command.run` is the residual, and that is part of its permanent meaning.** A command is a way of
causing an effect, not an effect, so "may run commands" would otherwise swallow every other key in
the table: pushing a branch and opening a pull request are both done by running a command, and a
grant of `command.run` alone would authorise exactly what withholding `branch.push` and
`pull_request.create` was meant to withhold. So the key is defined by subtraction from the start:
**`command.run` covers a command whose effects no other key of the pinned version names, and an
action carries every key its effects name.** A command that pushes a branch needs `command.run` —
for the running — *and* `branch.push` — for the effect — and a contract holding only the first
refuses it (`docs/design/g2-delegation-contract.md` §7.1, where the strictest key wins).

Two things follow, and both are deliberate. **Mapping a concrete action to its keys is the
caller's**, because cadenza never sees the command: D-0026 §2 puts everything cadenza cannot compute
purely on the caller, and this is one of those things. And **adding a key in a later version narrows
`command.run` without redefining it** — the residual shrinks as the vocabulary grows, by
construction, and every contract already issued keeps meaning what it meant, because a contract is
read against the version it pinned (section 2).

**The known coarseness that remains.** Within the residual, `command.run` does not distinguish
running a test suite from running anything else, and by section 2 it can never be narrowed by
redefinition. A delegation needing "may run the test suite, may not run arbitrary commands" is
written by adding a narrower key in a later version and leaving `command.run` out of the grant.
This is the cost of permanent meanings, accepted knowingly rather than discovered later.

**What would falsify it.**

- **Against section 1.** A delegation whose authority genuinely cannot be written as a flat set of
  two-segment keys because it needs a parameter — "may push, but only this branch", "may write, but
  only under this directory". That is scoping, not naming, and it would mean a key is not the unit
  of authority and the vocabulary needs a value beside the key.
- **Against section 2.** A key that must be narrowed after issue because leaving it broad is
  actively unsafe, with no workable path through adding a narrower key. That would mean permanence
  and growth are not compatible in the form fixed here.
- **Against section 3.** A real delegation that cannot be written at all with these seven plus
  additions — in particular one that needs `command.run` split rather than supplemented, which is
  the coarseness named above turning into a defect.
- **Against the residual rule.** Callers that cannot reliably name every key a concrete action's
  effects fall under, so that an under-named action is answered `allowed` on the part that was named
  while the withheld part happens anyway. That would mean the unit of authority has to be the
  observable effect at an enforcement point rather than a key the caller selects, and the residual is
  a convention the seam cannot carry.

**Consequences.**

- `docs/design/g2-delegation-contract.md` §3 implements this and adds nothing to it; where the two
  disagree, this entry is what was decided.
- The vocabulary lives in `src/domain/capability.ts` as frozen sets (D-0015), one per version, and
  the refusals it raises are named in that document's §5.
- No key here names a control plane, a provider or interlock, and none may: the vocabulary is
  provider-agnostic in the same sense G1 is (G1 §1).
