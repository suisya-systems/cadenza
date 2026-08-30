# AGENTS.md

For anyone picking up an open issue here who is not already inside this
repository's habits - human or AI agent. It records only what is specific to
cadenza and easy to get wrong; it is not a guide to writing software. Every
rule names its evidence (a `D-00NN` entry in `DECISIONS.md`, a file path, or a
CI job name), and where this file and that evidence disagree, the evidence wins.

`README.md` says what cadenza is. This file says how work on it is done.

## 1. Two implementations coexist, and neither is dead yet

`src/cadenza/` (Python) and `src/` + `test/` (TypeScript) are both live. The
TypeScript rewrite of G1 has reached 330 of 330 collected node ids, but
`.github/branch-protection.json` still requires the `pytest (...)` cells *and*
`ts-gate`, so `main` is enforced by both at once. **Retiring the Python side,
and deciding which side becomes the enforcing one, is issue #25 and is not
settled.** Do not pre-empt it: a change touching behaviour covered on
both sides keeps both green. "Keep both green" is not "make them agree by
copying", though - where the two disagree, section 2 says which one is wrong.

Which one an issue means is usually explicit in its acceptance criteria. When it
is not, ask on the issue rather than choosing.

`test/` is the TypeScript suite and `tests/` is the Python one - one character
apart on purpose, which is why both runners are pointed at their directory
explicitly (`README.md`, "Layout").

## 2. When the port and the code disagree (D-0001)

Authorities, in order: `docs/design/g1-project-registry.md`, then `tests/` (the
Python suite), then `src/cadenza/`. A disagreement with the design document is a
defect **in the port**. A disagreement with a Python test, where the document is
silent or agrees with the port, is a finding: record it in the ledger entry's
`reason` and raise it. Do not transcribe it into the TypeScript side.

This is the reverse of continuo's order, so do not carry that habit over
(`docs/porting.md` section 2).

## 3. Decisions go in `DECISIONS.md`

Any change that settles a design question - not just code - adds an entry.
Substantive PRs here do: see `b269197`, `991d8e2`, `47ad373`, each of which
touches `DECISIONS.md` and `CHANGELOG.md`. Documentation and dependency bumps
(`a5672f8`, `4aa5333`) touch neither.

The rules, from that file's own "How to use this file":

- **IDs are permanent.** Never reuse, renumber, merge or delete one.
- **Supersession keeps the ID**: the old entry gains
  `Status: superseded by D-XXXX` and the replacement is appended with a new ID.
  D-0014 / D-0023 is a worked example of this.
- **Cross-reference by ID only** - never by line number or heading order.
- **Every entry states what would falsify it.**
- Cite other repositories' decisions as `continuo D-00NN` / `interlock D-00NN`;
  the numbering spaces are unrelated.

A short entry, quoted in full shape (D-0013):

```markdown
## D-0013 - The canonical encoder refuses a lone surrogate rather than escaping it

**Status:** accepted

**Decision.** `canonicalJson` throws `SurrogateInStringError` on an unpaired
surrogate, where `JSON.stringify` would return `"\ud800"`.

**Why.** CPython, on the same input, emits the raw character from `json.dumps`
and then raises `UnicodeEncodeError` ... Producing a digest where the source
refused would mean the port silently accepts a project the Python
implementation rejects.

**What would falsify it.** A finding that CPython's refusal is itself the
defect, in which case the design document is where that gets settled first
(D-0001).
```

Add the ID to the index table at the top of the file as well as the body.

## 4. Verification

| Run locally | What it gates in CI |
|---|---|
| `python -m pytest` (plus `ruff check .`, `ruff format --check .`, `mypy src`) | `pytest (<os> / py<version>)` in `.github/workflows/test.yml` |
| `npm run verify` (lint, knip, typecheck, test, parity, inventory) | the `checks` and `double-green` jobs in `.github/workflows/typescript.yml`, aggregated by `ts-gate` |

Required checks are `pytest (ubuntu-latest / py3.10)`,
`pytest (ubuntu-latest / py3.12)`, `ts-gate` and `dependency-review`
(`.github/branch-protection.json`). **Those job `name:` strings are
load-bearing**: the ruleset matches them literally, so renaming a job without
editing that file leaves `main` waiting on a check that never reports
(`docs/repository-policy.md` section 2).

Specific to this repository:

- **Double green (D-0006).** The TypeScript suite runs twice per matrix cell at
  two distinct seeds under randomised ordering, with `retry: 0`. Shuffle is
  configured in `vitest.config.ts`, never on the command line; CI injects only
  `CADENZA_TEST_SEED`, and an unset seed under `CI` is a hard error. There is
  deliberately **no quarantine mechanism**: an order-dependent test is fixed,
  not skipped.
- **A skip needs an approval and an exact count.** `skip`, `todo`, `fails` and
  `xfail` anywhere under `test/` are counted per construct per file by
  `npm run parity` and fail as `unapproved-skip` unless a ledger approves them
  with a reason (D-0009). Aliasing a runner (`const q = test.skip`) is refused
  outright as `runner-alias`, not counted.
- **ASCII only for anything printed (D-0007).** Error text, CLI output, the
  seed line - no em-dash, no typographic quotes. The console this is developed
  against is cp932, where an unencodable character kills the process at the
  print rather than at the bug, and a test harness capturing UTF-8 will not see
  it. Markdown prose is exempt.
- **Nothing under `cadenza` may import interlock, in any spelling** -
  `claude_org_runtime` and `interlock` on the Python side,
  `claude-org-runtime` and `interlock` on the TypeScript - and dependencies
  point inward only (`adapters -> application -> domain`). Enforced by
  `tests/test_import_boundaries.py` and
  `test/architecture/import-boundaries.test.ts`, both of which get their own
  named CI step. No module is named `core` or `runtime`.

**Green is not enough when you touch a check.** If a PR adds or repairs a check,
it is expected to show the check is not vacuous - typically by mutation: plant
the failure the check exists to catch, show it goes red, revert. PR #24 does
this ("injecting `test.skip` turns parity red at the right line; injecting
`import "interlock"` into `src/` turns 3 boundary cases red. Both reverted"),
and issue #19 makes it an acceptance criterion.

## 5. Files that are records, not working files

- **`parity/*.ledger.json`, `parity/target-only.json`.** The account of what
  happened to every ported test case. The unit is the pytest **node id**, not
  the test function (D-0010): a parametrised function of seven cases is seven
  entries. Every collected test must belong to a ledger's target file or be
  declared in `parity/target-only.json` with a stated reason. The ledgers
  outlive the code they measured - #25 keeps them after the Python side is
  retired. Do not edit one to make `npm run parity` quiet.
- **`parity/source-inventory/*.txt` and `parity/source-inventory.manifest.json`.**
  A committed snapshot of pytest's collection, in collection order. It is
  regenerated only by re-running the collection, per the procedure in
  `docs/porting.md` section 3.3 - never by hand-editing to match.
- **`parity/oracle/*.json`.** Vectors produced by CPython. The `oracle` CI job
  regenerates and compares them each run precisely so they cannot become
  fossils; if a change moves a digest, that is the finding, not the vectors'
  fault.
- **`DECISIONS.md`.** Append-only. See section 3.
- **`config/projects.local.toml`.** Gitignored, one operator's machine. Never
  add it or its paths to the tracked layer.

## 6. Reading an issue before you start

Issues carry up to three headings, and they mean different things:

- **`## Acceptance criteria`** - the definition of done, and the scope. Meeting
  these is the whole job.
- **`## Implementation constraints`** - decisions already taken that the
  implementation must respect (ordering, what must not change). Not
  suggestions.
- **`## Open decisions`** - questions that are *not yet answered*.
  **An issue with `Open decisions` must not be started.** The decision is not
  the implementer's to make; picking one silently is how the repository acquires
  a decision nobody took. Issues #9, #22 and #25 are in this state today.

The labels say the same at a glance: `ready-to-start` ("acceptance criteria are
settled and nothing is waiting on a decision"), `needs-decision` ("has
unresolved Open decisions; do not start"), `size:S|M|L`. Take `ready-to-start`.

## 7. Scope

One issue, one pull request. If the work seems to need more than the issue
describes, **stop and write it on the issue** rather than widening the branch.
Enumerating adjacent problems instead of stating the scope of the claim is a
failure mode already recorded here (#19, "not a list that terminates").

## 8. Review and merge are ours, not yours

Take the work as far as a pull request. Review and merge happen on the owning
organisation's side: `main` takes no direct pushes, requires one approving
review with `dismiss_stale_reviews`, `required_conversation_resolution` and
linear history, and `enforce_admins: false` means a solo merge shows up as an
admin override in the audit log (`docs/repository-policy.md` sections 1-2).
Do not merge your own PR.

So the reviewer can read the scope without reconstructing it, the PR body must
state:

- which of the issue's **acceptance criteria** this PR satisfies;
- **what you deliberately did not do** - what you judged out of scope, and why;
- **any judgement call you had to make**: what you chose and why.

If you widened the scope, say so and say why. Widening silently is the problem;
widening with a stated reason is a reviewable decision. Known limitations left
in place belong in the body too (PR #24, PR #14) - though #15 exists because one
such note lived only in a PR body, so a lasting one belongs in `DECISIONS.md`.

## 9. Language

Issues, pull request bodies and commit messages are written in **English**,
without exception in the history to date. Commit subjects are imperative; some
carry a conventional-commit prefix (`feat(cadenza):`, `docs:`, `chore(deps):`)
and some are a plain sentence ("Port the refs belt (62 node ids), checking
git-parity against real git"). Either is accepted; no check enforces the prefix.
