# Porting cadenza to TypeScript

Authority: [`DECISIONS.md`](../DECISIONS.md).
Kickoff: [suisya-systems/cadenza#8](https://github.com/suisya-systems/cadenza/issues/8).

G1 is being rewritten in TypeScript. This document is the working guide: what the port is measured
against, how a case is accounted for, and what the differential oracle does that a translated test
cannot.

## 1. The shape of the port

The rewrite happens **in place**. `src/cadenza/` (Python) and `src/domain/` (TypeScript) coexist
until a later PR retires the first (`D-0012`, `D-0014`). Two consequences follow, and both are
load-bearing:

- The Python suite stays green in CI throughout. It is the specification's second authority
  (section 2) and the source of every inventory, so a red Python suite is a red port.
- The differential oracle (section 4) needs no second checkout. The implementation it questions is
  in this repository.

Directory map during coexistence:

| Path | What it is |
|---|---|
| `docs/design/g1-project-registry.md` | The contract. The primary oracle. |
| `src/cadenza/`, `tests/` | The Python implementation and its suite. Retired by a later PR. |
| `src/`, `test/` | The TypeScript port and its suite. |
| `parity/source-inventory/` | Every pytest node id, as collected. A committed snapshot. |
| `parity/*.ledger.json` | One ledger per source test file: what happened to each case. |
| `parity/oracle/` | Vectors produced by the Python side, compared against by the TypeScript side. |
| `scripts/parity-check.mjs`, `scripts/source-inventory-check.mjs` | The enforcement. |

## 2. The oracle order

`D-0001`. When the port and something in this repository disagree, consult in this order:

1. **`docs/design/g1-project-registry.md`** — the contract.
2. **`tests/`** — the Python suite.
3. **`src/cadenza/`** — the Python implementation.

A disagreement with the design document is a defect **in the port**. A disagreement with a Python
test, where the document is silent or sides with the port, is a finding: record it in the ledger
entry's `reason` and raise it. Do not transcribe it.

**This is the reverse of continuo's order.** Continuo ports interlock, where no artefact claims to be
a specification and the suite therefore is one. Cadenza's design document opens by claiming exactly
that role — *"where the two disagree, this document is the defect report"* — and it said so before
the port existed.

**What is reused from continuo anyway.** Its *translation conventions*
(`docs/test-translation-conventions.md` in that repository): how a pytest construct becomes a vitest
one, what a faithful translation may change and what it may not, and the catalogue of ways a
translated case goes green by losing its subject. Those are conventions about mechanics, and
mechanics do not care which artefact is the specification. Its *oracle order* is not reused. That
boundary is the whole of the reuse declaration; nothing else is inherited implicitly.

## 3. The ledger

### 3.1 What is written down

One ledger per **source test file**, named `parity/<subject>.ledger.json`, listing every node id in
that file's inventory with a disposition:

| Disposition | Meaning |
|---|---|
| `ported` | Same assertion, mechanically translated. Carries a `target_id`. |
| `adapted` | Same assertion, but the mechanism had to change. Carries a `target_id` and a reason saying what changed and why. |
| `not-ported` | Deliberately not translated here. Carries `target_id: null` and a reason. |
| `waived` | Not translated and not expected to be. Carries a reason. |

Plus, per ledger: the systematic mappings that apply across cases (so a reason does not repeat
itself fourteen times), the tests in the target file that translate no source case
(`target_only_tests`), any approved non-running construct, the recorded totals, and the limitations
inherited from the source file.

The **unit is the pytest node id**, not the test function (`D-0010`). A parametrised function with
seven parameters is seven entries.

### 3.2 What is enforced

`npm run parity` fails on any of:

| Class | What it caught |
|---|---|
| `missing` | A source case with no entry, or an entry naming a target test that does not exist. |
| `duplicate` | One source case claimed twice, or two source cases pointing at one target test. |
| `unmapped` | A test in a ported file that no entry claims and that is not declared target-only. |
| `unapproved-skip` | A `skip`, `todo`, `fails` or `xfail` anywhere under `test/` beyond what a ledger approves, counted per construct per file. |
| `shrinkage` | Fewer source cases in an inventory than the ledger records. |
| `totals` | Recorded totals that do not reconcile exactly with the entries. |
| `unaccounted-file` | A test file no ledger names and `parity/target-only.json` does not declare. |

The first six are continuo's, name for name. The seventh is cadenza's addition, because continuo's
`unmapped` sweep is scoped to each ledger's own target file and therefore sees nothing at all in a
file no ledger mentions (`D-0009`).

The `unapproved-skip` sweep reads each file's **syntax tree** rather than its source text, which is
the other place cadenza diverges. A text sweep misses a chained modifier — vitest accepts both
`test.concurrent.skip` and `test.skip.concurrent` — and can be derailed by a comment marker inside a
string literal. `typescript` is already a devDependency, so the check asks
`ts.createSourceFile` instead; comments and string literals are not nodes, so the prose in these
files cannot be counted either.

`npm run inventory` separately checks the inventory as a whole against
`parity/source-inventory.manifest.json`: stray files in either direction, lines that are not node ids
of the file's own source, counts, the `all.txt` aggregate, duplicated ids across inventories, the
reconciliation with the suite baseline, the `def test_` count re-derived from each source file, and
that every inventory carries a status the manifest's own vocabulary defines.

### 3.3 Regenerating an inventory

From the repository root:

```bash
PYTHONPATH=src PYTHONDONTWRITEBYTECODE=1 python3 -m pytest --collect-only -q -p no:cacheprovider
```

Split the output per source file, keeping **collection order**, and rebuild `all.txt` as the
concatenation in the manifest's `files` order. The order is a claim this procedure makes and nothing
offline can test it; re-running the collection is the only thing that does.

## 4. The differential oracle

`D-0011`. A ported test can only catch a divergence the Python suite already had an assertion for.
Everything that was true in Python by construction translates into a TypeScript test that is equally
silent, and both suites go green while the two systems differ.

The oracle makes the other claim:

> Given the same fixed corpus, the artefact the Python implementation produces and the artefact the
> TypeScript implementation produces are the same artefact, compared on every byte, including the
> bytes nobody wrote a test about.

### 4.1 The implemented face: `config_digest` byte-identity

`config_digest` is a **persisted** value (design doc section 4). A run records it; a later audit
reads a changed digest as "the catalog moved underneath a run that already happened". A digest that
changed because the implementation language changed would not surface as a failing test — it would
surface as an audit reporting a change that never happened, on every run recorded before the port.

Both halves do the same two things over the same corpus:

1. Build the canonical payload and encode it — `json.dumps(..., sort_keys=True,
   separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")` on one side,
   `canonicalJsonBytes` on the other.
2. Take `sha256` over the bytes.

The Python half writes `parity/oracle/config-digest-vector.json`. `test/domain/digest-oracle.test.ts`
rebuilds the corpus **independently** — `test/oracle/digest-corpus.ts` states it in TypeScript, and
the test asserts the two id lists match before it compares a single byte — then compares the
canonical text, the canonical bytes as hex, and the digest, naming the corpus row in every failure.
A separate case asserts the vector is not vacuous, so a vector regenerated from an empty run cannot
let the comparison pass while comparing nothing.

### 4.2 Regenerating the vector

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/oracle/dump_config_digest.py \
    parity/oracle/config-digest-vector.json
```

No second checkout and no installed package: the script puts `src/` on `sys.path` itself, so a stale
install cannot shadow the implementation being questioned.

### 4.3 What the corpus is for

Two groups, and the split is deliberate.

**Reachable through a catalog file.** Non-ASCII and astral characters in a path, an IDN host, a
non-ASCII base branch, NFC against NFD. Every one of these can arrive from a validated
`config/projects.toml`, and a divergence on any of them would corrupt real data.

**Beyond what the validator admits.** Control characters in a path, aliases outside the identifier
shape. `parse_clone_source` and `parse_identifier` refuse both today, so nothing here reaches
`config_digest` through a file. They are in the corpus anyway, because `config_digest` is a plain
function over a `Project` and the validator is not part of it: a later belt that widens an input, or
a caller that builds a `Project` directly — which the test suite itself does — meets the encoder
without meeting the validator. The cost of finding an encoder divergence *then* is not one bad run.
It is that every digest already written is suspect.

### 4.4 It earned its place immediately

`sorted()` in CPython compares code points. `Array.prototype.sort` compares UTF-16 code units. The
two disagree for any astral character beside one in U+E000..U+FFFF, because a surrogate code unit
(0xD800..) is numerically below U+FFFD while the code point it encodes is above it.

Replacing `sort(compareByCodePoint)` with a bare `sort()` in `src/domain/digest.ts` was measured:
**the thirteen cases ported from `tests/test_digest.py` stay green, and the oracle turns red** on
`alias-sort-crosses-the-surrogate-boundary`. No test translated from that file can see it, because
no project in it has an alias the difference applies to.

## 5. The test suite's own rules

- **Randomised order, twice, at two distinct seeds, no retries** (`D-0006`). The shuffle lives in
  `vitest.config.ts` so a workflow edit cannot retire it; CI injects only the seed, and an unset seed
  under `CI` is a hard error.
- **Node ids preserved.** `test/testkit/parametrize.ts` takes pytest's id verbatim and produces
  `name[id]`, so a target id is a function of the source id rather than of how a translator worded a
  title template.
- **Non-running tests need an approval.** Every `skip`, `todo`, `fails` and `xfail` under `test/`
  is counted per construct per file and must be approved by a ledger, with a reason and an exact
  count. There is no quarantine.
- **ASCII in anything printed** (`D-0007`).

## 6. The testkit

`test/testkit/` is vendored from continuo, minimally. Today that is `parametrize` and nothing else:
continuo's `product` (pytest's stacked-decorator collection order) and its `skipIf`/`xfail` mappings
stay there until a cadenza source file actually needs them. Vendoring machinery for a case that does
not exist yet is how a testkit acquires untested surface.

`test/testkit/testkit.contract.test.ts` pins what is vendored. It is target-only: `parametrize` is
the one piece of machinery the ledger's correctness depends on, and if it stopped spelling ids the
way pytest does, every mapping in every ledger would still reconcile against the new spelling and
nobody would be told.

## 7. Current state

| Source file | Node ids | Functions | Status |
|---|---:|---:|---|
| `tests/test_clone_source.py` | 57 | 35 | inventoried |
| `tests/test_compose.py` | 50 | 39 | inventoried |
| `tests/test_digest.py` | 14 | 8 | **ported** (13 mapped, 1 not-ported) |
| `tests/test_identifiers.py` | 25 | 6 | inventoried |
| `tests/test_import_boundaries.py` | 97 | 9 | inventoried |
| `tests/test_refs.py` | 62 | 6 | inventoried |
| `tests/test_resolve.py` | 11 | 11 | inventoried |
| `tests/test_toml_loader.py` | 14 | 13 | inventoried |
| **Total** | **330** | **127** | |

*Inventoried* means collected as evidence. It is not a commitment to port; the belt that opens a file
writes its ledger then.

Two known traps are recorded here for the belts that will meet them, from the kickoff:

- **The identifier pattern's `\Z`.** `IDENTIFIER_PATTERN` ends `\Z`, not `$`, so `"web\n"` is
  refused. That is deliberate and must survive translation: JavaScript's `$` without the `m` flag
  behaves like `\Z` rather than like Python's `$`, so the naive translation happens to be correct —
  which is exactly why it needs to be recorded rather than rediscovered.
- **`str.isspace()` against `/\s/`.** The two accept different sets. `_parse_git_url` rejects any
  character for which `str.isspace()` is true, and a translation to `/\s/` would change which URLs
  are refused. This belongs to the `tests/test_clone_source.py` belt.
