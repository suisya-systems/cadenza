# AGENTS.md

For anyone picking up an open issue here who is not already inside this
repository's habits - human or AI agent. It records only what is specific to
cadenza and easy to get wrong; it is not a guide to writing software. Every
rule names its evidence (a `D-00NN` entry in `DECISIONS.md`, a file path, or a
CI job name), and where this file and that evidence disagree, the evidence wins.

`README.md` says what cadenza is. This file says how work on it is done.

## 1. There is one implementation now, and one piece of Python

TypeScript is the whole of cadenza: `src/` and `test/`. `src/cadenza/` (Python)
and `tests/` (its pytest suite) were deleted by **D-0032** once the port reached
330 of 330 collected node ids and `main`'s required checks became `ts-gate` +
`dependency-review`. Earlier sections of this file used to say the two coexisted
and both had to be kept green; that is over, and a PR that adds a `.py` file
under `src/` is doing something that needs saying out loud.

**One piece of Python survives, deliberately**:
`scripts/oracle/dump_config_digest.py`. It imports the standard library and
nothing else, and CI runs it in the `oracle` job. It is not a leftover - it is
the live half of a differential oracle, and section 5 says what it is for.

The `test/` versus `tests/` trap is gone with `tests/`, but the ported tests
still cite `tests/test_*.py` in their headers. Those are provenance, not live
paths: they say where a case came from, and they are the reason a ledger entry
can be read years later.

## 2. When the port and the design document disagree (D-0001)

Authorities, in order: `docs/design/g1-project-registry.md`, then `src/` +
`test/`. A disagreement with the design document is a defect **in the code**;
the document is the primary oracle and always was.

The middle authority is gone. Until D-0032 this order ran document, then
`tests/` (the Python suite), then `src/cadenza/`, and a disagreement with a
Python test was a *finding* to be recorded in a ledger `reason` rather than
transcribed. There is no Python test to disagree with now, so that step falls
away and the document carries the weight alone. The findings already recorded in
the ledgers stay exactly as they are - they are history, and D-0032 did not
re-open any of them.

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
| `npm run verify` (lint, knip, typecheck, test, parity, inventory) | the `checks` and `double-green` jobs in `.github/workflows/typescript.yml`, aggregated by `ts-gate` |
| `python3 scripts/oracle/dump_config_digest.py parity/oracle/config-digest-vector.json --check` | the `oracle` job in the same workflow |

There is no `pytest` / `ruff` / `mypy` row any more, and no `.github/workflows/test.yml`:
D-0032 deleted all four. `shellcheck` moved to `.github/workflows/hygiene.yml`
and, as in its old home, is deliberately **not** a required check.

Required checks are `ts-gate` and `dependency-review`
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
  `claude-org-runtime` and `interlock`, and the underscore spellings
  `claude_org_runtime` / `interlock` are still refused because a package name
  can arrive either way - and dependencies point inward only
  (`adapters -> application -> domain`). Enforced by
  `test/architecture/import-boundaries.test.ts`, which gets its own named CI
  step. Its Python counterpart `tests/test_import_boundaries.py` was the other
  half of this until D-0032 deleted it; the TypeScript file now covers the whole
  of `src/`, including the `src/cadenza/` carve-out it used to leave to the
  Python scan. No module is named `core` or `runtime`.

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
  outlive the code they measured, which is no longer hypothetical: D-0032
  deleted that code and kept every ledger. They are now the only account of what
  the Python suite asserted. Do not edit one to make `npm run parity` quiet.
- **`parity/source-inventory/*.txt` and `parity/source-inventory.manifest.json`.**
  A committed snapshot of pytest's collection, in collection order. **It can no
  longer be regenerated**: the procedure in `docs/porting.md` section 3.3 ran
  the collection, and D-0032 deleted the suite it collected. It is now a closed
  historical record. `npm run inventory` still checks it for internal
  consistency; the one check that re-derived a figure from the Python source
  (`test_functions` against `def test_`) is retired and says so in
  `scripts/source-inventory-check.mjs`.
- **`parity/oracle/*.json`.** Vectors produced by CPython, and after D-0032 the
  two are no longer alike - do not treat them as one kind of file.
  - `config-digest-vector.json` is **live**. The `oracle` CI job regenerates and
    compares it every run, so it cannot become a fossil, because what it
    questions is CPython's encoder - a third party that outlived the port and
    can still move. If a change moves a digest, that is the finding, not the
    vector's fault.
  - `compose-digest-vector.json` is **frozen**. It questioned cadenza's own
    Python, which no longer exists and so can no longer move; its generator was
    deleted and nothing regenerates it.
    `test/application/compose-oracle.test.ts` still checks all 13 cases against
    it every run, which catches TypeScript regressions and nothing else. **Do
    not add a case to it** - there is no CPython left to ask for the expected
    value, so a new row would only assert that the code agrees with itself.
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
  a decision nobody took. Issues #9 and #22 are in this state today. (#25 was
  too, until its open decision was settled at the human gate and closed by
  D-0032.)

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
