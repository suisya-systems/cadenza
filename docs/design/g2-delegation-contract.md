# G2 — Delegation contract

Status: accepted (belt scope)
Applies to: `src/domain/` (TypeScript only — there is no Python G2, #25)

This document is the contract for G2, taking for G2 the role
`docs/design/g1-project-registry.md` takes for G1 (D-0001, and D-0026's
Consequences). The code implements what is written here; where the two disagree,
this document is the defect report.

It is **not** a second D-0026. Every fixed point below is D-0026's, cited and
not restated: what this document adds is the implementation D-0026 deliberately
left to the belt — the types, the invariants, the refusal messages and the
digest inputs. Where this document and D-0026 disagree, D-0026 is what was
decided. The argument behind D-0026 — the options weighed, the alternatives
rejected — is `docs/design/g2-delegation-contract-proposal.md`.

## 1. What G2 is

G2 answers exactly one question:

> given a contract, and one action a delegated run intends to take, may the run
> take it unattended, must it ask first, or is it refused?

It answers with one of three values and the `contract_digest` the answer was
computed under (D-0026 §3). Like G1, it is pure data and pure rules: G2 never
mints an identity, never reads a clock, never reaches a network and never
enforces anything. Everything it cannot compute purely — the run identity
presenting a contract, the catalog's current `config_digest`, transport,
durability, and what happens after an answer — is supplied by the caller or is
the control plane's (D-0026 §2).

### Deliberately out of scope in this belt

- **Serialisation at the edge.** D-0026 §2 leaves it unfixed, and Issue #32 makes
  it conditional: it is decided only if the contract cannot be exercised as an
  in-memory value. It can, so the decision waits. There is therefore no wire
  schema and no `schema_version` for a contract *document* here; the only version
  a contract pins is the capability vocabulary's (§3).
- **Enforcement, approval transport, budgets, expiry, gates.** Named as unfixed
  by D-0026 §§1-3 and out of scope by Issue #32.
- **The interlock seam.** `src/adapters/interlock/` stays empty (D-0026 §2), and
  nothing in this belt names a control plane in code.

## 2. Where G2 lives, and why it is all domain

```
src/domain/
  capability.ts       capability keys and the versioned vocabulary   (S3)
  contract.ts         DelegationContract, issue-time validation      (S4)
  contract-digest.ts  contract_digest, over the same path as G1's    (S5)
  classification.ts   classify(): total, three-valued                (S6)
  supersession.ts     adopt() and delegate()                         (S7)
  errors.ts           the refusals, extended                         (S8)
```

Every one of them is `domain`: the inputs are values the caller already holds,
so nothing here needs `application` and nothing needs a port. **If G2 appears to
need a port, that is a falsifier for D-0026 §2 and is raised, not built**
(D-0026 §2, "What would falsify it"; Issue #32, "Constraints carried from the
repository"). The import-boundary test (`test/architecture/import-boundaries.test.ts`,
D-0022) keeps the direction honest either way.

## 3. Capability keys and the vocabulary

The shape of a key, how a contract pins the vocabulary version, and the initial
key set are fixed by **D-0027**, which is the entry D-0026 §1 called for when it
left "the capability vocabulary itself" unfixed. This section states only what
the code does with it.

- A vocabulary **version** is a positive integer. This build knows a frozen set
  of them (`frozenSet`, D-0015 — a `ReadonlySet` is a compile-time claim and this
  one is validation state reachable from the public surface).
- Each known version has a frozen key set. Versions are **cumulative**: version
  `n+1` contains every key of version `n`, unchanged in meaning, plus whatever it
  adds (D-0027).
- A key is recognised **against the version the contract pins**, never against
  the newest the build knows. A contract pinned at version 1 that lists a key
  introduced in version 2 is refused: the alternative is a contract that gains
  meaning it did not have when it was issued, which is the drift D-0026 §1
  refuses ("a later release could widen every contract already issued at an
  unchanged digest").
- Recognition is **exact string equality**. The dot inside a key is a naming
  convention and nothing more: there is no prefix, no hierarchy and no wildcard.
  `repo.clone` does not imply `repo.anything`, and no code may match a key by
  prefix.

## 4. `DelegationContract`

A frozen value (D-0015), constructed only through `delegationContract(...)`,
which validates every rule in §5 before it returns. **There is no route to an
invalid contract**, which is how "classifying against an invalid contract is
`refused`" (D-0026 §3) is realised: the classifier cannot be handed one.

| field | type | meaning |
| --- | --- | --- |
| `vocabularyVersion` | positive integer | the vocabulary this contract's keys are read against (§3) |
| `projectId` | G1 identifier | the subject, by `project_id` and never an alias (D-0026 §1) |
| `configDigest` | `sha256:<64 hex>` | the G1 digest the grant was issued against (G1 §4) |
| `issuer` | identity (§4.1) | who granted it |
| `grantee` | identity (§4.1) | the run it was issued for; it is not a bearer token (D-0026 §1) |
| `granted` | set of keys | may be done unattended |
| `askable` | set of keys | may be asked about; disjoint from `granted` (D-0026 §3) |
| `supersedes` | `sha256:<64 hex>` or `null` | the `contract_digest` this replaces (D-0026 §3) |

`granted` and `askable` are **sets**: they are given as arrays for convenience,
and neither order nor repetition is semantics. The canonical form is sorted by
code point and de-duplicated (`compareByCodePoint`, the same collation G1's
digest uses for aliases), so two contracts written by different generators that
mean the same grant have the same digest.

### 4.1 Identities

`issuer` and `grantee` are **opaque** to cadenza. Cadenza asserts nothing about
who an identity really is — authenticating one is the control plane's at the
edge, and D-0026 §1 leaves authentication and signing unfixed. What cadenza does
fix is the shape, because a contract that carries an empty or whitespace-padded
identity is not a contract that names anybody:

- a string, non-empty, at most 256 characters;
- no ASCII control characters, and no leading or trailing whitespace.

Nothing else. In particular the shape is deliberately not the G1 identifier
shape: run identities are the control plane's to mint (D-0026 §2) and cadenza
does not get to dictate their spelling.

## 5. Issue-time refusals

Every rule below is a **named refusal with its own error type**, carrying what it
refused, in the style G1 §5.6 and §7 fix for the catalog: nothing is a bare
`Error` and nothing is silent. Message text is ASCII (D-0007).

| # | rule | error | source |
| --- | --- | --- | --- |
| 1 | the pinned vocabulary version is one this build does not know | `UnknownVocabularyVersionError` | D-0026 §1 |
| 2 | a key in `granted` or `askable` is not in the pinned version's set | `UnknownCapabilityError` | D-0026 §1 |
| 3 | a key is in both `granted` and `askable` | `OverlappingCapabilityError` | D-0026 §3 |
| 4 | `issuer` or `grantee` is absent or malformed (§4.1) | `InvalidIdentityError` | D-0026 §1 |
| 5 | `issuer` equals `grantee` | `SelfIssuedContractError` | D-0026 §1 |
| 6 | `projectId` is not a G1 identifier | `InvalidIdentifierError` (G1's) | D-0026 §1 |
| 7 | `configDigest` is not `sha256:<64 hex>` | `InvalidDigestError` | D-0026 §1 |
| 8 | `supersedes` is present and is not `sha256:<64 hex>` | `InvalidDigestError` | D-0026 §3 |

Rule 2 names the key **and** the version it was read against, because "unknown
capability" without the version sends the reader looking for a typo when the
actual fault is a contract pinned one version too low.

Rule 3 is the one D-0026 §3 argues for at length: an overlap is the single shape
that would leave an action classifiable two ways, and refusing beats inventing a
precedence at classification time — the same move G1 §5.4 makes for a colliding
namespace.

**Each of these is tested by removing it.** The bar Issue #32 sets is not that
some test goes red when a refusal is deleted; it is that *the test that
reproduces that specific hole* goes red. A refusal whose deletion is caught only
by an unrelated assertion is not covered.

## 6. `contract_digest`

`contractDigest(contract)` is `sha256:<hex>` over the canonical JSON encoding of
the contract's semantics — **the same path `config_digest` takes**, reused and
not re-derived (D-0011, D-0017; Issue #32). `canonicalJsonBytes` is the encoder;
the `sha256:` framing is shared with `configDigest` rather than written twice, so
there is one place where the framing could ever change.

The payload keys are the **wire** spellings, exactly as G1's are and for the same
reason (`src/domain/digest.ts`): a digest is persisted and compared across
parties, so it is not free to be idiomatic.

```
{
  "vocabulary_version": <int>,
  "project_id":         <string>,
  "config_digest":      <string>,
  "issuer":             <string>,
  "grantee":            <string>,
  "granted":            [<key>, ...],   sorted by code point, unique
  "askable":            [<key>, ...],   sorted by code point, unique
  "supersedes":         <string> | null
}
```

Every field of §4 is in the payload, and nothing else is. In particular:

- **`grantee` is in it.** The binding to a run is part of what the contract
  means (D-0026 §1), so two contracts differing only in grantee are two
  contracts.
- **`supersedes` is in it.** Lineage is semantics: "under which contract did it
  do that" is answerable only if the successor's identity covers what it
  replaced (D-0026 §3).
- **`null` is written, not omitted.** An absent key and a null key must not
  collide into one digest.

## 7. Classification

```
classify(contract, action, context) -> Classification
```

- `action`: `{ capability: string }` — a bare key. The finer **action
  vocabulary** (parameters, targets) is left unfixed by D-0026 §3 and stays
  unfixed here: G2 classifies the capability, and the caller says which
  capability its intended action needs.
- `context`: `{ runId: string, configDigest: string }` — the run presenting the
  contract, and the subject's digest **now**. Both are the caller's to supply;
  cadenza mints neither and reads neither from anywhere (D-0026 §2).
- `Classification`: `{ outcome, reason, contractDigest }`, frozen.
  `outcome` is `allowed` | `needs_approval` | `refused`, and `contractDigest` is
  carried on every result, including refusals (D-0026 §3).

The order is fixed, and it is the order D-0026 §3 requires — staleness is
checked before the grant is consulted at all:

| step | condition | outcome | `reason` |
| --- | --- | --- | --- |
| 1 | `context.configDigest !== contract.configDigest` | `refused` | `stale_subject` |
| 2 | `context.runId !== contract.grantee` | `refused` | `grantee_mismatch` |
| 3 | `action.capability` not in the pinned vocabulary | `refused` | `unknown_capability` |
| 4 | in `granted` | `allowed` | `granted` |
| 5 | in `askable` | `needs_approval` | `askable` |
| 6 | otherwise | `refused` | `not_in_contract` |

Steps 1 and 2 both refuse, so their order changes no outcome — only which reason
is reported, and D-0026 §3 says which comes first. Step 3 is a refusal rather
than a thrown error on purpose: `action.capability` is arbitrary caller input,
and a classifier that throws on some inputs is not total. Step 6 is D-0026 §3's
"anything in neither set is `refused` outright and is not escalatable": there is
no path from `not_in_contract` to `needs_approval`, which is what stops a run
escalating its way toward arbitrary authority.

**Totality.** `classify` returns one of exactly three outcomes for every input
and throws for none. The falsifier Issue #32 asks for is a property-style test
over arbitrary `runId` / `capability` / `configDigest` strings — junk, empty,
oversized, non-ASCII, keys that exist in another vocabulary version — asserting
that the result is always a member of the three-value set. A fourth state, or a
throw, is the failure it exists to catch.

**What classification is not.** It does not stop anything. A system that asks
and then ignores the answer is not defended against here (D-0026 §2), and a run
that proceeded because it judged the action harmless acted outside its contract
whether or not the outcome was fine (D-0026 §3).

## 8. Supersession and onward delegation

### 8.1 `adopt(current, next)`

The holder of a contract holds **at most one current contract per run**
(D-0026 §3). That is a structural property here rather than a registry: a holder
is a single value, and replacing it requires naming what is being replaced.

`adopt(current, next)` returns `next`, or refuses:

| rule | error |
| --- | --- |
| `current` is `null` and `next.supersedes` is not `null` | `SupersessionLineageError` |
| `current` is present and `next.supersedes !== contractDigest(current)` | `SupersessionLineageError` |
| `next.grantee !== current.grantee` | `SupersessionSubjectError` |
| `next.projectId !== current.projectId` | `SupersessionSubjectError` |

A successor **may narrow, including to nothing**: `granted` and `askable` both
empty is a valid contract and a valid successor, and it is how authority is
taken back while revocation without a successor stays deferred (D-0026 §1, §3).

A successor **may widen**, and cadenza does not refuse it. Whether the issuer
held what it granted is the control plane's to establish — D-0026 §1's
"authentication is not authorisation" — and cadenza's own checkable share of the
no-amplification rule is the self-issue refusal (§5 rule 5) plus §8.2: a run
cannot widen itself, because a contract it issued to itself does not exist.

### 8.2 `delegate(held, request)`

What a run passes onward carries a **subset** of what it holds (D-0026 §1).
`delegate` builds the sub-contract and refuses anything that is not:

| rule | error |
| --- | --- |
| `request.granted` not a subset of `held.granted` | `AmplifiedGrantError` |
| `request.askable` not a subset of `held.granted ∪ held.askable` | `AmplifiedGrantError` |

The second is deliberately the wider union: turning something the parent may do
unattended into something the child must ask about is a *narrowing*, and
refusing it would be refusing the safe direction. The reverse — a child granted
what its parent may only ask about — is amplification and is refused by the
first rule.

The sub-contract's `issuer` is the delegating run (`held.grantee`), its
`projectId` and `configDigest` are the parent's, and its `supersedes` is `null`:
it opens a new lineage for a new grantee rather than continuing the parent's.
Every §5 rule applies to it as to any other contract, so a run delegating to
itself is refused by rule 5, and disjointness by rule 3.

## 9. Errors

Every refusal above is a typed error in `src/domain/errors.ts`, under the
existing `CadenzaError` root. G1's `CatalogError` carries a file and a key
because the operator fixing one is editing a file; a delegation contract is not
a file in this belt (§1, serialisation is unfixed), so the G2 errors extend
`CadenzaError` directly and carry what they refused — the key, the version, the
identity, the digest — in the message, in ASCII (D-0007).

`InvalidIdentifierError` is reused unchanged for `projectId`: it is the same
identifier shape, from the same G1 rule, and a second error type for it would
say the shape had two meanings.

## 10. Verification

- **Target-only.** Every G2 test file is declared in `parity/target-only.json`
  with its reason: there is no Python G2 and none is coming (#25), so these
  files translate no source case by construction, and `scripts/parity-check.mjs`
  keeps reporting no unmapped entries (D-0009, D-0010).
- **Double green at two seeds** (D-0006), `knip` and `biome` clean, and the
  import-boundary test green — the existing discipline, unchanged.
- **Refusals are shown non-vacuous by removal**, one hole at a time (§5), which
  is the bar AGENTS.md §4 sets for a PR that adds a check.
