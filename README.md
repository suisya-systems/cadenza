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

The host application that runs the piece is a third repository, `rondo` - it
consumes cadenza and continuo as libraries and is where every delegated run
returns for its gate (`DECISIONS.md` D-0029).

## Status

Early. This repository currently contains:

- **bootstrap** - package layout, licence, security policy, CI, release policy.
- **G1 project registry** - implemented and tested, in TypeScript. Name
  resolution to an immutable `project_id`, a tagged-union clone source, a
  validated base branch, a two-layer catalog (tracked plus operator-local) with
  field-level merge, tombstones, collision refusal, provenance and a config
  digest. The contract is `docs/design/g1-project-registry.md`; where the code
  and that document disagree, the document is the defect report.
- **the TypeScript rewrite of G1 is complete, and the Python G1 is retired**
  (cadenza#8, cadenza#25). G1 was written in Python first; the port ran in place
  beside it, with both halves green in CI, until it reached all 330 collected
  pytest cases and `main`'s required checks became `ts-gate` +
  `dependency-review`. `DECISIONS.md` D-0032 then deleted `src/cadenza/`,
  `tests/` and the Python toolchain in one revertible change.

  **What the retirement kept.** The `parity/` ledgers and source inventory stay
  as the closed record of what happened to each of those 330 cases - they now
  hold the only account of what the Python suite asserted, and the ported tests
  still name the `tests/test_*.py` case each came from. So does one differential
  oracle: `scripts/oracle/dump_config_digest.py` still runs in CI, rewritten to
  import nothing but the Python standard library, because what it questions is
  CPython's JSON encoder and code-point collation rather than any cadenza code -
  a third party that outlived the port and can still move under an upgrade. The
  composition oracle's vector is kept and still checked, but frozen: it
  questioned cadenza's own Python, which can no longer change. See
  `DECISIONS.md` D-0032 and `docs/porting.md`.
- **G2 delegation contract** - implemented as far as `DECISIONS.md` D-0026 and
  D-0027 fix it, and TypeScript only (there is no Python G2). What is here: a
  capability vocabulary of seven keys, versioned and closed, where a key is
  matched by exact equality and read against the version its contract pinned
  (D-0027); the contract as a frozen value carrying its project, that project's
  `config_digest`, an issuer, the run it was issued for, a granted set, a
  disjoint askable set and the digest of the contract it replaces, with eight
  named refusals at issue time and a `contract_digest` over its semantics; a
  classifier that answers allowed, needs-approval or refused for every input,
  checks staleness before it reads the grant, and carries the digest it answered
  under on every answer including refusals; and supersession, where a successor
  names what it replaces, narrowing to nothing is how authority is taken back,
  and what a run passes onward is a subset of what it holds and requires
  `delegation.issue` to pass on at all.

  The contract is `docs/design/g2-delegation-contract.md`; where the code and
  that document disagree, the document is the defect report, and where the
  document and D-0026 disagree, the entry is what was decided. The argument
  behind D-0026 - the options weighed and the alternatives rejected - is
  `docs/design/g2-delegation-contract-proposal.md`. Interlock recorded the same
  question in its open issue #63, "Operating-layer delegation contract", and
  left it unanswered; that reference is where the question came from, not an
  answer in transit, and answering it here is what D-0023 said cadenza would
  have to do.

  **What G2 does not do, deliberately.** It does not enforce: cadenza returns a
  classification and a control plane transports, stores and acts on it, so a
  system that asks and then ignores the answer is not defended against here
  (D-0026 section 2). It reads no clock and mints no identity - the run
  presenting a contract and the catalog's current digest are supplied by the
  caller. And it has no serialisation: a contract is an in-memory value, so how
  one is written down at the edge is undecided (D-0026 section 2), as are
  expiry, revocation with no successor, budgets, who approves, and gate
  management (G3).

Explicitly **not** here yet:

- **any dependency on interlock** - not in `package.json`, not as an optional
  one. Interlock's control-plane API and SQLite schema are marked throwaway on
  interlock's own side, and interlock is frozen, so no later stabilisation is
  coming: adopting them would turn a deliberate spike into a dependency by
  inertia. `test/architecture/import-boundaries.test.ts` fails the build the day
  anything under `src/` imports `interlock` or `claude-org-runtime`, in any
  spelling and by any loader route. Whether cadenza ever takes that dependency
  is decided here (D-0023).

## Install

Node 22 or 24. The only runtime dependency is `smol-toml`.

```console
$ npm ci --ignore-scripts
$ npm run verify
```

`verify` is lint, unused-export analysis, type-check, the test suite, the parity
ledger, the source inventory and the package check, in that order.

## Using cadenza as a library

The package has one public entry point, `src/index.ts`, reached through the
package name and no deep path (`DECISIONS.md` D-0033). It exports what D-0029
names: the G1 project registry, the G2 delegation contract, and `classify()`.
There is no gate API - a gate *outcome* is an input to a classification, and
the gate verbs belong to continuo.

```console
$ npm run build          # clean, then tsc -p tsconfig.build.json -> dist/
$ npm run check:package  # the same build, then publint and attw on the tarball
```

`dist/` is gitignored and absent from a fresh checkout, so a consumer builds it
or takes a packed tarball. **Nothing is published**: the package is
`private: true` at `0.0.0`, and the first publish is still an untaken decision
(`docs/repository-policy.md` section 3).

One CI job runs Python, and it is not a build step: the differential oracle at
`scripts/oracle/dump_config_digest.py` re-derives what CPython's JSON encoder
says about the digest corpus and compares it with the committed vector. It needs
only a Python 3 interpreter - no package, no virtualenv, no dependencies - and
you can run it the way CI does:

```console
$ python3 scripts/oracle/dump_config_digest.py \
    parity/oracle/config-digest-vector.json --check
```

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

```ts
import { composeCatalog, resolveProject, TomlCatalogSource } from "@suisya-systems/cadenza";

const catalog = composeCatalog(new TomlCatalogSource("config").load());
const resolved = resolveProject(catalog, "cdz");

resolved.projectId; // 'cadenza'  - immutable identity, not the alias typed
resolved.source.kind; // 'git_url'
resolved.baseBranch; // 'main'
resolved.configDigest; // 'sha256:...' over the project's semantics
resolved.provenance["base_branch"]?.layer; // 'tracked'
```

Fields are camelCase, but **provenance keys are not**: they are the catalog's
own field names, so the key is `base_branch` and not `baseBranch`. Provenance is
indexed by what the operator wrote in the file, not by what the port calls it.

A run persists `project_id` and `config_digest` next to `source` and
`base_branch`. A digest that no longer matches is the signal that the catalog
moved under a run that already happened; without it, that change is invisible.

Resolution is pure: it never clones, never opens a network connection and never
reads a working tree. `local_path` is validated lexically only. Whether a path
exists, is readable, or is a symlink pointing somewhere else entirely is a
run-side precondition, declared as the `LocalPathVerifier` port and mandatory
before any clone.

Every refusal is a typed error under `src/domain/errors.ts`, carrying the file
and the key at fault. An unknown key, a colliding name, an unsupported
`schema_version` or an unreachable `local_path` fails the whole load; a catalog
that half-loads is worse than one that does not load.

## Layout

```
src/               the implementation
  domain/        canonical JSON, identifiers, clone sources, project, digest,
                 refs, contract, capability, classification    (no I/O)
  application/   composition and resolution                    (no I/O)
  ports/         interfaces the outside world implements
  adapters/
    toml-catalog/   TOML files -> raw layer documents
test/              the test suite
  testkit/       pytest constructs, vendored from continuo
  oracle/        the differential oracles' corpora
  architecture/  the import-boundary scan over the whole of `src/`
parity/            the source inventory, the ledgers and the oracle vectors
scripts/           the parity and inventory checks, and the oracle generator

config/            catalog data
docs/              design documents and policy
```

`src/` held two trees at once for the length of the port: `src/cadenza/` (Python)
beside `src/` (TypeScript). They shared a root on purpose, because that is where
the TypeScript tree finally lives, so retiring the Python one deleted rather than
moved (`DECISIONS.md` D-0012, carried out in D-0032). The one-character gap
between `test/` and `tests/` went with it.

Dependencies point inward only: `adapters -> application -> domain`, and `ports`
is depended on but depends on nothing. `tests/test_import_boundaries.py`
enforces that in CI rather than in review. No module is named `core` or
`runtime`; those words belong to interlock's vocabulary, and reusing them makes
a boundary review harder than it needs to be.

## Docs

- `docs/design/g1-project-registry.md` - the G1 contract: identity, clone source
  union, merge rules, digest, resolution.
- `docs/design/g2-delegation-contract.md` - the G2 contract: capability keys,
  the delegation contract value and its digest, the three-valued classifier, and
  supersession. Written against D-0026, which it cites rather than restates.
- `docs/design/g2-delegation-contract-proposal.md` - the argument behind D-0026:
  the options weighed for the delegation contract, and what each would cost.
  D-0026 is the decision; this is why it is that one.
- `docs/design/conductor.md` - the conductor proposal: how a one-line request
  becomes admitted continuo runs and comes back as gate and merge decisions.
  Propose-only; its decisions C-1..C-17 are the human gate's to take. Seven
  have been taken: C-17 (D-0029: the host is `rondo`), C-12 (D-0032) and
  C-1/C-2/C-3/C-10/C-16 (D-0031, the agent-type record). The nine still open
  are rondo's and continuo's, and C-9 is retired unreached.
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
