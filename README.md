# cadenza

Cadenza is the business operations layer that sits on top of interlock, a
durable control plane for long-running work. Interlock answers "did this run
survive a crash"; cadenza answers the operational questions around it:

- **project registry** - which project is the name an operator typed, and what
  concrete facts (clone source, base branch, immutable identity) does a run need
  to act on it?
- **delegation contract** - what a run is allowed to do on that project, and on
  whose authority.
- **gate management** - which checks a run must pass before it is considered
  done.

Cadenza is **provider-agnostic**. Its domain, application and ports layers name
no executor: not Claude, not GitHub, not interlock. Anything specific to one of
those lives behind a port, in an adapter.

## The name

A cadenza is the moment the orchestra falls silent and a soloist plays on
their own judgment - within an agreed frame, and ending with the trill that
cues the ensemble back in. That is what this layer defines, not what it
performs: each delegated run is the soloist, the delegation contract says
what may be improvised and on whose authority, and gates are the cue that
ends the solo and hands control back.

The structural counterpart is
[continuo](https://github.com/suisya-systems/continuo), the basso continuo
that underpins the piece throughout, realising behaviour from policy rows the
way a continuo realises chords from figures. The pairing is recorded in
suisya-systems/interlock#74.

## Status

Early. This repository currently contains:

- **bootstrap** - package layout, licence, security policy, CI, release policy.
- **G1 project registry** - implemented and tested. Name resolution to an
  immutable `project_id`, a tagged-union clone source, a validated base branch,
  a two-layer catalog (tracked plus operator-local) with field-level merge,
  tombstones, collision refusal, provenance and a config digest. The contract is
  `docs/design/g1-project-registry.md`; where the code and that document
  disagree, the document is the defect report.
- **a TypeScript rewrite of G1, in progress** (cadenza#8). The rewrite happens
  in place: the Python implementation and its suite stay here, and stay green in
  CI, until a later PR retires them. So far the toolchain, the parity ledger
  covering all 330 collected pytest cases, a differential oracle that compares
  the TypeScript `config_digest` against CPython's byte for byte, and the pilot
  port of `tests/test_digest.py`. See `DECISIONS.md` and `docs/porting.md`.

Explicitly **not** here yet:

- **G2 delegation contract** - not designed. The open question is what a
  delegated run may do, on whose authority, and how that is expressed at the
  seam to a control plane. Interlock recorded the same question - its open
  issue #63, "Operating-layer delegation contract" - and left it unanswered;
  that reference is where the question came from, not an answer in transit.
  G2 is held at cadenza#9. The condition for taking it up is cadenza's own
  (D-0023) and is now set: `DECISIONS.md` D-0025 adopts D-0023's candidate 2 -
  G2 opens when a `D-` entry here fixes what the delegation contract must
  express (authority model, control-plane seam, what a run may do without
  asking). That entry has not been written yet, so G2 stays not started.
- **any dependency on interlock** - not in `pyproject.toml`, not as an extra.
  Interlock's control-plane API and SQLite schema are marked throwaway on
  interlock's own side, and interlock is frozen, so no later stabilisation is
  coming: adopting them would turn a deliberate spike into a dependency by
  inertia. `src/cadenza/adapters/interlock/` reserves the seam and stays empty;
  `tests/test_import_boundaries.py` fails the build the day anything under
  `cadenza` imports `claude_org_runtime`. Whether cadenza ever takes that
  dependency is decided here (D-0023).

## Install

```console
$ python -m pip install -e ".[dev]"
$ python -m pytest
```

Python 3.10 or newer. The only runtime dependency is `tomli`, and only on 3.10,
where the standard library has no `tomllib`.

The TypeScript half needs Node 22 or 24:

```console
$ npm ci --ignore-scripts
$ npm run verify
```

`verify` is lint, unused-export analysis, type-check, the test suite, the parity
ledger and the source inventory, in that order.

## The catalog

Catalog data lives in `config/`. `config/projects.toml` is tracked and shared;
`config/projects.local.toml` is gitignored and belongs to one operator. A
project's table key is its `project_id`: immutable, never renamed, never reused.
Display names are `aliases`, and they are free to change.

`config/projects.toml`, tracked and shared:

```toml
schema_version = 1

[project.cadenza]
aliases = ["cdz"]
base_branch = "main"

[project.cadenza.source]
kind = "git_url"
url = "https://github.com/suisya-systems/cadenza.git"
```

A `project_id` is already a resolvable name, so listing it again under `aliases`
is not shorthand, it is a collision, and composition refuses it.

There is deliberately no `[catalog]` table here. `allowed_local_roots` is
layer-local and does not merge: a `local_path` is checked against the roots of
the file that declared it. That is what stops a shared tracked file from
authorising a directory on somebody else's machine, and it is why local paths
and the roots that permit them belong in the operator's own layer.

`config/projects.local.toml`, gitignored and yours alone:

```toml
schema_version = 1

[catalog]
allowed_local_roots = ["~/work"]

[project.house_ledger]
aliases = ["ledger"]
base_branch = "trunk"

[project.house_ledger.source]
kind = "local_path"
path = "~/work/house-ledger"
```

Resolving a name:

```python
from pathlib import Path

from cadenza.adapters.toml_catalog.loader import TomlCatalogSource
from cadenza.application.compose import compose_catalog
from cadenza.application.resolve import resolve_project

catalog = compose_catalog(TomlCatalogSource(Path("config")).load())
resolved = resolve_project(catalog, "cdz")

resolved.project_id  # 'cadenza'  - immutable identity, not the alias typed
resolved.source.kind  # 'git_url'
resolved.base_branch  # 'main'
resolved.config_digest  # 'sha256:...' over the project's semantics
resolved.provenance["base_branch"].layer  # 'tracked'
```

A run persists `project_id` and `config_digest` next to `source` and
`base_branch`. A digest that no longer matches is the signal that the catalog
moved under a run that already happened; without it, that change is invisible.

Resolution is pure: it never clones, never opens a network connection and never
reads a working tree. `local_path` is validated lexically only. Whether a path
exists, is readable, or is a symlink pointing somewhere else entirely is a
run-side precondition, declared as the `LocalPathVerifier` port and mandatory
before any clone.

Every refusal is a typed exception under `cadenza.domain.errors`, carrying the
file and the key at fault. An unknown key, a colliding name, an unsupported
`schema_version` or an unreachable `local_path` fails the whole load; a catalog
that half-loads is worse than one that does not load.

## Layout

```
src/cadenza/       the Python implementation, retired by a later PR
  domain/        identifiers, clone sources, project, digest, errors  (no I/O)
  application/   composition and resolution                          (no I/O)
  ports/         protocols the outside world implements
  adapters/
    toml_catalog/   TOML files -> raw layer documents
    interlock/      reserved seam, empty
    claude_code/    reserved seam, empty
tests/             the Python suite

src/               the TypeScript port
  domain/        canonical JSON, clone sources, project, digest
test/              the TypeScript suite
  testkit/       pytest constructs, vendored from continuo
  oracle/        the differential oracle's corpus
parity/            the source inventory, the ledgers and the oracle vectors
scripts/           the parity and inventory checks, and the oracle's Python half

config/            catalog data
docs/              design documents and policy
```

The two trees coexist at the root on purpose: that is where the TypeScript tree
finally lives, so the PR that retires the Python one deletes rather than moves
(`DECISIONS.md` D-0012). The one-character gap between `test/` and `tests/` is
why both runners are pointed at their directory explicitly rather than left to
search.

Dependencies point inward only: `adapters -> application -> domain`, and `ports`
is depended on but depends on nothing. `tests/test_import_boundaries.py`
enforces that in CI rather than in review. No module is named `core` or
`runtime`; those words belong to interlock's vocabulary, and reusing them makes
a boundary review harder than it needs to be.

## Docs

- `docs/design/g1-project-registry.md` - the G1 contract: identity, clone source
  union, merge rules, digest, resolution.
- `DECISIONS.md` - the append-only record of design decisions. Cadenza's own
  numbering space, starting at D-0001.
- `docs/porting.md` - the TypeScript rewrite: the oracle order, the parity
  ledger, the differential oracle, and what has been ported so far.
- `docs/repository-policy.md` - branch protection, review and release policy.
- `AGENTS.md` - the conventions to know before picking up an open issue, for
  human and AI implementers alike.
- `SECURITY.md` - how to report a vulnerability.

## Licence

MIT. See `LICENSE`.
