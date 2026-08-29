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

## [0.1.0] - 2026-08-21

### Added

- Repository bootstrap: license, security policy, CI, and release policy.
- G1 project registry: immutable project ids, alias resolution, tagged-union
  clone sources, two-layer catalog composition with tombstones and collision
  refusal, and `config_digest` snapshots.
- Import-boundary test that keeps interlock out of the dependency graph.
