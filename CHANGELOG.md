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

### Changed

- `scripts/parity-check.mjs` runs its `unmapped` sweep after reading every
  ledger, so a ledger entry may claim a target test in another belt's file
  without the result depending on ledger order.
- `scripts/parity-check.mjs` no longer reports `runner-alias` for the `test`
  in an unrelated property access such as `/\s/.test(x)`.

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

## [0.1.0] - 2026-08-21

### Added

- Repository bootstrap: license, security policy, CI, and release policy.
- G1 project registry: immutable project ids, alias resolution, tagged-union
  clone sources, two-layer catalog composition with tombstones and collision
  refusal, and `config_digest` snapshots.
- Import-boundary test that keeps interlock out of the dependency graph.
