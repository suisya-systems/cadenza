# G2 — Delegation contract: design proposal

**Status: accepted, and recorded as D-0026.** This document is the argument;
`DECISIONS.md` D-0026 is the decision, and where the two disagree the entry is
what was decided.

D-0025 set G2's unfreeze condition: G2 opens when a `D-` entry in `DECISIONS.md`
fixes what the delegation contract must express — **the authority model**, **the
seam to a control plane**, and **what a run may do without asking**. This
document is the argument for what that entry should say, and it is kept in the
tree because the entry states the decision while this states the options that
were weighed and what each would have cost. It was written to stop at a
recommendation, since taking the decision is the human gate's — D-0023 holds
that this repository's human gate is the only body deciding cadenza's open
questions — and that recommendation was taken, unchanged, at the gate on
2026-08-31.

Read it in the present tense of a proposal: everything below is phrased as what
the entry *would* fix, because that is what it said when it was decided on.
D-0026 is where to check what it does fix.

Nothing here is implementation. No module, no test and no `src/` file follows
from this document; the belt that implements G2 works against D-0026.

Inputs: cadenza#9, `DECISIONS.md` D-0014 (superseded), D-0023, D-0025,
`docs/design/g1-project-registry.md` §2, §4, §5.6, §8, §9, and interlock's own
open issue #63, "Operating-layer delegation contract", which asked the same
question and left it unanswered (D-0023: a citation, not an answer in transit).

## 0. What the entry has to settle, and what it must not

Three axes, one section each below. Each section states the options that were
actually considered, what each costs, a recommendation, **what the entry would
fix**, and **what the entry would deliberately leave unfixed**. The second list
matters as much as the first: D-0025's risk case is "whoever picks it up invents
the delegation contract as they implement it", and a question that is silently
skipped is invented later just as surely as one that is never asked. Everything
below is either fixed or explicitly named as not fixed.

A note on scale. The contract this proposal describes is a **value**: a document
that says who authorised what, over which project, and where the boundary of
unattended action lies. It is not a scheduler, not a lifecycle, and not a
policy engine. That restraint is the proposal's main claim, and §4 records what
it would take to find it wrong.

## 1. Authority model

> On whose authority does a delegated run act, and how is that authority
> written down?

### Options

**A1 — Enumerated grant.** The contract carries a closed list of capabilities.
Deny by default: a capability that is not listed is not granted, and an
unrecognised capability key refuses the whole contract rather than being
ignored.

**A2 — Named roles.** The contract names a role (interlock v1's
`default` / `self-edit` / `doc-audit`, per interlock#63) and a role table
elsewhere says what the role may do.

**A3 — Predicate policy.** The contract carries rules evaluated at action time
against the state of the run.

### Trade-offs

A2 is the shortest to read and the easiest to get wrong in exactly the way this
repository has already decided against once. A role name in a durable record
means whatever the role table meant *at the time*; read back a month later
against a changed table, the record silently starts describing a different
authority. That is precisely the alias failure §2 of the G1 design rejects —
`project_id` is immutable and durable, aliases are display-only — and interlock#63
names the same drift class from the other side ("prose↔practice drift", the
hardcoded permission-mode mirrors in `registry/org-config.md`). A role is an
alias for an authority.

A3 is the most expressive and the least reconstructable. If the decision depends
on state the granter could not see, then what was authorised cannot be recovered
from the record — and it puts an evaluator, with the I/O and clock an evaluator
needs, inside a layer that G1 keeps pure (§1: "pure data and pure rules").

A1 is verbose, and it needs a capability vocabulary that does not exist yet.
Verbosity is the price of a record that can be read back; the missing vocabulary
is not a blocker, because the closed-set rule means an unknown key is refused
rather than mis-honoured, so the vocabulary can grow one entry at a time without
any older contract changing meaning.

### Recommendation: A1, with A2 admissible only as a rendering

Roles may come back later strictly as sugar: a role expands to a grant *before*
the contract exists, and the contract stores the expansion. The role name may be
recorded as provenance, the way §5.7 records which layer a field came from; it
is never what the contract means. This is the `project_id`/alias split applied to
authority, and it is why A2's convenience can be had later without A2's cost.

### What the entry would fix

- **F1. Authority is exactly the grant.** A delegated run's authority is the
  grant carried by the contract that authorised it. Nothing is authority by
  default, by role name, by convention, by what a neighbouring run was allowed,
  or by the run's own reading of its task. Absent means not granted.
- **F2. Grants are closed.** An unrecognised capability key refuses the contract,
  naming the key — G1 §5.6's rule ("every table is closed") extended to G2, for
  the same reason: a typo that falls back to a default is the failure this
  layer exists to prevent.
- **F3. No amplification.** A run cannot widen its own grant, and anything it
  delegates onward carries a subset of what it holds. Widening happens only by a
  new contract issued by the granter (§3, F15).
- **F4. The subject is pinned by identity and by digest.** The contract names its
  project by `project_id` — never an alias — and pins the `config_digest` (G1 §4)
  the grant was issued against. A catalog that has since moved on makes the
  contract **stale**, and stale is a named, detectable condition rather than a
  silent difference.
- **F4a. A contract is not a bearer token.** It names the **grantee** — the run
  identity it was issued for — and that binding is part of its semantics and so
  of its digest (F6). A contract presented on behalf of any other run classifies
  as `refused`, whatever it says. Without this, an authentic contract copied from
  a neighbouring run would carry its authority across, which is exactly what F1
  denies. The run identity is the control plane's to mint (F9), so issuing a
  contract requires that identity to exist first: the control plane reserves the
  run, then the granter issues against it.
- **F5. The issuer is data, not a claim cadenza checks.** The contract carries an
  issuer identity; a contract without one is refused. Authenticating that
  identity belongs to the control plane at the adapter edge (§2, F8) — cadenza
  fixes the shape and refuses the absence, and asserts nothing about who the
  issuer really was. What the entry does fix is that **authentication is not
  authorisation**: the control plane must establish that the issuer is permitted
  to grant *this* authority over *this* project before a contract is honoured,
  and cadenza's own rules are two — a contract whose issuer is its own grantee is
  refused (no self-issue), and a granter may only pass on what it holds (F3's
  attenuation, applied to the granter as well as the run). How a control plane
  decides who may grant what is its business; that it must decide is not.
- **F6. A contract is a frozen value with a digest.** Once issued it is immutable
  (D-0015), and it carries a `contract_digest` over its semantics, computed the
  way `config_digest` is (G1 §4; D-0011, D-0017 for the technique and its
  oracle). Two parties holding a digest can prove they mean the same contract.

### What the entry would deliberately not fix

- **The capability vocabulary.** Which capabilities exist, and how finely they
  are cut, is the first implementation belt's work. What is fixed, and what makes
  deferring the rest safe, is F2 plus **F2a: a capability key's meaning is
  permanent.** A key is never redefined, broadened or reused for something else —
  a wider power is a new key — and the contract pins the vocabulary version it
  was written against, refusing a version this build does not know, exactly as
  G1 §5.2 does for `schema_version`. Without F2a, a later release could broaden a
  recognised key and silently widen every contract already issued, at an
  unchanged digest: the A2 drift this proposal rejects, arriving by another door.
- **Whether role presets exist**, and their names, if they are ever added as the
  rendering described above.
- **How issuer identity is authenticated**, and whether contracts are ever signed.
  The same goes for the grantee side of F4a: cadenza compares the run identity it
  is given against the one the contract names, and *proving* that the presenting
  run is that run is the control plane's job at the edge (F5, F10).
- **Whether an unbound template exists** — a grant written before any run is
  reserved, bound to a run identity at issue time. F4a fixes that the *contract*
  is bound; whether the granter may author one earlier in a weaker form is left
  to the belt that wants it.
- **What follows a stale contract (F4) operationally** — whether the granter
  reissues automatically, and how an operator is told. What is *not* left open is
  the classification: **a stale contract is invalid, and classification against
  an invalid contract is `refused`.** Staleness is checked before the grant is
  consulted at all, so F12's exactly-one rule holds without the implementation
  inventing a precedence. Refusing rather than asking is the conservative reading
  and the one this repository already takes when a record no longer matches what
  it was written against (G1 §5.2, an unknown `schema_version` is refused
  for that file rather than guessed at); what happens next is the granter's move,
  not the classifier's.
- **Expiry, and revocation without a successor.** Supersession (F15) *is* the
  supported way a contract stops being current, and a successor is not obliged to
  preserve what it replaces: narrowing, and narrowing to nothing, are how
  authority is taken back. What is not fixed is the case with no successor to
  issue — a granter withdrawing a contract out of band, and a contract lapsing
  with time. Both need something F15 does not provide (a signal that is not
  itself a contract, and a clock cadenza does not have, F9), and the belt that
  needs either writes it. Named here so the gap is recorded rather than
  discovered.

## 2. The seam to a control plane

> Where does cadenza stop and the durable control plane start?

### Options

**S1 — Outbound ports.** Cadenza defines ports (journal, approval broker) that a
control plane implements, and calls out during a run.

**S2 — Inbound only.** The control plane calls cadenza; cadenza is a pure
decision library returning values. Run identity, time, durability and transport
are the caller's.

**S3 — Shared durable schema.** Cadenza and the control plane share rows.

### Trade-offs

S3 is refused on sight by G1 §9 and README: interlock's control-plane API and
SQLite schema are marked throwaway on interlock's own side (interlock D-0026),
and interlock is frozen, so sharing a schema converts a spike into a dependency
by inertia with no stabilisation coming.

S1 reads naturally if you picture cadenza as the orchestrator, and it requires
cadenza to hold a lifecycle, a clock and I/O. Worse, every port shape is a guess
about a control plane cadenza has explicitly not chosen (D-0023). The empty
`adapters/interlock/` seam exists so that the first real integration is a new
file in an agreed place — not a set of interfaces designed against a repository
nobody has committed to.

S2 is what G1 already is: "G1 records *intent*; carrying it out belongs to a
run-side adapter" (§1, "Deliberately out of scope"). It makes the seam a **data
contract** rather than an API, which is the only kind of seam that can be
specified without naming the party on the other side.

### Recommendation: S2

### What the entry would fix

- **F7. The seam is a document and its digest, not an API.** Cadenza produces and
  validates delegation contracts and classifications as values. The control plane
  transports them, stores them, and enforces them.
- **F8. The dependency points inward.** A control plane may depend on cadenza;
  cadenza takes no dependency on one — no import, no package requirement, no
  extra. This is the existing rule and its existing scope: what is prohibited is
  the import and the inward-only direction (G1 §8,
  `tests/test_import_boundaries.py`, D-0022's TypeScript counterpart), not the
  mention. Naming a control plane in prose, or reserving an empty adapter
  directory for one (F11), is not a dependency and stays permitted; G2 earns no
  exception to the part that is.
- **F9. What cadenza cannot compute purely is an input.** Run identity, session
  identity, wall-clock time, randomness, durability and retry are supplied by the
  caller. Cadenza never mints a run id and never reads a clock — so a contract is
  reproducible from its inputs, which is what makes F6's digest worth having.
- **F10. The contract is the authority; the control plane is the enforcer.**
  Cadenza classifies an *intended* action against a contract and returns the
  classification. It does not stop anything, and a system that consults it and
  then ignores the answer is not defended against here.
- **F11. `adapters/interlock/` stays empty.** G2 does not open the interlock seam.
  Whether a delegated run ever reaches interlock specifically is a separate
  decision, taken here when someone needs the answer rather than waited on
  elsewhere (D-0023), and this entry is not it.

### What the entry would deliberately not fix

- **Serialisation at the edge** — TOML, JSON, or a row in someone's table. F6
  fixes that the digest is over semantics, which is what keeps the choice free
  (G1 §4: provenance and file paths are excluded from the digest).
- **The event or journal schema**, and whether cadenza has any say in it.
- **Whether the control plane is ever interlock.**
- **Gate management (G3).** A gate outcome is an input to a classification, and
  what gates are and how they are run is not settled by this entry.

## 3. What a run may do without asking

> Where is the boundary of unattended action, and what happens at it?

### Options

**B1 — Binary.** Inside the grant, act; outside it, refuse. Nothing is askable.

**B2 — Three-valued.** `allowed` / `needs_approval` / `refused`, with a bounded
escalation for the middle.

**B3 — Budgeted.** Counters — actions, review rounds, elapsed time — consumed
from inside the grant.

### Trade-offs

B1 is the most auditable shape and the least survivable one. Every real
delegation meets a case that is neither clearly granted nor clearly forbidden,
and if the only escape is reissuing the contract by hand, the actual practice
becomes issuing a very wide grant up front — the exact failure the bound exists
to prevent. B1's simplicity converts into over-grant by pressure.

B3 is not a third shape; it is a refinement of whichever shape is chosen, and it
needs counters — state and time — which by F9 are not cadenza's. It stays
available on top of B2 later.

B2 names the middle explicitly, and the middle is the thing D-0025 asks to be
fixed: "what a run may do without asking" only has a meaning if asking is a
defined move.

### Recommendation: B2

### What the entry would fix

- **F12. Three outcomes, and the classification is total.** Every intended action
  classifies as exactly one of `allowed`, `needs_approval`, `refused`. There is no
  fourth state, and there is no rule anywhere that turns "not classified" into
  "allowed".
- **F13. The boundary is the contract's, not the run's.** A run does not judge
  when to ask; it asks exactly when the classification says `needs_approval`. A
  run that proceeded because it judged the action harmless acted outside its
  contract, and the outcome being fine does not change that.
- **F14. Silence is not consent.** An unanswered `needs_approval` is not a
  proceed. The run stalls or ends; no timeout, backoff or retry converts asking
  into permission.
- **F15. An approval is a new contract, not a widening of the running one.** The
  granter issues a superseding contract with its own digest, and the run
  continues under it. A contract is never mutated in flight (F6, D-0015).
  Immutability alone does not make "under which contract did it do that"
  answerable, though — a run that has been granted twice holds two contracts that
  may both authorise the same later action — so three things go with it: **the
  superseding contract names the `contract_digest` of the one it replaces**, so
  the chain back to the first grant is walkable; **at most one contract is
  current for a run at a time**, and the successor's arrival ends its
  predecessor's currency; and **every classification carries the
  `contract_digest` it was made under**, so the record of what a run did cites
  the contract rather than leaving it to be inferred. With revocation deferred
  (§1), supersession is the only way a contract stops being current, which is
  precisely why the lineage has to be explicit rather than reconstructed — and
  why a successor is *not* required to widen: an approval is the case that
  motivates F15, but a granter narrowing a run's authority, to nothing if it
  chooses, issues a successor the same way.
- **F16. Asking is itself bounded.** The contract declares what is *askable*
  alongside what is granted. **The two sets are disjoint, and a contract that
  lists the same capability in both is refused** — an overlap is the one shape
  that would leave an action classifiable two ways and so break F12's
  exactly-one rule, and refusing it at issue time beats inventing a precedence
  at classification time (G1 §5.4 refuses a colliding namespace for the same
  reason). Anything in neither set is `refused` outright and is
  not escalatable, so a run cannot escalate its way toward arbitrary authority
  and no approver is ever presented with a request the contract did not
  anticipate.

### What the entry would deliberately not fix

- **Budgets** — counters, review-round limits, elapsed-time bounds (B3). Left to
  a later belt, on top of B2 rather than instead of it.
- **Who approves** — human, automated, or a quorum. F14 and F15 hold whichever
  it is.
- **Escalation transport and timeout values.** Only the meaning of a timeout is
  fixed, by F14: never yes.
- **The action vocabulary** being classified, for the same reason as the
  capability vocabulary in §1.

## 4. What would falsify this, if it is taken

The entry would carry these; they are the observations that would show the shape
was wrong rather than merely incomplete.

- **Against F1/F3 (static grant).** A run whose correct authority genuinely cannot
  be enumerated at issue time, because it depends on state only visible mid-run.
  That would mean A3's predicate policy was the right shape and the enumerated
  grant is a lie told at issue time.
- **Against F9 (purity).** A contract that cannot be produced without cadenza
  reading a clock, minting an identity, or calling a control plane. That would
  mean S1's outbound ports were needed and the seam is an API after all.
- **Against F12 (totality).** An action that is genuinely required by ordinary
  work and is expressible neither as a grant entry nor as an askable escalation —
  so the classification forces either a refusal that blocks the work or a grant
  so wide it stops being a bound.
- **Against F15 (supersession).** Approvals answered in practice by editing the
  live contract because reissuing costs too much. That would mean either the rule
  is unworkable or the contract is too large a unit to be the thing reissued.
- **Against the gate itself (D-0025's own falsifier).** This entry existing, with
  G2 still unable to open. That would mean the condition was met and something
  else is blocking, making D-0025's choice of gate wrong rather than unmet.

## 5. Consistency with the existing record

| This proposal | Rests on |
|---|---|
| F4 (`project_id`, never an alias), F4a (bound to its grantee) | G1 §2 — identity is split so a durable record cannot drift |
| F6 (`contract_digest` over semantics) | G1 §4; D-0011, D-0017 for the digest and its oracle |
| F2 (unknown key refuses), F16 (grant and askable disjoint) | G1 §5.6 — every table is closed; §5.4 — a colliding namespace is refused, not resolved by precedence |
| F6, F15 (frozen, superseded not mutated) | D-0015 — value objects are snapshotted and frozen |
| F8, F11 (inward only, empty seam) | G1 §8, §9; D-0023; `tests/test_import_boundaries.py`, D-0022 |
| F5, F9, F10 (cadenza decides, others act) | G1 §1 — pure data and pure rules; intent recorded, not carried out |
| The entry existing at all | D-0025 — this is the condition it set |

Nothing above contradicts an accepted entry, and nothing above supersedes one.
If it is taken, the new entry is the next free ID, `D-0026`, and it names D-0025
as required by cadenza#9's acceptance criterion. cadenza#9 and README's G2
bullet would then be updated to point at it, as D-0025 did for its own.

## 6. If the recommendation is approved

The `D-0026` entry writes up §1–§4 in this file's usual form: decision, why, what
it deliberately does not fix, consequences, falsifier, source. It does not add
code. G2 implementation — a capability vocabulary, a contract type, a
classifier — is the belt that follows the entry, and is out of scope for the
task that produced this proposal.

Should the gate prefer a different option on any axis, the three are independent:
choosing A2, S1 or B1 changes that section only, though S1 would make F9 and F10
untenable and would want the whole of §2 rewritten rather than amended.
