# The operating surface for the human gate — what cadenza must expose, now that the console is rondo's

Status: **proposed** (design only, propose-only — cadenza#22)
Applies to: nothing in `src/`. This document proposes no code and takes no decision.

This document takes the role `docs/design/conductor.md` and `docs/design/artifact-delivery.md` take
for their issues: it measures, lays out the options, states which one it recommends and why, and
stops. It writes **no `DECISIONS.md` entry**. Every decision it identifies is a row in section 10,
`S-1` .. `S-11`, and each row names the gate that owns it. A sentence below that reads like a
decision is a recommendation that has not been taken, **except where the text says otherwise**,
which it does wherever it bears.

**Measured against.** cadenza `e56d7e7`, rondo `92edb17`, continuo `44f6233`, all read on
2026-09-06. Every claim about another repository carries a path and a line so a later reader can
tell "still true" from "was true in 2026". Section 9 states what would falsify the document.

**Vocabulary.** cadenza says **provider-agnostic** and never *provider-neutral*
(`test/architecture/import-boundaries.test.ts:918-921` fails any module under `src/` containing the
second spelling). **The operating surface** is rondo's name for what #22 calls the console: the
human-facing access point reserved at `src/access/` in rondo and not yet written
(rondo `README.md:26-27,136`, `src/access/local.ts:1-15`). It is deliberately *not* every access
point — rondo also reserves a localhost MCP surface, spoken to by agent sessions, and an obligation
placed on "the operating surface" below is placed on the human-facing half only.

---

## 1. What has moved under this issue, and what survives of it

#22 was written when the answer to "where is the console built" was **cadenza**. Its first operator
comment says so in as many words: *"cadenza hosts that application ... the web surface is cadenza's
outermost adapter layer, alongside the existing `src/adapters/`"*. That premise is gone. **D-0029**
(2026-09-05) put the host application in a third repository, **rondo**, consuming cadenza and
continuo as libraries, and the conductor with it. rondo has since built the reserved layer:
`src/access/` exists, holds one in-process access point and one output escaper, and its header names
the web UI as what will live there (`rondo src/access/local.ts:1-15`, `src/access/console.ts:23-27`).

Three of #22's four "what has to be decided" items have therefore moved or closed:

| #22 open item | Status, measured |
|---|---|
| Which schema the stack runs on | **Closed.** The production schema is what the stack runs on (continuo#82). It is not merely decided: `gate` and `gate_transition` have DDL (`continuo docs/production-schema.md:1218-1312`, `:1330-1375`) and two verbs render them machine-readably (`continuo src/gate/cli.ts:788-798`, schemas `continuo.gate.list/1` and `continuo.gate.show/1` at `:219-220`) |
| Where the delegation record is persisted | **Still open, and still homeless.** continuo declines to design `task` by implication (`docs/production-schema.md:1741-1744`); rondo's store is a named skeleton whose one constructor throws (`rondo src/store/sqlite.ts:48-50`). Section 7 and `S-7` |
| Where "the conversation with the operator" lives | **Still open.** #22's own cross-link says #40 answers it; #40's design document does not. `docs/design/conductor.md` §11 lists seventeen rows and none of them is the conversation, and nothing in any of the three trees persists one. Section 7 and `S-8` |
| Whether this gets scheduled | Not this document's |

**What survives unchanged is the question in the title.** #22 asked "what ports an operating surface
requires", and moving the surface out of cadenza does not dissolve that question — it sharpens it,
because now the answer has a consumer with its own boundary test to satisfy. Sections 4 and 8 are
that answer.

---

## 2. The verbs rondo's entries assign to this surface, and what each one costs

rondo took six of `conductor.md`'s rows at its own gate on 2026-09-05. Two of them name the
operating surface as the **invoker** of a continuo verb, and they are the whole of this surface's
write path today.

**D-0009 — `gate answer` is invoked by the operating surface, not by the conductor**
(`rondo DECISIONS.md:721-841`). Three parts, quoted in the entry's own order: the body reaching
continuo is the one a person typed into that surface; a widening successor contract is issued only
on an answer that surface recorded, with that surface as the issuer; and no approximation counts as
carrying — summarising or reformatting is composing.

**D-0013 — an aborted iteration's open gate is closed `gate close --outcome withdrawn` by the
operating surface** (`rondo DECISIONS.md:1069-1144`). The conductor asks for the close and reports
why; it does not write the outcome.

Both rest on the same measured fact, and it is worth restating in cadenza's own file because two
entries in two repositories depend on it: **continuo derives the actor kind from the verb.**
`answerGate` hard-codes `actorKind: "human"` (`continuo src/gate/operator.ts:672`) and
`closeOpenGate` hard-codes the same (`:1019`). `--actor-id` is required and recorded, and continuo's
own help says what it is worth: *"An identity, not an authority: the gate's admissibility comes from
the transition table, not from this string"* (`continuo src/gate/cli.ts:126-129`). So an agent that
invokes either verb has its own act recorded as a person's, and nothing downstream can tell.
Provenance is a property of the surface that took the keystroke, or it is nothing.

**Three costs of those two rows, which no entry states and which this surface has to absorb.**

1. **`gate answer` has a precondition the surface does not own.** `answerGate` refuses unless the
   gate is at `presented` (`continuo src/gate/operator.ts:645`, `AnswerBodyRequired` /
   `InadmissibleTransitionRefused`), and a gate reaches `presented` only when the `presented`
   relay's outbox row is **acked** — `received -> presented` is the `secretary` edge in the
   transition table (`continuo docs/production-schema.md:1393-1401`), and the ack is recorded under
   `RELAY_ADVANCE_ACTOR_KIND = "secretary"` (`continuo src/gate/operator.ts:99`). A console that
   renders an open gate at `received` therefore cannot answer it, and the three verbs that get it to
   `presented` — `gate present`, `gate deliver`, `gate ack` — **carry no `--json`**
   (`continuo src/gate/cli.ts:800-836`). The surface can answer machine-readably and cannot present
   machine-readably. Row `S-9`.
2. **The presentation channel becomes a duplicate the moment a console exists.** continuo D-0076
   addresses both relays to `external-notify` and assigns the operator a dropbox directory of
   `\uXXXX`-escaped effect files (`GATE_RELAY_RECIPIENT` at `continuo src/gate/operator.ts:81`,
   `DESTINATION_DIR_HELP` at `src/gate/cli.ts:139-146`). A console *is* the presentation. Acking a
   relay nobody delivered would record a delivery that did not happen; not acking it leaves every
   gate unanswerable. Row `S-9` again, and it is continuo's gate, not cadenza's.
3. **The surface is on the critical path of every gate**, which D-0009 states as its own price:
   *"it is not an optional front end that can be deferred behind a CLI"*. That is the strongest
   single argument in section 5 about build order.

**What the surface may *not* do, and it is already mechanical.** `gate close`'s outcome argument is
`choices`-constrained to `OPERATOR_CLOSE_OUTCOMES` — `withdrawn`, `expired`, `unanswerable`
(`continuo src/gate/operator.ts:112-116`, `src/gate/cli.ts:853-867`). `answered_and_forwarded`,
`subject_gone` and `superseded` are refused to any hand. And **answering is compare-and-set, not a
write**, which #22's third operator comment asked for as a requirement: the stage must be
`presented`, and a second answer carrying a *different* body raises `AnswerAlreadyRecorded` rather
than replacing anything (`continuo src/gate/operator.ts:697-702`). Multiple access points are safe
on this verb today, by measurement rather than by promise.

---

## 3. The ownership table, re-derived against three repositories

#22's table had two columns and two repositories. Here it is again with the third, with a
**source-of-truth** column separated from a **read-path** column, because for two rows those are not
the same repository and for one row the read path does not exist.

| What the console renders | Source of truth | Read path today | Owner of the gap |
|---|---|---|---|
| Gates awaiting a human: type, run, stage, age, deadline | continuo `gate` (`production-schema.md:1218-1256`) | `gate list --json` -> `continuo.gate.list/1` (`src/gate/cli.ts:355-366`) | — |
| What passing one means: rationale, options, relays, whole transition history including the verbatim answer | continuo `gate` + `gate_transition` (`:1330-1375`) | `gate show --json` -> `continuo.gate.show/1` (`src/gate/cli.ts:416-445`) | — |
| Run and belt state, `awaiting_user`, the outbox | continuo | **None.** `run` has exactly two verbs, `admit` and `close` (`continuo src/control_plane/run_cli.ts:469,517`); there is no `run list`, no `run show`, no event or outbox verb | continuo (`S-10`) |
| The delegation record: what was delegated, to whom, under what authority | **cadenza mints the value** — `DelegationContract` and its `contract_digest` (`src/domain/contract.ts:74-89`, `src/domain/contract-digest.ts`), the agent-type record and its `agent_type_digest` (`src/domain/agent-type.ts:144-156`) | **None; nothing persists it.** cadenza stores nothing by decision (D-0026 §2); continuo's `task` is an unfilled hole (`production-schema.md:1741-1744`); rondo's store throws (`src/store/sqlite.ts:48-50`) | rondo (`S-7`) |
| Why an action needs approval at all: `allowed` / `needs_approval` / `refused` with its reason and the contract digest | **cadenza**, as a pure value (`src/domain/classification.ts:61-66`) | rondo's facade, in process (`rondo src/cadenza/facade.ts:172-178`) | — |
| Which project, and where each field came from | **cadenza** — `ResolvedProject`, `configDigest`, per-field provenance (`src/domain/project.ts`) | `rondo src/cadenza/facade.ts:116-121` | — |
| The conversation with the operator | Undecided | None | rondo (`S-8`) |

**Three readings of this table matter more than the rows.**

- **cadenza owns two of the seven and neither is a gate.** The console renders cadenza's *values* —
  a contract, a classification, a resolved project — and continuo's *rows*. That is exactly the
  division `src/index.ts:34-38` states: *"There is deliberately no gate API ... the verbs belong to
  continuo."*
- **The two rows with no read path are the two that would tempt somebody to open a database.** rondo
  D-0015 rule 1 keeps continuo behind a CLI process boundary; the run/belt pane is the first thing a
  console wants that the boundary does not serve. `S-10` is where that gets decided, and the wrong
  answer to it is a second reader of continuo's SQLite file.
- **`awaiting_user` does not exist as a name in the current stack.** #22 inherited it from
  interlock's vocabulary. What corresponds today is a gate at stage `presented` and a run whose
  status the console cannot read; that is the same gap as row three, not a separate one.

---

## 4. What cadenza must expose so the surface, not the conductor, is the recorded actor

This is the section the issue's title asks for, and the honest answer has two halves that point in
opposite directions.

### 4.1 For the gate verbs: nothing, and adding anything would be a mistake

The recorded actor on a `gate answer` is a property of `continuo`'s transition table and of who
invoked the verb. cadenza has no part in it: it mints no identity, reads no clock, persists nothing
(D-0026 §2, `DECISIONS.md:1531-1534`), and the barrel says a gate API is deliberately absent
(`src/index.ts:34-38`). rondo's boundary already permits the only arrow needed —
`src/access` may import `src/continuo` (`rondo test/architecture/import-boundaries.test.ts:148`) —
so the surface can invoke the verb without cadenza appearing anywhere on that path.

**A correction this document has to make rather than inherit.** `src/index.ts:35-36` says *"a gate
outcome is an input to {@link classify}"*. Read against the code, that is not literally true today:
`ClassificationContext` is exactly `{ runId, configDigest }` (`src/domain/classification.ts:56-59`)
and no field of `classify()` names a gate, an approval or an outcome. What is true is the weaker and
more useful statement: **a human approval enters cadenza's semantics only as a new contract** — a
widening successor — and never as a field on a classification. Everything in 4.2 follows from that.
The sentence in the barrel is not wrong about the direction of the dependency; it is wrong about the
mechanism, and a reader who takes it literally will go looking for a parameter that does not exist.

### 4.2 For the widening successor: one thing, and its absence is now load-bearing

D-0009 part 2 obliges the surface to be the **issuer** of any widening successor contract. Measured
against cadenza, that obligation currently has nowhere to land:

- `adopt(current, next)` checks lineage, grantee and project, and **deliberately does not refuse
  widening**: *"Whether the issuer held what it granted is the control plane's to establish"*
  (`src/domain/supersession.ts:41-54`, refusals at `:62-95`).
- `issuer` is an opaque identity string on the contract with no actor kind
  (`src/domain/contract.ts:80`, `MAX_IDENTITY_LENGTH` at `:107`).
- rondo's facade imports neither `delegate` nor `adopt`, and says why: *"a successor is composed in
  answer to a human's decision at a gate, and rondo carries a human's answer and never composes
  one (D-0009). Importing them here would put the machinery for that one import away from a loop
  that must not have it"* (`rondo src/cadenza/facade.ts:26-31`).

So today the rule holds by *omission*: rondo cannot issue a widening successor at all. That is a
stable state only until a conductor needs one.

**Half of rondo D-0009's own falsifier has fired.** The entry names it precisely: *"cadenza's
`adopt()` gains an issuer-authority check **and** rondo consumes cadenza. The check alone changes
nothing here: D-0001 records that rondo imports no cadenza code at all ... Both halves together move
part 2 into the library; either half alone leaves it here"* (`rondo DECISIONS.md:826-831`). The
second half fired the next day: **rondo D-0018** (2026-09-06) makes cadenza a consumed library
through the delivery bridge (`rondo DECISIONS.md:2127-2160`, facade granted the package at
`test/architecture/import-boundaries.test.ts:218-230`). The remaining half is cadenza's, and this
document is where it is proposed.

**And there is a boundary collision waiting behind it.** D-0009 part 2 makes *the operating surface*
the issuer, but rondo's layer table refuses `src/access -> src/cadenza` on purpose: *"an access
point that needed a delegation contract would be an access point taking a domain decision"*
(`rondo test/architecture/import-boundaries.test.ts:143-148`). Both statements are rondo's, both are
accepted, and they cannot both be satisfied by a design in which the surface *calls* cadenza. They
can both be satisfied by a design in which **the surface's identity and its recorded decision travel
as data** to whichever layer composes the contract. That constraint, not a preference, is what
picks the shape below.

### 4.3 The recommended shape: one port, one application function, and no new verb

**Recommendation (`S-1`, `S-2`, `S-3`).** Add to cadenza:

1. **A port**, `src/ports/human-decision.ts`, naming a value cadenza cannot compute and will not
   mint — the record that a human decision was taken at a surface:

   ```
   interface HumanDecisionRecord {
     readonly decisionId: string;   // opaque; minted by whoever recorded it
     readonly recordedBy: string;   // the surface's own identity, the contract's issuer
     readonly subject: string;      // the contract_digest the decision was taken about
   }
   ```

   Three opaque strings, validated the way `issuer` and `grantee` already are
   (`MAX_IDENTITY_LENGTH`, `parseIdentifier`). **No HTTP, browser, session, token or gate
   vocabulary** — which is testable form 1 of #22's loose-coupling comment, and section 8 makes it
   mechanical.

2. **An application function**, `supersedeOnDecision(current, input, decision)`, which composes
   `delegationContract(input)` and `adopt(current, next)` and adds exactly one refusal on top:
   `next.issuer` must equal `decision.recordedBy`, and `decision.subject` must equal
   `contractDigest(current)`. A widening whose issuer is not the surface that recorded the decision
   is refused at issue time, in the library, rather than promised in prose.

**Why `adopt()` itself is left alone.** `adopt` is also the initial-adoption path (`current === null`,
`src/domain/supersession.ts:62-71`), it is on the exported surface (`src/index.ts:149-154`), and
D-0026 §2's "the control plane is the enforcer" is a claim about the *classifier and the contract*,
not a prohibition on a composed helper. Putting the check in a new application function keeps every
existing caller's semantics identical, keeps `domain/` free of a port-shaped argument, and makes the
new rule opt-in at the call site — which is what lets rondo adopt it in one commit rather than as a
breaking change. The alternative — the check inside `adopt` — is stated as an option in `S-3`
because it is the shape rondo D-0009's falsifier literally names, and a gate may prefer literal.

**What this does *not* do, said plainly.** It does not authenticate anybody. `recordedBy` is a
string the caller supplies, exactly as `issuer` is today. What it buys is that the *string the
surface recorded* and the *string on the contract* can no longer differ silently — the class of
error where a conductor issues a widening and stamps the surface's name on it is refused by a value
check instead of by a code review. That is the same grade of guarantee cadenza already gives with
the self-issue refusal, and it should be claimed at that grade and no higher.

**The option of doing nothing is real** and is `S-1`'s first alternative: leave cadenza untouched,
and let the rule keep holding by rondo's omission until a conductor needs a widening. Its cost is
that the first widening will be written under deadline, by whoever needs it, in rondo, where D-0009
part 2 is prose.

---

## 5. Layout, auth and reach: what #22 recorded, re-argued against current evidence

### 5.1 Layout A-then-B: the endpoint stands, the build order inverts

#22 settled *"start with A, grow into B"* on the ground that *"both read the same data model, so
promoting A's cards into B's centre column later is a small change rather than a rewrite"*. That
ground still holds. What has changed is **which half has a data model today**:

- **B's centre column ships already.** `gate list --json` returns, per gate, `gate_id`, `gate_type`,
  `run_id`, `stage`, `stage_entered_at_ms`, `deadline_at_ms` (`continuo src/gate/cli.ts:355-366`).
  That is a decision-inbox row, field for field, including the age the inbox sorts by.
- **A's chat has no store anywhere.** No table in continuo's production schema holds a conversation;
  rondo's `IterationRecord` is four fields and its store constructor throws
  (`rondo src/store/records.ts:17-36`, `src/store/sqlite.ts:48-50`); `S-8` records that the question
  is still open. A chat-primary first cut therefore starts by designing and migrating a store, and
  the decision-card path — the part that unblocks a human — comes after it.
- **D-0009 says this surface is on the critical path of every gate.** The first thing built should
  be the thing that is blocking, and the thing that is blocking is answering a gate.

**Recommendation (`S-4`): keep the settled endpoint and invert the order of the first cut.** Build
the gate list, the gate detail, and the two write verbs (`answer`, `close --outcome withdrawn`)
first, because their data exists and their absence blocks the loop; add the conversation pane when
`S-8` is answered. This is not a reversal of #22's direction — B was always the endpoint, and #22's
own reason for A ("one-to-one with today's terminal operation") describes a terminal session that
rondo has not built either. What changes is that the cheap half is now the other one.

### 5.2 OIDC-delegated authentication: keep, and it acquires a mechanical job

#22 recorded *"authentication is delegated, never hand-rolled (OIDC — e.g. Google) ... authorization
stays with the application"*. **Keep**, and the evidence strengthens it into something more specific
than a security preference: continuo records `--actor-id` *on the word of whoever invokes the verb*
(`src/gate/cli.ts:126-129`). The one thing that could make that string mean something is an
identity the surface did not choose. So the recommendation is concrete: **the OIDC subject is what
the surface passes as `--actor-id`, verbatim, and the surface's own identity — not the subject — is
what becomes the contract `issuer`** under 4.3. Those are two different fields answering two
different questions ("who answered" and "which surface recorded it"), and collapsing them would lose
the second.

**Authorization stays with the application, and today there is no application-side authorization for
*people* anywhere in the stack.** cadenza's contract bounds a *run* (`grantee` is a run id,
`src/domain/classification.ts:106-108`); nothing in any of the three repositories bounds a human.
#22's third comment fixes the boundary — *"access points multiply the surfaces through which the
human exercises the discipline, never the set of approvers"* — so the minimum that makes the
sentence true rather than aspirational is an **allowlist of OIDC subjects, of size one for lap 1**,
checked in rondo's application layer before any gate verb is invoked. Row `S-5`.

**One constraint to verify before committing, not asserted here.** Delegated OIDC and LAN-first
interact at the redirect URI: a provider that permits loopback redirects (`http://127.0.0.1`) does
not necessarily permit a plain-HTTP redirect to a LAN address such as `http://192.168.x.x:port`, and
answering a gate from a phone on the LAN is exactly the case that needs the second. This document
has not measured any provider's current policy and does not assert one; `S-5` carries it as a
precondition to check at the gate, because discovering it after the auth adapter is written is the
expensive order.

### 5.3 LAN-first: keep, and it stops being a preference

**Keep, and the argument is now mechanical rather than dispositional.** Every source the console
renders is a local file on the host:

- continuo's control plane is a SQLite database file named by `--db` on every verb
  (`continuo src/gate/cli.ts:117-121`);
- rondo's durable store is `node:sqlite` in one module, on the same host (`rondo D-0005`,
  `src/store/sqlite.ts:1-25`);
- the gate relays are written into a **dropbox directory on disk** (`continuo D-0076`,
  `src/gate/cli.ts:139-146`);
- continuo is driven as a **child process** of the host (`rondo D-0015` rule 1,
  `src/continuo/invoker.ts` granting `node:child_process:spawn` at
  `rondo test/architecture/import-boundaries.test.ts:206`).

There is nothing to reach remotely: the console is a renderer sitting beside its data, and external
exposure would mean exposing a process that spawns child processes and holds a delivery lease.
LAN-first is where the data is. `S-6` asks the one question this leaves: whether the host binds the
LAN interface directly or binds loopback with the LAN reached some other way — a question that
matters because 5.2's redirect constraint hangs off it.

---

## 6. The five testable forms, checked against today's measurements

#22's second operator comment states four testable forms of loose coupling and the third adds a
fifth. Each is checkable now, and two of them are already true by mechanism rather than by promise.

| Form | Status, measured |
|---|---|
| 1. The ports layer expresses approval semantics with no HTTP, browser or session vocabulary | **Holds, and is under-enforced.** Both existing ports are domain nouns (`src/ports/catalog-source.ts:23-59`, `src/ports/path-verifier.ts:71-73`) and the layer's external allowance is empty (`test/.../import-boundaries.test.ts:188`), which already refuses `node:http`. What is *not* checked is a hand-written type named `HttpRequest` with no import. Section 8 |
| 2. Swapping the renderer touches no contract | **Holds today, vacuously** — there is one renderer and it is a terminal escaper (`rondo src/access/console.ts`). It becomes a real claim when the web surface lands beside it in the same layer |
| 3. Widening the adapter allowlist for a web host is confined to the adapter layer | **Holds, and is now rondo's problem rather than cadenza's.** D-0029 moved the host out; cadenza's adapter allowance is still exactly `readFileSync`, `statSync` and `smol-toml` (`test/.../import-boundaries.test.ts:190-192`), and under the recommendation in 4.3 it does not change at all |
| 4. The same discipline is enforceable on every surface | **Holds where it is enforced in continuo** (see form 5) and **not** where it is enforced by placement: D-0009's and D-0013's rules are about *who invokes*, and no test in any repository can see the difference. That is the entry's own stated cost, not a defect found here |
| 5. Answering a gate is compare-and-set, not a write | **Holds by mechanism.** `answerGate` admits only stage `presented` and refuses a second, different answer with `AnswerAlreadyRecorded` (`continuo src/gate/operator.ts:645-702`). Approve from the phone and then from the terminal, and the second one is refused rather than silently winning |

---

## 7. Where the delegation record and the operator conversation are persisted

The brief asks what cadenza *needs* from a store, not how rondo builds one. cadenza needs nothing
persisted for its own sake — it stores nothing by decision, and a contract is reproducible from its
inputs (D-0026 §2, `DECISIONS.md:1531-1534`). What the *console* needs is the ability to answer, for
a run that is standing at a gate, the question #22's table names: **what was delegated, to whom, and
under what authority.** Rendering that requires five values, and the store that holds them is
whoever's `S-7` says:

1. **The contract's fields as issued** — `vocabularyVersion`, `projectId`, `configDigest`, `issuer`,
   `grantee`, `granted`, `askable`, `supersedes` (`src/domain/contract.ts:74-89`). Not a rendering
   of them: the fields, so `contract_digest` can be recomputed and checked rather than trusted.
2. **`contract_digest`** beside them, so a mismatch is detectable rather than theoretical.
3. **`agentTypeId` and `agent_type_digest`.** D-0034 §6 is explicit that these do **not** enter
   `DelegationContract` and are *"run provenance the host persists beside it"*
   (`DECISIONS.md:2633-2638`). If the host does not persist them, "under what policy did it do that"
   stops being answerable — which is the exact property D-0031 §2 created the digest for.
4. **The superseded records themselves.** D-0031 §5 makes agent-type records immutable by minting a
   new one on every edit and assigns durability to the store owner, not to cadenza. A digest detects
   change; it does not hand back the policy a past run used.
5. **The lineage of contracts** (`supersedes` chains), so `adopt()` — and 4.3's issuer check — can be
   replayed against history rather than against the current head only.

**Recommendation (`S-7`): rondo's store.** Not continuo's `task` table: continuo states that neither
`task` nor `assessment` has DDL and that *"they are not designed by implication: the first Issue that
needs them writes their DDL as a migration step"* (`docs/production-schema.md:1741-1744`) — and the
issue that needs them is rondo's, in rondo's ledger, over values rondo mints from a library continuo
does not consume. rondo already owns one SQLite module by decision (`rondo D-0005`) and already has
an outstanding store-schema item that this would join: D-0015 rule 6's per-run continuo revision is
recorded as *"persisting the observed revision per run waits on a store schema"*
(`rondo DECISIONS.md:1236-1237`, `:2072`). Three homeless facts, one schema, one gate.

**The operator conversation (`S-8`) is the same store and a different question.** #22 listed it as
undecided and its own 2026-09-04 cross-link claims #40 answered it; #40's document does not — none of
`conductor.md`'s seventeen rows is the conversation, and nothing persists one. Two things cadenza
needs from whatever answer is taken, and only two: **the conversation must never be the place a gate
answer lives** (the `gate_transition.body` slot is the verbatim answer and a paraphrase in it records
as human approval — `continuo docs/production-schema.md:1378-1383`), and **a message in it is not a
decision record** for 4.3's purposes, so `HumanDecisionRecord.decisionId` must not be a chat message
id unless that id is durable and immutable.

---

## 8. The boundary rule to add, if a cadenza-side port is added

If `S-1` adds `src/ports/human-decision.ts`, the existing tables need **no widening**:
`ALLOWED_BY_LAYER["src/ports"]` is already `["src/domain", "src/ports"]`
(`test/architecture/import-boundaries.test.ts:95-100`) and
`ALLOWED_EXTERNALS_BY_LAYER["src/ports"]` is already `{}` (`:190-193`), which refuses `node:http`,
`node:net` and every package by construction. `src/application/human-decision.ts` is likewise
already covered, and `src/index.ts` gains two names — an addition that D-0033 makes a commitment
rather than a detail (`src/index.ts:25-32`).

What is **not** covered is the failure mode #22's form 1 actually describes: a port that imports
nothing and still speaks HTTP, because the coupling arrived as a hand-written type. The rule to add
is one new parametrized case, in the shape the file already uses for
`no module says provider-neutral` (`:918-921`), but scoped and structural rather than a text sweep:

**"no port names a transport"** — over `src/ports/**` only, parse the module and collect every
**declared name**: interface and type-alias names, their members, enum members, exported function
names and their parameter names. Fail if any of them, lowercased, contains one of a fixed word list:
`http`, `https`, `url`, `uri`, `header`, `cookie`, `session`, `browser`, `socket`, `oidc`, `oauth`,
`jwt`, `bearer`, `token`, `csrf`, `websocket`. Three properties make this the right shape rather than
a bigger grep:

- **Declarations, not source text.** A doc comment that says *"a browser never reaches this layer"*
  is exactly the sentence a boundary reviewer wants to keep, and a text sweep would forbid it. The
  existing `provider-neutral` case can afford to be a text sweep because that string has no
  legitimate use anywhere; these words do.
- **`src/ports` only.** `DelegationRequest` (`src/domain/supersession.ts:34`) contains "request" and
  is not a transport type; the domain is not where the coupling would leak in, because the domain
  has no reason to grow a surface-shaped value at all.
- **It fails closed on the case the allowlists cannot see.** An import-based check cannot catch
  `interface GateAnswerRequest { sessionToken: string }`; this one refuses both words in it.

`S-11` carries the rule, and the word list is the part a gate should actually argue about: it is a
policy, and this document proposes a starting set rather than a complete one.

---

## 9. What would falsify this document

- **§4.2**, if rondo D-0009 is superseded, or if continuo grows a seam that can tell a claimed
  answerer from a proven one. D-0009 names the second as its own falsifier
  (`rondo DECISIONS.md:820-825`); if it fires, the rule moves to where the write happens and the
  issuer check in 4.3 becomes a belt over a stronger mechanism rather than the mechanism.
- **§2 and §3**, the moment continuo grows read verbs for runs, events and the outbox. Row three of
  the ownership table and `S-10` both expire; nothing else in the document depends on their absence.
- **§5.1**, if the operator conversation acquires a store before the gate panes are built. Then A's
  data model exists too, the inversion loses its reason, and #22's recorded order stands unaltered.
- **§5.3**, if any part of the stack stops being host-local — a hosted control plane, a remote
  continuo, a second machine. LAN-first is an argument from where the files are, and it expires with
  that fact rather than with a preference.
- **§7's recommendation**, if continuo writes `task` DDL for a reason of its own. The row moves; what
  cadenza needs from a store does not.
- **§4.1's correction**, if `ClassificationContext` ever grows a gate-outcome field. That would be
  D-0026 §3's totality argument reopened, and it is a `D-` entry rather than an edit to this file.
- **The whole document**, if D-0029 is revisited and the host application returns to this repository.
  Then sections 4 and 8 stop being about a library boundary and become about an adapter layer, which
  is a different design.

---

## 10. The decision rows

Propose-only: this document takes none of these. Per AGENTS.md §6 an issue carrying open decisions is
not started until they are answered. Each row names the gate that owns it, because a row with no
stated gate is a row nobody picks up.

**By gate:** cadenza's — `S-1`, `S-2`, `S-3`, `S-11`. rondo's — `S-4`, `S-5`, `S-6`, `S-7`, `S-8`.
continuo's — `S-9`, `S-10`. The two at continuo's gate are the two this document cannot even
recommend into existence: they are about verbs cadenza has no say in.

| id | Decision | Gate | Recommendation | Reason |
|---|---|---|---|---|
| **S-1** | Does cadenza expose anything at all for the operating surface — a port and an application function (4.3), or nothing, leaving D-0009 part 2 to hold by rondo's omission? | cadenza | **Yes, the minimum in 4.3**: one port and one application function, scoped to the widening successor and to nothing else | Half of rondo D-0009's own falsifier fired at rondo D-0018 (`rondo DECISIONS.md:826-831`, `:2127`), so the remaining half is cadenza's; and rondo cannot satisfy D-0009 part 2 by calling cadenza from the surface, because its layer table refuses `src/access -> src/cadenza` (`rondo test/.../import-boundaries.test.ts:143-148`) |
| **S-2** | What does the human-decision value carry? | cadenza | **Three opaque strings** — `decisionId`, `recordedBy`, `subject` (the predecessor's `contract_digest`) — validated like `issuer`/`grantee` and naming no transport | Anything richer is cadenza modelling a surface it cannot see; anything poorer cannot bind a decision to the contract it authorised. `subject` is what stops a decision taken about one contract from authorising a successor to another |
| **S-3** | Where does the issuer-authority check live — a new `application/` function, or inside `adopt()`? | cadenza | **A new application function**, leaving `adopt()` byte-identical | `adopt` is also the initial-adoption path and is on the exported surface (`src/domain/supersession.ts:62-71`, `src/index.ts:149-154`); a check added there changes every existing caller. The alternative is listed because rondo D-0009's falsifier names `adopt()` literally, and a gate may prefer the literal reading |
| **S-4** | Is the first cut chat-primary (A, as #22 settled) or the decision list (B's centre column)? | rondo | **Keep B as the endpoint and build the gate panes first**: list, detail, `answer`, `close --outcome withdrawn` | B's rows ship today as `continuo.gate.list/1` (`continuo src/gate/cli.ts:355-366`); A's conversation has no store in any repository, and D-0009 puts this surface on the critical path of every gate. #22's reason for A-then-B ("both read the same data model") is unaffected — only which half has one has changed |
| **S-5** | Is the OIDC subject what is passed as continuo's `--actor-id`, and what bounds the set of approvers? | rondo | **Yes, verbatim**, with the *surface's* identity as the contract `issuer` (two fields, two questions); and an **allowlist of OIDC subjects, size one for lap 1**, checked in rondo's application layer. **Precondition to verify first**: whether the chosen provider permits the redirect URI a LAN-reached console needs (5.2) | continuo records the actor id on the caller's word (`src/gate/cli.ts:126-129`), so an identity the surface did not choose is the only thing that makes the field worth reading. #22 fixes that access points never multiply the approver set; an allowlist is the smallest thing that makes that checkable |
| **S-6** | LAN-first: does the host bind the LAN interface, or bind loopback with the LAN reached another way? | rondo | **Keep LAN-first**; decide the binding explicitly, together with `S-5` | Every rendered source is a local file or a child process (5.3), so LAN-first is where the data is rather than a posture — but the binding choice is what determines whether `S-5`'s redirect constraint bites |
| **S-7** | Where is the delegation record persisted? | rondo | **rondo's store**, carrying the five things in §7 | continuo declines to design `task` by implication (`docs/production-schema.md:1741-1744`) and does not consume cadenza; rondo already owns one SQLite module (`D-0005`) and already has an outstanding store-schema item to join (`DECISIONS.md:1236-1237`, `:2072`) |
| **S-8** | Where does the operator conversation live? | rondo | **rondo's store**, and **not** the slot that holds a gate answer | #22 recorded it as undecided and its cross-link says #40 answered it; #40's document does not (none of `conductor.md`'s seventeen rows is the conversation). `gate_transition.body` is the verbatim human answer, and prose in that slot records as approval (`continuo docs/production-schema.md:1378-1383`) |
| **S-9** | Once a console exists, who acks the `presented` relay, and does the dropbox stay a second presentation channel? | continuo | **Not cadenza's to recommend.** Stated because the surface cannot answer a gate without it: `answerGate` admits only stage `presented`, that stage is reached only on the relay's ack, and `gate present` / `deliver` / `ack` carry no `--json` | `continuo src/gate/operator.ts:99,645`, `src/gate/cli.ts:800-836`; D-0076 assigns the dropbox to the operator, and a console makes that channel a duplicate of itself. Acking a relay nobody delivered records a delivery that did not happen |
| **S-10** | How does the console read run and belt state, `awaiting_user` and the outbox? | continuo | **A read verb**, not a second reader of continuo's database | `run` has exactly `admit` and `close` (`continuo src/control_plane/run_cli.ts:469,517`), and rondo D-0015 rule 1 keeps continuo behind a CLI process boundary. The pane with no read path is exactly where somebody opens the SQLite file instead |
| **S-11** | Is the "no port names a transport" case added, and with which word list? | cadenza | **Add it** in the shape §8 describes — declared names under `src/ports/**` only, structural rather than a text sweep — with the sixteen-word starting list as the part to argue about | The import allowlists already refuse `node:http`; what they cannot see is a hand-written `interface GateAnswerRequest { sessionToken: string }`, which is precisely the leak #22's testable form 1 names |

Two things that are **not** decisions here and are recorded so the design does not silently depend on
them: continuo growing an authenticated answerer (which would supersede rondo D-0009 and shrink `S-1`
to a belt), and rondo building the surface at all, which is a scheduling question #22 explicitly
leaves open.
