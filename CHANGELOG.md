# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The agent-type record (D-0031, with its value schema fixed by D-0034): a frozen,
  digested value carrying two D-0027 capability key sets, a `loopPolicy` the
  conductor reads, an `executorPolicy` cadenza carries and never interprets, and
  its own `agent_type_digest` over a canonical payload that excludes the digest
  itself. A renderer, `contractInputForAgentType`, maps one plus a
  `ResolvedProject` and two caller-supplied identities into the existing
  `DelegationContractInput`; `delegationContract()` remains the only constructor
  and the only enforcement boundary. Nothing enters `Project`,
  `ResolvedProject` or `config_digest`. The three vocabulary refusals G2 already
  had moved to `capability.ts` so both callers raise the same ones. The belt is
  value-only: no persisted schema, no `schema_version` and no migration, which
  stay owed by the store's owner.
- Artifact-delivery bridge (D-0035): `docs/artifact-delivery-bridge.md` is the
  supported way to depend on cadenza until it publishes - clone at a pinned
  commit sha, build, `npm pack`, commit the tarball and its sha256, and install
  that tarball with `--ignore-scripts`, with a portable Node digest check
  (`sha256sum` is on neither macOS nor Windows) and `npm ci` enforcing the
  committed lockfile on every run. The rebuilding variant is documented with its
  platform caveat. No lifecycle script is added, no `dist/` is committed, and
  nothing is published: the package stays `private: true` at `0.0.0`.
- `.gitattributes` holding every packed path to LF - `src/**`, `dist/**`,
  `README.md`, `LICENSE`, `package.json` - and `newLine: "lf"` in
  `tsconfig.build.json` (D-0035, row D9), so a rebuilt `npm pack` does not
  differ by line ending on a Windows checkout. Measured no-op on Linux: the
  emitted `dist/` and a fresh pack are byte-identical before and after.
- Library surface (cadenza#50, D-0033): the package declares `main`, `types`, an
  `exports` map over the single entry point `src/index.ts`, and a `files`
  allowlist; `npm run build` emits `dist/` with declarations and source maps from
  a new `tsconfig.build.json`, and a required `package` CI job runs `publint`
  and `attw` over the packed tarball. `tsconfig.json` keeps `noEmit` and stays
  the type-check configuration. Nothing is published - the package remains
  `private: true`.
- TypeScript rewrite bootstrap for G1 (cadenza#8): vitest with randomised
  ordering and a double-green CI gate, biome, knip, and a 3-OS x 2-Node matrix
  added alongside the existing Python jobs.
- `DECISIONS.md`, opening with D-0001: the design document is the port's primary
  oracle and the test suite the second - the reverse of continuo's order,
  because `docs/design/g1-project-registry.md` declares itself the contract.
- Parity ledger and source inventory (`parity/`), covering all 330 collected
  pytest node ids across the eight source test files, with `npm run parity` and
  `npm run inventory` enforcing them.
- A differential oracle for `config_digest`: the TypeScript encoding is compared
  byte for byte against CPython's over a fixed corpus, and CI re-runs the Python
  half to prove the committed vector is not a fossil.
- Pilot port of `tests/test_digest.py` (13 of 14 node ids; the composition case
  is deferred to the belt that ports `test_compose.py`).
- Composition belt (cadenza#8): `tests/test_compose.py`, `tests/test_resolve.py`
  and `tests/test_toml_loader.py` ported - 75 node ids, 74 mapped and 1
  not-portable - together with the TypeScript `composeCatalog`, `resolveProject`
  and TOML layer loader they exercise. The pilot's deferred digest case is
  ported with them, so `tests/test_digest.py` is now fully mapped.
- A second face for the differential oracle (D-0017): the `config_digest` a
  composed and resolved catalog produces is compared against CPython's over a
  fixed corpus of layer documents, covering the merge, tombstone and alias rules
  that feed the digest.
- Ports of the Python standard-library behaviour the implementation depends on
  (D-0018): `os.path`/`pathlib`, `urllib.parse.urlsplit`, `difflib` and
  `str.isspace`, each with its own contract test, checked against CPython 3.12.
- Clone-source belt (cadenza#8, D-0019): `tests/test_clone_source.py` ported -
  57 node ids, 42 mapped straight and 15 adapted, closing the coverage gap the
  composition belt left around `parseCloneSource`'s own validation.
- Identifier belt (cadenza#8): `tests/test_identifiers.py` ported - 25 node
  ids, all mapped - in `test/domain/identifiers.test.ts`, with
  `parity/identifiers.ledger.json` accounting for them. The two cross-language
  traps the kickoff named for this file were settled by running both
  implementations over a 3,169-value corpus and diffing the verdicts (D-0020):
  zero accept/refuse disagreements, the `\Z`-versus-`$` anchor and the
  `str.isspace()`-versus-`/\s/` refusal set each held open by a target-only
  case.
- Refs belt (cadenza#8): `tests/test_refs.py` ported - all 62 node ids mapped,
  none deferred. The git-parity case (D-0021) runs the real `git` binary via
  `node:child_process`, mirroring the source's own `subprocess` call against
  `git check-ref-format`, rather than a fixed corpus of pre-recorded answers.
- Import-boundaries belt (cadenza#8, D-0022), the last source file: design
  section 8's dependency direction is now enforced over the TypeScript module
  graph by `test/architecture/import-boundaries.test.ts`, which parses every
  module under `src/` with the TypeScript compiler API rather than importing it
  - so a re-export, a dynamic `import()` in a function body and a type-only
  import all count. `tests/test_import_boundaries.py`'s 97 node ids are
  re-pointed rather than transcribed: 64 adapted, 33 waived for the Python
  package initialisers that have no counterpart here. Biome's
  `noRestrictedImports` was measured first and can express the graph half; it
  was not chosen because one `biome-ignore` comment silently waives it and a
  diagnostic has no target id for a ledger to endorse. The sweep fails closed on
  a dynamic import whose specifier cannot be read statically, covers
  `src/application` as no-I/O because design section 8 says so even though the
  source test does not, and catches the global I/O Node hands out without an
  import (`fetch`, `console`, `process` beyond `env` and `platform`). With this,
  all 330 source node ids carry a ledger.
- G2's delegation contract is designed (D-0026), which is the entry D-0025 set
  as G2's unfreeze condition, so G2 is no longer frozen - the design is
  recorded, and no G2 code lands with it. Authority is a closed, enumerated
  grant bound to a `project_id`, a `config_digest` and the run it was issued
  for, with permanent capability meanings and no self-issue, rather than a role
  name whose table can be rewritten under past records. The seam to a control
  plane is a contract document and its digest instead of an API: cadenza
  classifies and the control plane enforces, run ids and clocks are inputs, and
  `adapters/interlock/` stays empty. And every intended action classifies as
  exactly one of allowed, needs-approval or refused, where an unclassified case
  never falls through to allowed, silence is never consent, what may be asked
  about is itself declared and disjoint from what is granted, and an approval is
  a superseding contract rather than a widening of the running one.
  `docs/design/g2-delegation-contract-proposal.md` records the options weighed
  and the alternatives rejected (cadenza#9).
- G2's design document, `docs/design/g2-delegation-contract.md` (cadenza#32):
  the contract the G2 implementation is written against, taking G1's document's
  role for G2 (D-0001). It cites D-0026 for every fixed point rather than
  restating it, and specifies what D-0026 left to the belt - the contract value
  and its issue-time refusals, the `contract_digest` payload, the total
  three-valued classifier and its order, and supersession and onward
  delegation. No `src/` code yet.
- D-0027, the capability vocabulary D-0026 section 1 left unfixed: a
  two-segment key matched by exact equality, a cumulative vocabulary version
  pinned per contract and refused when unknown, and an initial set of seven
  keys cut where this organisation's own worker delegations are cut.
- G2's contract as a value (cadenza#32), the belt's second step and its first
  `src/` code: `src/domain/capability.ts` carries the D-0027 vocabulary as
  frozen sets, `src/domain/contract.ts` builds a frozen `DelegationContract`
  through the eight issue-time refusals of the design document's section 5, and
  `src/domain/contract-digest.ts` computes `contract_digest` over the canonical
  JSON of its semantics. Each refusal is shown non-vacuous by removal: planting
  its hole turns red the case that reproduces that hole, one rule at a time.
- The canonical encoder learned `null` and integers, which `contract_digest`
  needs for `supersedes` and `vocabulary_version` and no G1 payload has. A
  number that is not a safe integer is refused rather than encoded, because
  CPython spells `1.0` as `1.0` where JavaScript spells it as `1`, and a digest
  that depended on which runtime computed it would be worse than one that could
  not be computed. `configDigest` and `contractDigest` now share one `sha256:`
  framing (`digestOf`) rather than spelling it twice.
- G2's classifier (cadenza#32), the belt's third step: `classify(contract,
  action, context)` in `src/domain/classification.ts` answers `allowed` /
  `needs_approval` / `refused` and carries the `contract_digest` it was made
  under on every answer, refusals included. Staleness is checked before the
  grant is read at all, an action names the set of capability keys whose acts it
  performs, and the strictest key wins - so a contract granting `command.run`
  and withholding `branch.push` refuses a command that pushes a branch.
- D-0028, recording what the classifier's totality ranges over: the action and
  the context unconditionally, with malformed input answered rather than thrown
  about, and the contract outside the range because a value that never came
  from `delegationContract` is refused rather than classified.
- The classifier's totality is measured rather than described: a deterministic
  property sweep asserts that no action or context reaches a fourth state or an
  exception, and requires the corpus to reach every outcome and every reason so
  it cannot pass by degenerating into one refusal repeated. It found a real hole
  on its first run - sorting the keys for a deterministic reason handed a
  non-string to a code-point collation, which threw.
- G2's supersession and onward delegation (cadenza#32), the belt's last step:
  `adopt(current, next)` replaces the contract a run holds only when the
  successor names the digest it replaces and keeps the same grantee and
  project, so a run holds at most one current contract and the chain is a line
  rather than a set; narrowing, including to nothing, is accepted, and that is
  how authority is taken back while revocation without a successor stays
  deferred. `delegate(held, request)` issues a sub-contract that requires
  `delegation.issue` in the granter's granted set and carries a subset of what
  the granter holds - `granted` from `granted`, `askable` from either, so
  narrowing is allowed in the safe direction and amplification is refused in
  the other.
- `README.md`'s G2 bullet now says what is implemented and what G2 deliberately
  does not do, rather than that G2 is designed and not implemented.
- The six decisions `docs/design/conductor.md` section 11 assigns to cadenza's
  gate, taken as the document recommends (cadenza#40, human gate 2026-09-05)
  and recorded as two entries. D-0030 ratifies the 2026-09-04 premise that the
  conductor is built on cadenza's semantics - the registry, the contract and
  `classify()`, not gate management - which until now lived only in an issue
  thread while section 12 named its reversal as the falsifier of the whole
  document (C-12). D-0031 fixes the agent-type record in five parts, one entry
  because they are five facets of one artefact: it carries capability key sets
  that are inputs to contract construction and never a second authority beside
  `classify()` (C-1); it is a separate record keyed by agent type, outside
  `config_digest` - which it would otherwise move for every project, refusing
  every issued contract as `stale_subject` - and carrying its own
  `agent_type_digest` that a run persists (C-2); a model tier is
  `executorPolicy`, carried and read only by the invocation adapter (C-3); it
  lives in the TypeScript tree alongside G2 (C-10); and editing one mints a new
  record, so a stored digest still addresses something, with the storage left
  to whoever owns it (C-16). No code changes: both entries are design records,
  and the belt that implements the record comes after them.

### Removed

- The Python G1 implementation (cadenza#25, D-0032): `src/cadenza/`, `tests/`,
  `pyproject.toml`, `.github/workflows/test.yml`, and the ruff / mypy / pytest /
  pip-audit wiring. TypeScript is now the whole of the implementation, and
  `main`'s required checks are `ts-gate` and `dependency-review`. `shellcheck`
  moved to `.github/workflows/hygiene.yml` and stays, as before, not required.
- `scripts/oracle/dump_compose_digest.py`, with
  `parity/oracle/compose-digest-vector.json` kept and frozen. The composition
  oracle questioned cadenza's own Python, which no longer exists and so can no
  longer move; `test/application/compose-oracle.test.ts` still compares all 13
  cases against the frozen vector on every run. Regenerating it is no longer
  possible, and adding a case to it is no longer meaningful.

### Changed

- `docs/design/conductor.md` section 9.1's `prepare`/`--ignore-scripts`
  rationale is corrected where it appears (D-0035): npm 10.9.2 runs a git
  dependency's `prepare` *despite* `--ignore-scripts`, so option B is declined
  because a `prepare` would run cadenza's build inside a consumer whose install
  policy forbids exactly that (D-0004) - not because the install would come out
  empty. `docs/design/artifact-delivery.md` is marked taken, with its draft
  entry replaced by a pointer to D-0035 and its decision table recording each
  row's outcome.
- `scripts/oracle/dump_config_digest.py` no longer imports `cadenza.domain.*`;
  it restates the payload shape and digest rule in stdlib Python and reproduces
  the committed vector byte for byte, verified before the deletion landed and
  from an empty directory with no repository around it. The `config_digest`
  oracle therefore stays live through the retirement (D-0032), because what it
  questions is CPython's JSON encoder and code-point collation - a third party
  that outlived the port. This is the whole of the repository's remaining Python
  footprint: one CI job, one stdlib-only script.
- `parity/` is kept in full and is now a closed historical record: the ledgers
  hold the only account of what the Python suite asserted, and the source
  inventory can no longer be regenerated, since the collection it snapshots is
  gone. The inventory check that re-derived `def test_` counts from the Python
  sources is retired; the arithmetic that never needed them is kept.
- `test/architecture/import-boundaries.test.ts` drops the `src/cadenza/`
  carve-out and now applies one rule to the whole of `src/`, so a `.py` file
  reappearing anywhere under it is reported rather than passed over by both
  scans.
- The host application is a third repository, `rondo`, consuming cadenza and
  continuo as libraries (D-0029, taking cadenza#40's C-17 at the human gate).
  This supersedes the working assumption that cadenza hosts the application -
  recorded in cadenza#22's comments and as continuo's premise 2, never as an
  entry here, so nothing gains "superseded by". Cadenza's own dependency graph
  is untouched by it: no allowlist widening, no native transitive dependency,
  and D-0004 and D-0016 both stay true. The decision that the conductor is
  built on cadenza's semantics is unchanged, and has since been ratified as
  D-0030 (C-12).
  `docs/design/conductor.md` follows the decision: section 9 asks how the host
  consumes both libraries, section 9.3 and the C-17 row record the outcome, and
  the rows that turn on who consumes what - C-8, C-9 - change status without
  being decided. Section 11 now marks the six cadenza-gate rows DECIDED against
  D-0030 and D-0031; the eight rondo rows - the seven that go with the
  conductor, plus the demoted C-8 - and continuo's C-11 stay open.
- `scripts/parity-check.mjs` runs its `unmapped` sweep after reading every
  ledger, so a ledger entry may claim a target test in another belt's file
  without the result depending on ledger order.
- `scripts/parity-check.mjs` no longer reports `runner-alias` for the `test`
  in an unrelated property access such as `/\s/.test(x)`.
- Documentation no longer describes interlock as a party with something left to
  decide (D-0023). `README.md`, `docs/design/g1-project-registry.md` section 9
  and `docs/repository-policy.md` section 5 stated conditions - G2 "blocked on
  interlock settling its own contract", and a dependency stance held "yet" -
  that cannot be met, because interlock is the frozen source this stack is
  ported from. The questions themselves are kept, marked unanswered; only the
  framing that made waiting look correct is removed. D-0023 also records three
  candidate unfreeze conditions for G2, none of them adopted.

### Fixed

- Exported validation constants are immutable at runtime, not merely typed as
  such. `ALLOWED_URL_SCHEMES` and `SUPPORTED_SCHEMA_VERSIONS` translate Python
  `frozenset`s, and a `ReadonlySet` is an ordinary `Set` once compiled; the two
  `PathFlavour` objects are frozen for the same reason (D-0015).
- The TOML loader no longer swallows a leading byte-order mark. `TextDecoder`
  strips one by default, so a BOM-prefixed catalog parsed cleanly here while
  `tomllib` rejects it at line 1.
- Three gaps in the import-boundary sweep (cadenza#19). A `constructor`
  destructured out of any value - `const { constructor: F } = () => {}` - is
  reported as a loader route, where the binding pattern used to be read as a
  declaration and pass. An export alias named for a global no longer trips the
  sweep for the name it publishes: `export { local as fetch }` puts `local` in
  the specifier's property half and `fetch` in its name half, the opposite way
  round from an import, so a pure module that performs no I/O was failing for a
  word it only spells an export with. And `baseDir: "/srv"!` is unwrapped like
  the parenthesised and asserted forms beside it, so a POSIX-only anchor written
  with a non-null assertion is caught on every runner rather than by a
  windows-latest failure. Each is asserted against sources written for the
  purpose, which is the direction a sweep over a tree that satisfies its own
  rules cannot state.
- A `constructor` destructured by *assignment* is a loader route too
  (cadenza#37). `({ constructor: F } = () => {})` reaches the same `Function`
  constructor as the declaration form above, and reaches it with no binding
  pattern in the tree at all: an assignment writes its target as an ordinary
  object literal, so the pattern branch never ran and the key read as somebody
  else's property name. The literal is now classified by what encloses it - the
  target half of an `=`, or a pattern nested inside one - which is what tells it
  apart from `const x = { constructor: f }`, the identical node on the other
  side of the `=`. Nested targets are covered; the declaration form and a
  literal that is nobody's target each have a case saying they must not trip.
  The sweep's documented scope is unchanged: it is not a sandbox, and the list
  of spellings does not terminate.

### Dependencies

- `smol-toml` (exact, pinned in the lockfile) - the port's first and only
  runtime dependency, for the TOML layer loader. Rationale and the two known
  disagreements with `tomllib` are in D-0016.
- `typescript` 5.8.3 -> 7.0.2 (supersedes cadenza#12). TypeScript 7 is the Go
  compiler, and its npm package no longer exports a JavaScript compiler API, so
  the two checks that read this tree's own sources - `npm run parity` and the
  import-boundary sweep - lost `ts.createSourceFile`. They now obtain a syntax
  tree through `scripts/lib/ts-ast.mjs`, which asks the compiler for it and
  asserts the tree it gets back is the text it asked about. Nothing under `src/`
  changed: the port type-checks unaltered under 7. See D-0024.

## [0.1.0] - 2026-08-21

### Added

- Repository bootstrap: license, security policy, CI, and release policy.
- G1 project registry: immutable project ids, alias resolution, tagged-union
  clone sources, two-layer catalog composition with tombstones and collision
  refusal, and `config_digest` snapshots.
- Import-boundary test that keeps interlock out of the dependency graph.
