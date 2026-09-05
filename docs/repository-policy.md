# Repository Policy

Operational policy for the public `suisya-systems/cadenza` repository.

## 1. Branches

`main` is the only long-lived branch. All work lands via pull request; nobody
pushes directly to `main`.

## 2. Branch protection

`.github/branch-protection.json` encodes the protection settings for `main`.
JSON carries no comments, so the choices are explained here:

- **Required status checks**, `strict: true` (a branch must be up to date with
  `main` before it merges). The required contexts are the *check-run* names,
  not workflow names, which is why they read as they do:
  - `ts-gate` — one aggregating job in `.github/workflows/typescript.yml`,
    standing for the whole TypeScript gate: the six `double-green` matrix cells,
    `checks`, and `oracle`. It is a single required context on purpose, so that
    adding or dropping a matrix cell never means editing this ruleset, and it
    fails on any upstream result other than `success` — `skipped` and
    `cancelled` included, which `needs` alone would let through.
  - `dependency-review`.

  Two `pytest (...)` contexts stood beside these until `DECISIONS.md` D-0032
  retired the Python implementation; they were removed from the ruleset by hand
  at the human gate, and this file and `.github/branch-protection.json` were
  updated to match. `shellcheck` (now in `.github/workflows/hygiene.yml`) runs
  and is visible but is deliberately not required, as it was not before.

  The matrix rows `ts-gate` aggregates run and are visible, but are not
  individually required: a macOS or Windows runner outage should not be able to
  freeze `main`. The jobs set an explicit `name:` precisely so these strings are
  stable; changing one without changing the other leaves `main` waiting for a
  check that never reports.
- **`required_pull_request_reviews`** with one approval and
  `dismiss_stale_reviews: true`. On a repository with a single maintainer this
  cannot be satisfied by the author, which is deliberate: `enforce_admins` is
  `false`, so a solo merge is an admin override — visible in the audit log
  rather than indistinguishable from a reviewed merge.
- **`required_linear_history`**, **`allow_force_pushes: false`** and
  **`allow_deletions: false`**: the history of a public repository is a
  published artifact.
- **`required_conversation_resolution`**: a review comment closes because
  somebody answered it, not because the branch moved on.

Protection cannot be applied to a repository with no branches yet, so it
cannot be a step already taken as part of the initial commit. It ships as a
script instead: run `scripts/apply_branch_protection.sh` once, after the first
push to `main`, to apply the settings in `.github/branch-protection.json`.

## 3. Versioning

Cadenza follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is `0`, the public API may break in a minor release.

The single source of truth for the current version is the `version` field of
`package.json`. Nothing else (docs, CI) declares the version independently;
they derive from it.

It was `src/cadenza/__about__.py` until `DECISIONS.md` D-0032 deleted the Python
package along with `pyproject.toml`, which is what read it. The field currently
reads `0.0.0` and the package is `private: true`: nothing has been released.

What a published cadenza would look like is no longer open. D-0033 gives the
package its library surface -- one entry point (`src/index.ts`), an `exports`
map, an emitted `dist/` from `tsconfig.build.json`, and a `files` allowlist --
and CI checks the packed tarball with `publint` and `attw` on every pull
request. What is still deferred is the act of publishing: a registry name, a
release process, and who may run it.

## 4. Releases

A release tags `main` as `v<version>` (for example `v0.1.0`). Every release
requires a corresponding entry in `CHANGELOG.md`. The GitHub release is cut
from that tag, with release notes drawn from the changelog entry.

## 5. Dependencies

Runtime dependencies are kept minimal. The `dependency-review` workflow
reviews any dependency change on pull requests before merge.

interlock is deliberately not a runtime dependency, even though cadenza is
designed to sit on top of it. `docs/design/g1-project-registry.md` section 9
explains why: interlock's control-plane API and SQLite schema are marked
throwaway on interlock's own side and interlock is frozen, so depending on them
would turn a deliberate spike into a dependency by inertia and nothing there is
going to stabilise later. The reserved, empty seam for the first real
integration was `src/cadenza/adapters/interlock/` and went with the Python
package (D-0032); the boundary it marked is not gone, and is now enforced for
the whole of `src/` by `test/architecture/import-boundaries.test.ts`. Taking
that step is a cadenza decision (`DECISIONS.md` D-0023), not one this repository
is waiting on someone else to take.
