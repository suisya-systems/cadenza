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
  - `pytest (ubuntu-latest / py3.10)` — the minimum supported interpreter, and
    the only row that exercises the `tomli` fallback rather than stdlib
    `tomllib`. If that path breaks, it breaks here or nowhere.
  - `pytest (ubuntu-latest / py3.12)` — the newest supported interpreter.
  - `dependency-review`.

  The other fifteen matrix rows run and are visible, but are not required: a
  macOS or Windows runner outage should not be able to freeze `main`, and the
  two required rows bracket the interpreter range the package claims to
  support. The `pytest` job in `.github/workflows/test.yml` sets an explicit
  `name:` precisely so these strings are stable; changing one without changing
  the other leaves `main` waiting for a check that never reports.
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

The single source of truth for the current version is
`src/cadenza/__about__.py`. Nothing else (docs, packaging metadata, CI)
declares the version independently; they derive from it.

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
going to stabilise later. `src/cadenza/adapters/interlock/` exists as a
reserved, empty seam for the first real integration, and taking that step is a
cadenza decision (`DECISIONS.md` D-0023), not one this repository is waiting on
someone else to take.
