# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

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
