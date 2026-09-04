# Conductor — the front agent that turns a one-line request into continuo runs

Status: **proposed** (design only, propose-only — cadenza#40, widening cadenza#22)
Applies to: nothing in `src/` yet. This document proposes no code and takes no decision.

This document is a proposal, not a contract. It takes the role
`docs/design/g2-delegation-contract-proposal.md` takes for G2: it lays out the options, states which
one it recommends and why, and stops. Every decision it identifies is listed in section 11 and is
cadenza's human gate's to take (D-0023). A reader who finds a sentence here that reads like a
decision should read it as a recommendation that has not yet been taken — **with one exception, and
the text says so wherever it bears**: **C-17** was taken at the human gate on 2026-09-05 and is
recorded as **D-0029** — the host application is a third repository, **rondo**, consuming cadenza and
continuo as libraries. The entry is the decision; this document is updated to it, and creates no
`D-` entry of its own. The other sixteen rows are still open.

**Measured against.** cadenza `9220acb`, continuo `6529085`, `happy-ryo/loop-agent` `d03e29f`,
claude-org-ja `6889d66`, all read on 2026-09-05. Every claim about another repository below carries
a path so a later reader can tell "still true" from "was true in 2026". Section 12 states what would
falsify the document as a whole.

**A vocabulary rule that is mechanical, not stylistic.** cadenza says **provider-agnostic** and never
**provider-neutral**: `test/architecture/import-boundaries.test.ts:932-935` fails any module under
`src/` whose text contains the second phrase, and D-0022 records that string as one of the fourteen
planted violations the boundary check was validated against. continuo's D-0059 uses the other
spelling. This document therefore writes *provider-agnostic* everywhere in its own voice and reserves
*provider-neutral* for quotations from continuo.

---

## 1. What the conductor is

**Definition.** The conductor is a front agent that owns a whole task loop while keeping the human's
contact surface to two points: **the initial one-line request**, and **yes/no answers at gates**
(judgment calls and merge). It turns "do X" into admitted continuo runs and turns what comes back
into a gate decision and a merge decision.

It is the successor of claude-org-ja's secretary + dispatcher + `/org-conveyor` belt, re-expressed on
continuo's verbs instead of on terminal panes. The decision that it is built on cadenza was taken
with the human on 2026-09-04 and is recorded in cadenza#40; this document assumes it and does not
re-argue it. It is, however, a settled design question living only in an issue, which AGENTS.md §3
says belongs in `DECISIONS.md` — ratifying it as an entry is decision **C-12**, and this document
names it rather than writing it. What that decision settled is **whose semantics the conductor is
built on**: cadenza's registry, contract and gates. It did not settle **which repository holds the
code**, which continuo's own premise 2 recorded as a working assumption and which this document
raised as **C-17** (§9.3).

**C-17 is now decided (D-0029).** The conductor lives in **rondo**, a third repository — the host
application — that consumes cadenza and continuo as libraries. Everything below about *what* the
conductor is and does is unchanged by that; what changes is where the modules sit (§2.3), how the
consumption question is framed (§9), and which of the other rows survive (§11). The 2026-09-04
decision is untouched: rondo is built on cadenza's semantics.

**What the conductor is not, in this design.**

- It does not merge, ever. Merge is a per-item human gate — the belt's INV-1
  (`.claude/skills/org-conveyor/SKILL.md:69-72`) carried across unchanged.
- It does not author the body of a human's gate answer. It may carry one verbatim; see §6.5.
- It does not reach below continuo's control-plane seam. It never imports a session backend, never
  names a model, and never renders a fence. See §2.
- It holds no push credentials in lap 1. See §6.6.
- It is not an enforcement layer. cadenza classifies; it does not stop anything
  (`docs/design/g2-delegation-contract.md:326-329`), and the conductor inherits that.

---

## 2. Where the conductor sits, and the honest Claude-independence claim

cadenza#40's second comment requires that the conductor and the agent types it selects **must not
depend on Claude**, and its third comment corrects where the seam is: continuo's `SessionProvider`
already exists (continuo D-0059, `src/lap/root.ts`), and the conductor sits above it and never
reaches below.

Both are right about the destination. The measurement behind them needs one correction, because the
design would otherwise claim a property the stack does not have.

### 2.1 What is actually proven

continuo's `test/gate_item11/no-provider-detail-leaks.test.ts` is a **static import-graph test**: it
parses every `.ts` file under a root with `importedModules()` from `test/testkit/ast.ts`, follows
every import form including `import type` and dynamic `import()`, and asserts an **empty** list of
shipped modules that know both a session backend and the control plane:

```ts
expect(both, `${JSON.stringify(both)} would have to be edited by a provider swap`).toEqual([]);
```

(`no-provider-detail-leaks.test.ts:210-226`.) `src/session/provider.js` — the contract — is
explicitly excluded from "knowing a session backend" (`:162-164`), which is exactly what lets
`root.ts` import `SessionProvider` alongside the whole control plane and stay legal. `src/index.ts`
is the single allowlisted barrel (`:31-36`, `:86`).

So the proven claim is precise and worth having: **continuo's control plane is provider-agnostic,
and the measured cost of a provider swap is one file.** That is a property cadenza can build on, and
it is the same *kind* of property as cadenza's own `import-boundaries.test.ts` — an AST parse over a
walked module set, with a non-vacuity guard, rather than a lint rule (D-0022).

### 2.2 What is not proven, and must not be claimed

The **lap** — materialiser, fence, report ingress, CLI — is not provider-agnostic, and continuo has
never claimed it is. Eight Claude-shaped facts sit above or beside the session seam:

| Where | What is Claude-shaped |
|---|---|
| `src/workspace/materializer.ts:628-633` | `FENCE_OWNED_FLAGS` = `--settings`, `--permission-mode`, `--mcp-config`, `--setting-sources`, `--strict-mcp-config` — Claude Code CLI flags, owned by the materialiser and not by the provider (`:610-616`) |
| `src/workspace/materializer.ts:160,164` | `settings.local.json` and `mcp.json` — two Claude Code file formats named above the seam |
| `src/control_plane/lap_run_intent.ts:207-214` | `prompt` and `cli_args` are durable `PAYLOAD_KEYS` in the delegation record: "an admitted run carries a list of CLI arguments" is persisted in SQLite at admission |
| `src/control_plane/report_ingress.ts:94-105, 274-281` | `subtype`, `isError`, `returncode`, `terminalReason` — stream-json field names, written into the escalation event a human reads |
| `src/control_plane/report_ingress.ts:259-265` | `if (fact.isError) … no gate is opened` — gate-opening **policy** keyed on a Claude-CLI boolean |
| `src/lap/root.ts:72-79, 147-149` | `readTerminalReport` is **not on the `SessionProvider` contract** (continuo D-0056); `root.ts` re-declares `TerminalReportReader` structurally, and `lap/cli.ts:382` passes the same object as both provider and reader |
| `src/supervisor.ts:327` | `providerName ?? "claude-cli"` — a defaulted Claude string written into the session row and compared on recovery (`:802-811`) |
| `src/lap/cli.ts:490-500` | three **required** Claude/interlock-named flags on the operator surface itself: `--claude-command`, `--interlock-root`, `--claude-org-path` |
| `src/fencing/hook.mjs:117`, `src/fencing/roles.json` | the fence is a Claude Code `PreToolUse` hook whose blocking convention is `exit 2`, over rules written in Claude Code's own permission grammar (`Bash(git push *)`, `^mcp__claude-peers__`, `permission_modes: ["default","plan","acceptEdits"]`) |

The last row is the load-bearing one. The fence is not a serialisation format that a second executor
could be handed in a different shape; it is an **enforcement mechanism whose threat model is
tool-call interception**. An executor that does not intercept tool calls cannot be fenced by
re-rendering `roles.json` at all. continuo D-0217/D-0059 make the fence — not the provider — the
reason the lap is a single process.

And the substitution evidence is static, not behavioural: the S3 stub
(`LocalProcessSessionProvider`) is not a `TerminalReportReader`, so **no test today drives a lap to a
gate on a second executor**. The control-plane half is substituted; the lap half is not.

### 2.3 The claim this design makes instead

> The conductor sits above continuo's **control-plane** seam. What it names are runs, gates,
> contracts and agent types. Its `domain`, `application` and `ports` modules — **rondo's**, since
> D-0029 puts the conductor there — never name a session backend, a model, a CLI flag, a settings
> file or a fence rule. Its single continuo-invocation adapter necessarily does: on the CLI route
> `lap perform` *requires* `--claude-command`, `--interlock-root` and `--claude-org-path`
> (`src/lap/cli.ts:490-500`), the library route's own shape is unmeasured here and is not claimed to
> be narrower, and **C-6** makes an allowlist of `--cli-arg` spellings the conductor's own property
> either way.
>
> "How a turn is executed and fenced" is **one bundled replaceable unit** — the `SessionProvider`
> implementation, the fence renderer, the terminal-report fact vocabulary *and* rondo's
> continuo-invocation adapter — not "the provider alone". Swapping the executor changes that bundle.
> It must not change the G2 delegation contract, the gate, `classify()`, or the agent-type
> definitions.

That is a claim cadenza can defend with a test it owns (§8), and it is weaker than "swapping the
executor changes only the renderer" in exactly the way the evidence requires.

Two consequences follow immediately, and both become open decisions:

- **The `--cli-arg` door.** `requireCliArgs` refuses an admitted `--cli-arg` only when it repeats one
  of `FENCE_OWNED_FLAGS`. `--dangerously-skip-permissions`, `--allowedTools`, `--disallowedTools` and
  `--add-dir` are **not** on that list (continuo#133, "open by construction"). A conductor that
  composes `run admit --cli-arg` freely is a documented-verb path that can make the human gate
  advisory — this document's own inference from `materializer.ts:628-634`, not a continuo statement.

  **The allowlist this document proposes is empty.** Not "small": empty. Every `--cli-arg` the
  dogfood needed was a workaround for a fence defect that has since been fixed — F-1's
  `--setting-sources ''` / `--strict-mcp-config` and F-2's hand-passed
  `--allowedTools Edit,Write,...` were both closed by continuo D-0081 (continuo#119, #120), and lap 3
  went through at `aa87f35` with no `--cli-arg` at all (`lap-1-dogfood.md:646-745`). So the
  conductor admits runs with **no** `--cli-arg`, and adding a first entry is its own decision with
  its own reason, taken at cadenza's gate rather than by whoever writes the adapter. Three spellings
  are refused outright and permanently, because each one disables the fence the human gate rests on:
  `--dangerously-skip-permissions`, `--allowedTools` / `--disallowedTools`, and `--add-dir`.
  Decision **C-6**.
- **The seam's own hole.** continuo D-0059 records that `root.ts` *cannot* pre-reject an intent whose
  `cliArgs` carry a provider-owned flag, because reading that list would import a backend; such a run
  spends its identifier and recovery is a fresh run id. Closing it means the session contract gaining
  a "would you accept these settings" question — an S1 change continuo D-0059 records rather than
  takes. The first thing a second executor needs is therefore a change *to the seam*, and the
  conductor cannot supply it. This document records it as a continuo-side
  precondition, not as cadenza work.

---

## 3. The belt maps onto the conductor, with two cells that are not verbs

`/org-conveyor` is a thin orchestrator that owns four things — the approval-scope contract, the
completion-driven loop and its backpressure, observability, and mechanical exit conditions — and
delegates every mechanism to another skill (`SKILL.md:46-48`). The conductor keeps all four and
re-expresses them on continuo verbs. Where continuo has no expression, the cell says so rather than
naming a verb that would not do the job.

| claude-org-ja belt (`/org-conveyor`) | cadenza conductor |
|---|---|
| receives a scope approval from the human, written to `.state/conveyor/scope-contract.md` as a structured contract with fixed keys (`references/scope-contract.md:40-70`) | receives scope + gate answers through the #22 operating surface. The scope contract's authority half becomes a **G2 `DelegationContract`** (§7); its budget half stays operator policy |
| triage → dispatch → verify → push → PR → CI, completion-driven | `run admit` → `lap perform` → `gate present/deliver/ack/answer/deliver/ack` → the operator's manual publish leg, per run |
| stops at every merge gate (INV-1) | stops when the gate reaches `answered_and_forwarded`, and again before publish. Merge is never pre-approvable |
| halts on out-of-scope / judgment boundary / exit condition (INV-2, five conditions with defaults `codex_round_max=3`, `false_positive_streak_max=2`) | refuses admission when `classify()` returns `refused`; **asks** when it returns `needs_approval` (§6.1); halts on its own no-progress signature (§6.3) |
| never automates merge (INV-6) | same |
| escalations go to the human, never answered by the secretary (INV-3) | the escalation **is** the gate: `report_ingress` opens a `worker_escalation` gate from the turn's terminal report (continuo D-0056), and only a human may take the `presented -> answered` edge (`gates.ts:213-219`) |
| **free-pane accounting as the parallelism budget**, `max_parallel = free panes at launch`, counted with `list_panes` or `plan.capacity.free_worker_slots` | **no continuo counterpart.** A lease says which orchestrator life holds a resource, not how many more runs may start (`minimal-operating-loop.md:891-898`; `lap_run_intent.ts:245-253` names the field `leaseClaimantId` precisely so the word `holder` cannot be read as authority). The conductor either keeps its own capacity ledger on cadenza's side or admits one run at a time. §6.7 recommends the latter for lap 1 |
| **merge as natural backpressure** — the human's merge frees a pane, which admits the next candidate | **no continuo counterpart.** continuo cannot observe a merge: `ci_observation` stays empty and `run_pr_link` is hand-written or absent (`minimal-operating-loop.md:255`). The belt's self-jamming property is lost and must be replaced by an explicit cap |
| **mid-run intervention** — `inspect_pane`, `send_keys(["Escape"])`, retarget, and ultracode arming, which requires a typed standalone token and is provably not armed by a brief file or a message body (`org-delegate/SKILL.md:96-100, :389`) | **no continuo counterpart.** The worker is turn-shaped: `StartRequest` is `{sessionId, workspace, role, settings}` with no delivery channel, the child spawns with `stdin: "ignore"`, and the turn ends when L4 ingests its terminal report (`minimal-operating-loop.md:607`). The conductor's only intervention is *let the turn end and admit another run* |
| push / `gh pr create` / `pr-watch`, pre-approved by the scope contract | **the operator, by hand, with their own credentials.** continuo executes no git and no GitHub call anywhere — `gh pr` appears once in the tree, as a permission string (`minimal-operating-loop.md:413-415`) |
| observability: a `TaskList` summary pushed into the secretary's terminal (`SKILL.md:187-212`) | a rendering question for #22, not a continuo query. `gate list` enumerates open gates; it does not hold belt state, and the false-positive counter has no durable home in continuo (`minimal-operating-loop.md:378`, "the lap's events have no vocabulary and no producer") |

The two rows the design refuses to fill with a verb — **capacity accounting** and **mid-run
intervention** — are both properties of a terminal pane with a human in front of it. Writing a
continuo verb into either cell would be the document lying about a mechanism, which is the failure
D-0001 exists to prevent.

---

## 4. loop-agent maps onto the conductor, with one row that is a slot rather than a capability

The conductor's inner loop is loop-agent's cycle — in `loop.py`'s actual order,
gather → gate → act → review → verify → record, with stop conditions evaluated at the **top** of each
iteration (`loop.py:1052-1058`) — run *by* the conductor rather than written by a worker.

| loop-agent element | conductor | honest status |
|---|---|---|
| `gather` | make the one-liner concrete from the G1 registry, issues and prior decisions; ask back with options when the contract does not resolve it | **real, but empty.** `LapRunIntent` / `readLapRunIntent` give the gathered context a durable home, but continuo supplies no scheduler; fair scheduling is the caller's job |
| `gate.review` (`ActionGate.review(context, state) -> GateReview`, `loop.py:707-710`) | the ask-back verb (§6.1) | **shape differs and the document must say so.** loop-agent's gate fires **before** `act` so an irreversible action can be prevented (`loop.py:693-696`); continuo's gate opens **after** the turn, over what the worker already did. Both are "a human decides"; only one is an interlock |
| `act` | `run admit` then `lap perform` — the worker is spawned under continuo's fence | **real.** `performLap(connection, provider, reader, request) -> Promise<LapOutcome>` is a single provider-agnostic entry point (`root.ts:963-968`), which is exactly an `ActHook` |
| `review` | the Codex gate, and any reviewer the agent type names | **the conductor's own.** continuo has no reviewer |
| `verify` | **a slot the conductor must fill**, not a continuo capability | **the dishonest row if left unqualified.** See below |
| `HumanGate` | continuo's gate verbs, surfaced through #22 | **real and best-supported.** `gate list/show/present/deliver/ack/answer/close/reconcile` exist; the close vocabulary is closed; a human is the only admissible actor on `presented -> answered` |
| `NoProgress` | belt exit conditions → halt | **real as a mechanism, but it will silently never fire on the obvious key.** See §6.3 |

**Why `verify` is a slot.** `VerifyOutcome.goal_met` is a ground-truth verdict on the artifact —
loop-agent's own docs are emphatic ("`verify` determines success. `act` … cannot declare the task
complete by assertion alone", `docs/recipes/self-maintenance.md:77`). What one continuo lap returns
is `LapOutcome` (`root.ts:909-948`), whose completion-shaped fields are `report: LapTerminalReport`
(the worker's prose plus a process exit status) and `ingested: IngestedReport` (`eventSeq`,
`eventId`, `gateId`, `duplicate`, `gateOpened`). **Neither carries a verdict.** `report_ingress` says
so in its own words: its deterministic judgement answers *"is this an escalation"*, and
keyword-sniffing the worker's prose for success is the one thing it refuses to do
(`report_ingress.ts:35-43`). continuo does own a real verdict vocabulary — `CI_VERDICTS` =
`passed | failed | cancelled | timed_out | no_run | indeterminate`, folded by `VERDICT_SEVERITY` with
`indeterminate` deliberately outranking `passed` (`ci_ingest.ts:77-118`) — but a grep over `src/lap/`
and `src/gate/` finds no call site: it is a PR/CI polling module that `performLap` never touches.

So the conductor must supply verify itself (run the suite, read the CI verdict, diff the worktree),
and the design must not write "verify → the lap's terminal report" in a table. Doing so would commit
pitfall 2 — §5 — inside the document that names it.

---

## 5. The three loop-agent pitfalls, with the real names

These are the three cadenza#40 lists as requirements 2, 3 and 4. The knowledge file the brief names,
`knowledge/curated/loop-agent.md`, does not exist; the curated file that carries this material is
`knowledge/curated/agentic-loop.md`, and the code is `happy-ryo/loop-agent` at `d03e29f`. Both are
cited below so a later reader can check the claim rather than the paraphrase.

### 5.1 Commit-worthiness is decided by verify's signal, not by history

`StepRecord.goal_met` is written from `VerifyOutcome.goal_met` **only on the normal path**
(`loop.py:1238-1243`). Four other paths append a `StepRecord` with `goal_met=False` and **verify
never runs**: a gate skip (`:1078-1084`), an act timeout (`:1132-1138`), a review timeout
(`:1170-1176`), and a blocking review (`:1185-1192`, which skips verify explicitly so the next
`gather` can feed the feedback back into `act`). So *"an iteration completed"* is not evidence that
verify passed, or even that it ran.

The correct pattern exists in the codebase: `WorkListGather`'s default done predicate returns
`bool(record.goal_met)` and its docstring tells callers to store per-item completion signals in
`record.observation` / `record.detail` rather than infer them from the fact a step happened
(`discovery/work_list.py:260-268`).

**What it costs the conductor.** A run is commit-worthy when the conductor's own verify says so —
never because a lap completed, a gate opened, or a report exists. continuo's own bar is explicitly
existence, not correctness (D-0060: "the turn is over when the terminal report exists"), which is
precisely the signal this pitfall says not to key on.

### 5.2 No-progress keys are failure signatures, not attempt counters

`conditions.NoProgress(window, repeat, key=_json_stable_key)` counts key frequency in the trailing
window with `collections.Counter` and fires only when one key occurs `repeat` times or more
(`conditions.py:272-299`). A key that is unique per attempt yields `count == 1` forever, so the
condition **can never fire**. `NoProgress` is documented as a cap that does not guarantee termination
for exactly this reason (`agentic-loop.md`, the bounded-run section).

There is a guard against `repeat > window` (`conditions.py:282-285`, "a silent mis-config — reject it
like a bad cap") and **no equivalent guard against a per-step-unique key**. That failure is silent.
loop-agent contains a live example of a key that must not be used: `memory.step_signature()` bakes
`record.iteration` into both the payload and the returned string (`memory.py:49-51`) — it is a
provenance key, not a failure signature.

The correct pattern also exists: `operations.VerifyDetailBreaker(repeat)` fires when the same
non-empty verify detail repeats (`operations.py:233-245`), `AdapterFailureBreaker` on consecutive
`failed=True` observations, `TimeoutMarkerBreaker` on repeated timeout markers.

**What it costs the conductor.** Every continuo identity within reach is unique per attempt **by
deliberate design**: `escalationDedupKey(sessionId, generation)` — "the generation is what makes the
two turns two facts" (`report_ingress.ts:128-142`) — and `lapArtifactDir(artifactRoot, runId)`
(`root.ts:337`). Keying no-progress on a run id, a gate id, an artifact path or a lap outcome gives
`count == 1` forever and the conductor never halts. The conductor's no-progress key must be a
**projection onto the failure signature** — repeated verify detail, in the spirit of
`VerifyDetailBreaker` — and the design must name the projection rather than let a reader assume a
continuo identifier will do.

### 5.3 Gate reject/respond observations are strings

`HumanGate._apply_resolved` returns, for a reject,
`GateReview(disposition=GATE_SKIP, observation=f"gate-skipped:rejected:{gate_key}", …)`
(`gate.py:576-581`); for a respond, `observation=decision.payload` (`:584-588`); and the
already-executed replay path returns `f"gate-skipped:already-executed:{gate_key}"` (`:479-484`). The
driver appends these verbatim into `StepRecord.observation` (`loop.py:1078-1084`).

The contract is only that these observations are **hashable**, so the default `NoProgress` key works
— explicitly *not* that they are dicts (`gate.py:536-544`: "Put structural notes in the string
`detail` field"). The trap is live in loop-agent's own published recipe, which writes
`done_when=lambda item, rec: rec.observation["passed"]`
(`docs/recipes/multi-item-work-list.md:50`) — the dict subscript that raises `TypeError` the first
time a human rejects a gate. The defensive pattern also exists: `operations._get_failed` branches on
`isinstance(observation, Mapping)` before reading a field (`operations.py:47-50`).

**What it costs the conductor.** Any custom no-progress key, done predicate or breaker the conductor
writes must branch on non-`dict` observations before subscripting. A human rejecting a gate is a
normal event, and it must not crash the loop that was built to ask them.

---

## 6. The eight requirements, answered

### 6.1 Ask-back is a first-class verb

**Requirement.** The one-line request style only works if the conductor may stop and present options
when the contract does not resolve the request. Without it the human ends up writing detailed briefs
again.

**Answer.** cadenza already has the vocabulary for this, and the conductor should use it rather than
invent a second one. G2's classification is total and three-valued
(`src/domain/classification.ts:27`): `allowed | needs_approval | refused`. `needs_approval` **is**
ask-back, and D-0026 §3 already fixes its semantics in the exact shape this requirement needs:

- "The boundary is the contract's, not the run's. A run does not judge when to ask; it asks exactly
  when the classification says `needs_approval`."
- "Silence is not consent. An unanswered `needs_approval` is not a proceed."
- "Asking is itself bounded. The contract declares what is **askable** alongside what is granted, and
  the two sets are disjoint" — an overlap is refused at issue time, and anything in neither set is
  `refused` outright and **not escalatable**.

So the conductor's ask-back verb is: *classify the intended action against the run's contract; if
`needs_approval`, stop and present the question with options; the answer arrives as a superseding
contract (`adopt()`, `src/domain/supersession.ts:55-95`), not as a mutation of the running one.*
This gives ask-back a digest, a lineage and a refusal path for free, and it puts the bound on asking
where D-0026 already put it.

**And the same hole §6.5 names, on this side.** The successor gives a digest, a lineage and a refusal
path — not a provenance for the *answer*. `adopt()` checks lineage, grantee and project and nothing
else, and G2 says so in its own words: "A successor **may widen**, and cadenza does not refuse it.
Whether the issuer held what it granted is the control plane's to establish"
(`g2-delegation-contract.md:352-356`, `supersession.ts:15-22`); `issuer` is an opaque identity string
with no actor kind (`contract.ts:46, 82-90`). The conductor **is** that control plane. So a widening
successor the conductor composed is indistinguishable from one issued because a human said yes, and
C-4's rule has to cover this path too.

**The gap, stated plainly.** That is cadenza's half. continuo has **no pre-act ask-back**: its gate
opens from a terminal report, after the turn (`report_ingress.ts`, `gates.ts:199-206` — a gate cannot
be opened without a prior event on the spine). loop-agent's `ActionGate` fires between `gather` and
`act` and can prevent the side effect; continuo's gate cannot. Two distinct asks therefore exist and
the design must keep them distinct:

1. **Conductor-level ask-back** (before admission): the conductor holds the request, classifies, and
   asks the human through the #22 surface. Nothing is admitted, nothing is spawned. This is the verb
   requirement 1 is about, and it is unblocked — it depends on nothing of continuo's. But only its
   *decision* half exists today: `classify()` returns a frozen `{outcome, reason, contractDigest}`
   (`classification.ts:180-199`) and nothing more. Presenting the question, offering options, holding
   an outstanding question open so that "silence is not consent" is a stall rather than a sentence,
   and mapping an `askable` classification back to the keys it covers — `classifyKey` returns
   `["needs_approval", "askable"]` with no key, and `classify` reports one strictness-max reason for
   the whole set (`classification.ts:117-130, 171-183`) — are all the conductor's to build, on the
   #22 surface. Like `verify` in §4, this is a slot with a real decision under it, not a verb to
   call.
2. **Worker escalation** (after the turn): the worker's terminal report opens a `worker_escalation`
   gate the human answers. This is continuo's, and it is post-hoc by construction.

### 6.2 Commit-worthiness is decided by verify's signal, not by history

**Answer.** The conductor keys advance-or-return on a verify verdict it computes, and records the
verdict as the run's own fact. It must not key on "a lap ran", "a report exists", "a gate opened", or
"a step is in history" — §5.1 and §4 give the mechanism and the reason.

Because continuo returns no verdict (§4), the conductor's verify is the conductor's to build. The
minimum honest shape:

- a **verdict** with the same shape as continuo's existing `CI_VERDICTS` fold — including
  `indeterminate` outranking `passed`, which continuo's own fold comment calls the rule that an
  unobservable check is not a green one (`src/control_plane/ci_ingest.ts:100-118`; that comment cites
  `D-0006`, an id continuo's current `DECISIONS.md` no longer matches — D-0006 there is "ASCII-only
  for anything continuo prints" — so the rule is taken from the code, not from a decision) — and,
  with it, the discipline that vocabulary carries: `no_run` is ranked *below* `passed` (0 vs 1), and
  what stops a no-evidence fold reporting green is not that rank but `prVerdict` dropping `no_run`
  rows from the evidence **before** folding (`ci_ingest.ts:105-121`). Reusing the vocabulary
  therefore costs importing that pre-fold rule as well as the member names; what it buys is the two
  repositories saying the same word for the same thing;
- a **detail** string that is stable across attempts for the same failure — this is what §6.3's
  no-progress key projects onto;
- the rule that **only a `passed` verdict makes a run commit-worthy**, and that a verify that did not
  run is `no_run` — continuo's word for "no eligible evidence" — while a verify whose result could not
  be read is `indeterminate` (`ci_ingest.ts:29-34`). Neither is ever `passed`, and `no_run` is removed
  before any fold rather than ranked inside it.

### 6.3 No-progress keys are failure signatures, not attempt counters

**Answer.** The conductor's no-progress condition keys on the **verify detail** (§6.2), not on any
continuo identifier. Concretely: `NoProgress(window, repeat, key=lambda record: record.detail)`, in
the spirit of `VerifyDetailBreaker` (`operations.py:233-245`), with the explicit rule that a key
which can change every attempt is a configuration error.

The design also records the trap for a future reader: `escalationDedupKey` and `lapArtifactDir` are
unique per attempt **on purpose**, and that purpose is correct — it is what stops a resumed session's
second report being dropped as a duplicate (`report_ingress.ts:128-142`). The bug would be reusing
those identities as a progress signal, not the identities themselves.

### 6.4 Gate reject/respond observations are strings

**Answer.** Every predicate the conductor writes over a recorded observation — no-progress key, done
predicate, breaker — branches on the observation's type before subscripting, in the shape of
`operations._get_failed` (`operations.py:47-50`). The design states this as a rule and points at the
counter-example in loop-agent's own recipe so a reader can see the failure rather than take it on
trust.

### 6.5 Two human contact points only

**Requirement.** The request, and gate/merge answers. Everything else — decomposition, brief,
escalation translation, PR, CI watch — is the conductor's.

**Answer, and the correction the evidence forces.** The rule is right and the conductor should be
built to it. But it is a **discipline the design must make checkable**, not a property continuo
enforces:

- `gate answer` records a body on the `presented -> answered` edge, which admits actor kind `human`
  and no other (`gates.ts:213-219`), and refuses a null body (`AnswerBodyRequired`).
- **The actor kind is derived from the verb, not from who typed.** A conductor that invokes
  `gate answer --body "looks good"` records agent-authored text as the human's approval, and nothing
  in continuo detects it. continuo's own design calls this out: putting worker prose in
  `gate_transition.body` "would record worker-authored text as the human's approval, which destroys
  the single property this lap is being built to gain" (`minimal-operating-loop.md:498-506`).

So the honest formulation is: **the conductor may carry a human's answer verbatim; it may never
compose one.** The design's job is to say what makes that checkable — the recommendation in §11
(decision **C-4**) is that the #22 surface, not the conductor, is what invokes `gate answer`, so the
body's provenance is a property of the surface rather than a promise in prose.

One more honest note: the belt has a **third** human contact point today — the escalation relay
(INV-3, `/org-escalation`) — and "two contact points" holds only because the conductor treats a
worker escalation as a *gate answer*, which is contact point 2, rather than as a separate
conversation. That collapse is the design's, and it is what makes the number two rather than three.

### 6.6 Step 11 stays a human approval

**Requirement, restated against the source.** cadenza#40 says "step 11 stays a human approval (push /
PR / merge / run close), and whether the conductor performs it mechanically after approval is a
decision for this design". continuo carries **two numberings** and the requirement mixes them:

- `minimal-operating-loop.md:144-160` defines the **lap** as nine steps `L0..L8`;
- `:1136-1176` (§7 "The order") is a **build order** numbered `0..11`, and the dogfood runbook maps
  CLI verbs onto these numbers.

The human **decision** is `L6` (§7's step 10) — the gate. Step 11 is the operator's manual
**execution** leg: push, PR, merge, close.

**Answer.** The approval stays human, unconditionally. Whether the conductor performs the execution
mechanically after approval is not blocked on a policy preference today, because **the mechanism does
not exist**:

- continuo executes no git and no GitHub call anywhere (`minimal-operating-loop.md:413-415`);
- there is **no `run close` verb and no verb of any kind that writes `run.status`**.
  `advanceRunStatus` exists at `run_lifecycle.ts:381` and its only other non-comment reference in
  `src/` is the barrel re-export at `index.ts:439` — the remaining hits are JSDoc prose in
  `run_lifecycle.ts` and `run_admission.ts` (including `run_admission.ts:60`, which describes a caller
  that does not exist yet), and nothing calls it. The dogfood filed this as F-7 with
  "**Workaround.** None", and all eight dogfood runs finished at status `created`, with the run row
  lying about its own state (`lap-1-dogfood.md:339-348`);
- the "privileged publisher" is explicitly deferred to lap 2 (`minimal-operating-loop.md:639-643`).

So the design's recommendation (decision **C-5**) is that step 11 stays the operator's manual leg for
lap 1 and the conductor holds **no push credentials**. The conductor's honest end state is: gate
closed `answered_and_forwarded`, run row still `created`, and a report to the human saying so.
Anything more requires continuo to grow a publisher and a run-close verb first.

### 6.7 Concurrency

**Requirement.** continuo's lap 1 is single-run; the documented concurrency residual
(`minimal-operating-loop.md:989-995`) must be addressed before the conductor admits runs in parallel.

**Answer, with a correction.** The residual's own passage says the opposite of "address it first".
That passage (`minimal-operating-loop.md:989-995`) reads: the lap runs **one provider instance per
run**, "which makes the documented concurrency
residual at `src/session/claude_cli_provider.ts:959-994` **unreachable at zero cost**", and the
section's verdict is "**Recommendation: no pre-lap entry** … **Band: continuo, post-lap.**"

So the requirement is satisfied not by addressing the residual but by **staying inside the condition
that makes it unreachable**: one provider instance per run, and the conductor single-flight. That is
also the only shape available, because the belt's two concurrency mechanisms — free-pane accounting
and merge-as-backpressure — have no continuo counterpart at all (§3), and a lease is a claimant, not
a capacity ledger (`minimal-operating-loop.md:891-898`).

The recommendation (decision **C-7**) is therefore: **the conductor is single-flight in lap 1**, and
parallel admission waits on either continuo's post-lap concurrency entry or a cadenza-side capacity
ledger that a later design proposes on its own evidence. A second reason to wait: the verbs are not
idempotent per run — `db create`, the endpoint destination dir, the workspace and `run admit` all
refuse on existence, and re-running a lap requires run id, topic branch, workspace and dropbox to
move together (`lap-1-dogfood.md:682-689`). A retry loop over these verbs is not a retry; it is a new
lap needing four new identifiers that nothing allocates. That allocator is a prerequisite for
parallelism and does not exist.

### 6.8 Tiered models per stage

**Requirement.** Mechanical fan-out on a smaller model, judgment/review on the session model — decide
whether it belongs to the conductor.

**Answer: no.** A model tier cannot live in cadenza's core layers, and the reason is structural
rather than stylistic:

- G1 §1: "Nothing in `domain`, `application` or `ports` names Claude, GitHub, interlock, or any other
  executor" (`g1-project-registry.md:22-23`), and D-0027's consequences say the same for capability
  keys: "No key here names a control plane, a provider or interlock, and none may".
- A tier is only meaningful against one provider's model line. Spelled abstractly (`high` / `low`) it
  is an uninterpretable token that some adapter must map back to a concrete model name, so the
  agnosticism would be nominal — a provider fact carried under a neutral name, which is exactly what
  the one-word grep in G1 §1 exists to make visible.
- The one seam that would naturally host the tier-to-model mapping is closed:
  `src/adapters/interlock/` must not exist in the TypeScript tree
  (`import-boundaries.test.ts:906`, D-0014), and the Python seam is empty by D-0023. `src/adapters`
  itself is a live layer (`:905` asserts it exists), so this is a ban on the interlock seam, not on
  adapters as such.

The tier is real and useful, but it is **executor policy**. It belongs in the `executorPolicy` bag of
§7 — carried by the agent-type record, never read by `classify()`, outside `config_digest` (though
inside the record's own `agent_type_digest`, §7.1), and
interpreted only by whatever renders a run for a given executor.

continuo has no model concept on the *lap path*: `StartRequest` is
`{sessionId, workspace, role, settings}` and nothing under `src/lap/` names a model. It does have two
model-shaped things above and below that path. `ai_invocation` is a durable control-plane record of
`(provider, model, run_id)` — both columns `NOT NULL` and non-empty
(`migrations/0001_initial.sql`), written by `startInvocation` (`ai_invocation.ts`) — that no lap verb
calls today; only `src/measurement/` reads it. And `ClaudeCliSessionProviderOptions.baseCliArgs` is a
named provider-side seam for a *provider-wide* pinned model
(`claude_cli_provider.ts:1086-1092`, exercised as `baseCliArgs: ["--model", "haiku"]` in
`test/gate_item11/registry.ts:59`). Neither is per-stage: a per-stage model selection has no seam and
would still travel as a `--cli-arg` (`--model` is absent from the provider's owned-flag list,
`claude_cli_provider.ts:242-253`), through the same unguarded door §2.3 flags.

**So a per-stage tier is carried but not honoured in lap 1, and the document says so rather than
leaving the contradiction for an implementer to find.** The only transport is `--cli-arg --model`,
and C-6's allowlist is empty; the adapter therefore reads a tier it cannot spend. Two seams could
change that later — `ClaudeCliSessionProviderOptions.baseCliArgs` (provider-wide, not per stage) and
`ai_invocation`'s `(provider, model, run_id)` row (recorded, not selected) — and neither is wired to
a lap today. Until one is, `executorPolicy.modelTier` is a field the record carries forward for a
capability that does not exist yet, which is the honest state and not a working feature.

---

## 7. The agent-type record

cadenza#40's second comment proposes a provider-agnostic **agent type** — "what it may touch, what it
must report, how many review rounds, when it halts, which model tier" — belonging in cadenza's
registry. The direction is right. The record as enumerated would, taken literally, ship **two sources
of truth over authority**, so this section proposes a narrower record and says what each rejected
field costs.

### 7.1 The five proposed fields, dispositioned

| Field | Disposition | Why |
|---|---|---|
| **what it may touch** | **Already G2's, and must not be duplicated.** The record names a *capability key set* in the D-0027 vocabulary that the conductor uses to **build** a `DelegationContract` | That question already has a single, total, three-valued answer: `classify(contract, action, context)`. A registry-side "may touch" list gives two answers under two digests — `config_digest` and `contract_digest` — with **no precedence rule anywhere**, and G2 deliberately refuses to invent one (`contract.ts:227-231`, "refusing beats inventing a precedence at classification time") |
| **what it must report** | **Opaque executor policy.** Not read by cadenza | G2 is deny-by-default over *acts a run may perform*; there is no obligation direction and `Outcome` has exactly three members. A reporting obligation implies an observer, i.e. a port — and G2 pre-commits that "if G2 appears to need a port, that is a falsifier for D-0026 §2 and is **raised, not built**" (`g2-delegation-contract.md:62-67`) |
| **how many review rounds** | **Loop policy: the conductor reads it. Not authority, and never read by `classify()`** | It is a *value beside a key*, which D-0027 §3 named in advance and refused as scoping; and budgets are on G2's explicit out-of-scope list (`g2-delegation-contract.md:44-46`). `classify()` takes `(contract, action, context)` with `context = { runId, configDigest }` and could not consume a round budget if it were there. But §4 gives *review* to the conductor, so the round budget has a real interpreter — it is simply not a cadenza-domain one |
| **when it halts** | **Loop policy: the conductor reads it** — it parameterises the no-progress condition of §6.3 | Halting is enforcement, and G2 "does not stop anything" (`g2-delegation-contract.md:326-329`). A halt predicate over a running process needs a clock and an observer, so it cannot live in cadenza's pure layers — but the conductor has both, and §6.3 already assigns no-progress to it |
| **which model tier** | **Opaque executor policy.** Carried, never interpreted by cadenza or by the conductor | §6.8 |

**The record that survives**, then, is small:

```
AgentType
  agentTypeId          a stable identifier, cadenza's own
  granted              capability keys (D-0027 vocabulary) the conductor puts in the contract
  askable              capability keys the conductor puts in the contract's askable set
  vocabularyVersion    the vocabulary version the two sets are written against
  loopPolicy           read by the conductor: review rounds, halt / no-progress thresholds
  executorPolicy       read only by the invocation adapter: executor role, model tier,
                       reporting duties. Opaque to domain, application, ports and the loop
  agentTypeDigest      over all of the above, computed the way config_digest is
```

`granted` and `askable` are **inputs to contract construction**, not a second answer beside a
contract. The two policy bags are split because they have different interpreters, and conflating
them was this section's own first mistake: **`loopPolicy` is the conductor's** — §4 gives it review
and §6.3 gives it no-progress, so a round budget and a halt threshold have a real reader — while
**`executorPolicy` is interpreted in exactly one place — the continuo-invocation adapter of §2.3's
bundled replaceable unit** — and nowhere else, which is what keeps a model tier expressible without
naming an executor anywhere in `domain`, `application` or `ports` (§6.8). Neither bag is ever seen by
`classify()`, and neither is authority: an action a `loopPolicy` permits is still `refused` if the
contract refuses it.

**That adapter has one mapping it cannot avoid: the role.** `run admit --role` is required, and its
value must be one of the four roles in continuo's bundled role document — `worker`, `curator`,
`dispatcher`, `secretary` — because that is what `lap perform` renders the fence from. Admission does
**not** check it: any non-empty string is accepted and persisted, and the mismatch is only found much
later, after the topic branch and worktree already exist (continuo#126, `lap-1-dogfood.md:126-131`).
So the agent type names an **executor-neutral role name of cadenza's own**, `executorPolicy` carries
it, and the adapter maps it onto whatever roster the executor behind the bundle has — refusing an
unmapped name *before* admission rather than letting continuo pay for it late. Which roster that is
and what refuses an unmapped name is decision **C-15**; a second executor with different roles
changes the adapter and nothing above it, which is the whole point of §2.3's boundary.

**The record is a frozen value with its own digest** (D-0015 for the freezing, and the
`config_digest` / `contract_digest` technique for the digest — D-0011, D-0017 for its oracle), and a
run persists `agent_type_digest` beside `project_id`, `config_digest` and `contract_digest`. Without
that, the same `agentTypeId` under an unchanged `contract_digest` could denote different review
rounds, halt thresholds or tier a month later, and "under what policy did it do that" would be
unanswerable from the record — the same reconstructability argument D-0026 §1 makes for the grant.
The digest is the agent type's own; it does **not** enter `config_digest`, for the reason in §7.2.

**A digest alone does not make a past run reconstructable, and the design must not pretend it does.**
A stored `agent_type_digest` proves only that the record has or has not changed; it does not hand
back the review limit, halt threshold or tier the run actually ran under. So the digest is the
*detection* half, and it needs a retention half beside it: **agent-type records are immutable, and
editing one mints a new record rather than mutating the old** — the same move D-0015 makes for value
objects and D-0026 §1 makes for contracts, where "an approval is a superseding contract, not a
widening of the running one". A run's `agent_type_digest` then addresses a record that still exists.
What that retention costs — whether superseded records live in the catalog, in a content-addressed
store, or only in git history — is the durability question cadenza does not answer for itself
(D-0026 §2: what cadenza cannot compute purely is the control plane's), so this document names the
requirement and leaves the mechanism to whoever owns the store.

### 7.2 Where it lives, and the trap that decides it

**It must not be a field on `Project` / `ResolvedProject`.** `config_digest` is computed over the
resolved project's *semantics* (`g1-project-registry.md:156-166`). Adding the record to that payload
changes **every** project's `config_digest`, and every already-issued `DelegationContract` pins the
old one (`contract.ts:83`), so `classify()`'s first step returns `refused` / `stale_subject` for all
of them (`classification.ts:103-105`) — a documentation-driven mass revocation. Leaving it outside
the digest instead makes it a project semantic the digest does not cover, which defeats the audit
property the digest exists for.

So the record is a **separate record keyed by agent type**, not a project field, and it is outside
`config_digest`. The audit property is not lost by that: it is carried by the record's own
`agent_type_digest` (§7.1), persisted per run alongside the other two, so what a run was configured
with stays reconstructable without every project's digest moving when an agent type changes.

Two further constraints follow from G1 as it stands:

- **Every table is closed**: an unknown key anywhere is refused, naming the key and the file
  (G1 §5.6). A new record is a schema change with a `schema_version` and a migration story, not a key
  someone adds to `config/projects.toml`.
- **Layer-local settings do not merge** (G1 §3.3). If an agent type can vary per operator it lands in
  a local layer, and a record that shapes a grant is an authorisation — so its merge semantics must
  be stated as non-merging, or G1 §3.3's hole re-opens.

### 7.3 What the record is not

It is not a role. D-0026 §1 rejected roles as the authority model, because "a role name in a durable
record means whatever the role table meant *at the time*". The agent-type record survives that
objection only because it is a **rendering**, in D-0026's own sense: the type expands to a grant
**before** the contract exists, the contract stores the expansion, and the type name survives only as
provenance. If a later design lets `classify()` consult the agent type at classification time, that
is the rejected shape returning, and D-0026 §1 is the entry that would have to be superseded.

---

## 8. A substitution test, in the spirit of the thin-seam tests

cadenza#40 asks for a substitution test proving that swapping the worker executor changes only the
bundled unit of §2.3. cadenza's existing thin-seam test is
`test/architecture/import-boundaries.test.ts`: it **parses** every module under `src/` with the
TypeScript AST (never importing it), walks the tree to generate one case per module, resolves each
import specifier, and asserts a per-layer allowlist — with a non-vacuity guard as a first-class case
(`MINIMUM_MODULES = 10`, a known module must be present, nothing may be `unrecognised`,
`:429`, `:830-841`) and every generated case id claimed by
`parity/import-boundaries.ledger.json`. continuo's counterpart adds the measurement this design
wants: `no-provider-detail-leaks.test.ts` asserts an **empty list of files a provider swap would have
to edit**.

A cadenza-side substitution test should be the same kind of thing — parse-based, list-asserting,
non-vacuous by construction. Sketch:

**Where the sketch lands under D-0029.** The technique is unchanged; the subject splits along the
repository boundary the decision draws, and **case 3 splits too rather than staying whole on one
side**.

- **Cases 1, 2 and 4** range over `CONDUCTOR_MODULES`, which are rondo's modules. They are rondo's
  test to write over rondo's tree, with `REPLACEABLE` naming rondo's continuo-invocation adapter
  rather than a path under cadenza's `src/adapters/`.
- **Case 3 as sketched cannot be cadenza's**, and the reason is the decision's own boundary: it
  passes `executorA` and `executorB`, and cadenza knows of no executor. Written here those arguments
  would either import something from rondo — the reverse dependency D-0029 exists to prevent — or be
  inert, which makes the assertion vacuous in exactly the way D-0022's non-vacuity discipline
  refuses.
- **What is cadenza's is the half with no executor in it**: the same agent type, project and grantee
  produce a byte-identical `contract_digest`, asserted as determinism over cadenza's own inputs. That
  is a real property and it is the one cadenza can hold, using the technique `config_digest` and
  `contract_digest` already use (D-0011, D-0017).
- **The substitution claim itself is rondo's to prove**, by building a contract through each of two
  executor adapters and asserting the digests are equal. It rests on cadenza's determinism case; it
  is not a substitute for it.

The sketch below is written in cadenza's paths as it was proposed; read the conductor half as
rondo's, and read case 3's two executor arguments as rondo's wrapper around the determinism case.

```ts
// test/architecture/executor-substitution.test.ts  (SKETCH -- not proposed for merge here)

// 1. The conductor's modules name no executor. Same detector as the boundary suite,
//    over a widened forbidden set: no module under src/ that participates in the
//    conductor may mention a model name, a CLI flag, a settings filename or a fence rule.
const EXECUTOR_VOCABULARY = [
  /\bclaude\b/i, /\bgpt-/i, /--allowed-?tools/i, /--permission-mode/,
  /settings\.local\.json/, /roles\.json/, /PreToolUse/,
];
parametrize("no conductor module names an executor", CONDUCTOR_MODULES, (module) => {
  for (const pattern of EXECUTOR_VOCABULARY) {
    expect(sourceOf(module), `${module} names an executor`).not.toMatch(pattern);
  }
});

// 2. The measurement, in continuo's shape, but over the half cadenza owns:
//    which cadenza files would a second executor edit? The answer must be empty,
//    or exactly the one named continuo-invocation adapter (C-8's process boundary).
const REPLACEABLE = new Set(["src/adapters/continuo-cli/"]);  // cadenza's whole share
const touched = modulesReachingExecutorVocabulary();                 // parsed, not imported
expect([...touched].filter((m) => !inBundle(m, REPLACEABLE)),
  "a second executor would have to edit these, and they are not the bundle").toEqual([]);

// 3. Two agent types render to the same contract under two executors.
//    The contract's digest is the assertion: same agent type, same project,
//    same grantee => byte-identical contract_digest, whichever executor is behind it.
const a = contractFor(agentType, project, grantee, executorA);
const b = contractFor(agentType, project, grantee, executorB);
expect(b.contractDigest).toBe(a.contractDigest);

// 4. Non-vacuity, as its own case (the boundary suite's discipline, D-0022).
expect(CONDUCTOR_MODULES.length).toBeGreaterThanOrEqual(MINIMUM_CONDUCTOR_MODULES);
expect(CONDUCTOR_MODULES).toContain("src/domain/agent-type.ts");
```

`CONDUCTOR_MODULES` is the conductor's `domain`, `application` and `ports` modules — it deliberately
excludes the continuo-invocation adapter. Under C-8 that adapter is the one place executor spellings
are legal, because `lap perform` requires `--claude-command`, `--interlock-root` and
`--claude-org-path` (`src/lap/cli.ts:490-500`) and a conductor that shells out must pass all three.
The value of case 1 plus case 2 is therefore the *boundary* between that adapter and everything else,
not an absolute absence of the vocabulary from `src/`.

Case 3 is the one that carries the design's actual claim: **the agent type and the contract are
invariant under an executor swap, and the digest proves it byte for byte** — the same technique G1's
`config_digest` and G2's `contract_digest` already use (D-0011, D-0017 for the oracle). Under D-0029
it is written on both sides of the boundary, as above: cadenza asserts the digest is determined by
its own inputs, rondo asserts it does not move when the executor behind them does.

Two disciplines come with it, both already cadenza's:

- **Planted violations.** D-0022 records that the boundary check was validated by planting fourteen
  violations one at a time. A substitution test that has never been shown to go red proves nothing.
- **Ledger cost.** A new `src/domain/*.ts` produces five `unmapped` parity ids (D-0022) and must be
  declared in `parity/target-only.json` with a reason.

**What the test cannot prove**, and the document should say so where the test lives: this is a static
property, exactly as continuo's is. It proves that no cadenza module names an executor and that a
contract is digest-stable across executors. It does not prove that a second executor can actually
drive a lap to a gate — that is continuo's cell, and today it is untested there too (§2.2). It also
does not measure §2.3's bundle itself: the `SessionProvider` implementation, the fence renderer and
the terminal-report fact vocabulary all live in continuo (`src/session/`, `src/fencing/renderer.ts`,
`src/control_plane/report_ingress.ts`), out of reach of a parse over cadenza's `src/`. That half is
measured by continuo's `no-provider-detail-leaks.test.ts`.

---

## 9. How the host consumes cadenza and continuo — open decision

**D-0029 reframed this section, and §9.3 is why.** As first written it asked how *cadenza* takes a
dependency on continuo, because the conductor was assumed to live here. It does not: the host is
rondo, and the question is how **rondo** takes a dependency on **each of the two libraries**. The
reframing is not a relabelling — it dissolves most of §9.1 rather than moving it, because the facts
that made the question expensive were cadenza-side facts about cadenza's own dependency graph, and
cadenza acquires no dependency at all under D-0029. §9.1's option table survives intact: it is about
what is installable from these repositories today, and that is the same question whoever is asking
it. What falls away is the list of cadenza entries the answer would have cost.

cadenza#40's brief frames this as "superseding continuo D-0008". **That premise is stale and the
document corrects it**: continuo `D-0008` is **superseded by continuo D-0045**, and
D-0045 (accepted) already chose the shape — publish `@suisya-systems/continuo` and let consumers take
it as an ordinary npm dependency, with a git dependency by sha and a cross-repository workspace both
recorded as rejected alternatives in continuo `D-0045`. The option table in
`minimal-operating-loop.md §6.4` is the *argument* that produced D-0045, not a live choice. Nothing
cadenza writes supersedes continuo's entries; cadenza's numbering space is its own (`DECISIONS.md`,
"How to use this file").

### 9.1 What is actually open

**None of the three options is executable today**, and the reasons are facts rather than preferences.
They are stated below for continuo, which is where they were measured; under D-0029 each applies a
second time, to cadenza, which is `private: true` at `0.0.0` for the same reason and has no published
package either. That doubling is D-0029's stated price.

| Option | Status today |
|---|---|
| **A. the published npm package** | The package does not exist: `npm view @suisya-systems/continuo version` returns `E404` (run 2026-09-04), and continuo's HEAD `package.json` is still `"private": true` at `"version": "0.0.0"`. D-0045 states in its own consequences that it "changes no files other than `DECISIONS.md`" |
| **B. a git dependency pinned by sha** | npm builds a git dependency by running its `prepare` script and continuo has none (`grep prepack\|prepare` on continuo's `package.json`: no matches), so the install produces a package whose `main: ./dist/index.js` points at nothing. Adding `prepare` collides with **both** repositories' `--ignore-scripts` policy (continuo D-0009, cadenza D-0004), so cadenza's CI would skip it and install an empty package — a green install producing an unimportable module |
| **C. a cross-repository workspace** | There is no monorepo to add a workspace to: two git repositories, two lockfiles, no `workspaces` field in either `package.json`. A `file:`/workspace link records a path rather than a resolved artifact, so cadenza's lockfile stops answering "which continuo is this" — which is the property D-0004 and `npm ci --ignore-scripts` exist to hold. And `dist/` is gitignored and absent from the checkout, so the link resolves to nothing until somebody runs continuo's seven-command `build`, which `--ignore-scripts` will never do |

**Three cadenza-side facts used to ride on this, and D-0029 retires all three.** They were the cost
of cadenza itself taking the dependency, which is what option A of §9.3 required; under D-0029 the
dependency is rondo's and cadenza's graph is untouched, so none of them changes and none needs an
entry. They are kept here because they are the reason the decision was not free, and because each
would come back verbatim if cadenza ever did take the dependency. That contingency is **C-9**, whose
condition D-0029 leaves unreached: the row is not a live decision any more, and is kept rather than
deleted so that a later reader who reopens the condition finds the three facts already named:

1. **`better-sqlite3` becomes a transitive native dependency.** cadenza D-0004's rationale says
   "cadenza has no native dependency today", and its stated falsifier is "a dependency that genuinely
   requires an install script. That is a decision to take then, on that package, with its own entry."
2. **D-0016 stops being true.** "`smol-toml` is the port's **only** runtime dependency" is a sentence
   in an accepted entry.
3. **`ALLOWED_EXTERNALS_BY_LAYER` must be widened binding by binding.** continuo is not on
   `FORBIDDEN_PACKAGES` (which blocks `interlock` and `claude-org-runtime`), so this is a widening
   rather than a conflict — but the allowlist refuses namespace, default and side-effect imports, so
   every named import must be enumerated.

A fourth fact is worth stating because it is asymmetric and because D-0029 relocates it rather than
retiring it: **cadenza's CI matrix includes `macos-latest` and continuo's does not**
(`ubuntu-latest, windows-latest`). The darwin prebuild path that continuo's `--ignore-scripts` policy
depends on has never been exercised by continuo's own CI. Under D-0029 cadenza is no longer the first
place it would run; whichever CI matrix rondo adopts is, and rondo inherits the question the moment
that matrix includes darwin. It is recorded here because it is a fact about continuo's package, not
about who consumes it.

### 9.2 The option the brief did not list, and why it is the recommendation

There is a fourth shape: **the conductor drives continuo across a process boundary**, by invoking the
`continuo` CLI, taking **no npm dependency at all**.

**D-0029 takes most of the force out of this option's argument, and the section says so rather than
leaving the recommendation standing on a reason that has expired.** The reason below is "it spares
cadenza a dependency cadenza cannot take today". Under D-0029 cadenza is not the consumer, so there
is nothing to spare it: rondo is a repository being written from nothing, with no accepted entries to
falsify and no allowlist to widen, and it can take continuo's published package directly (continuo
D-0045) once the release path exists — keeping the typed surface this option gives up. What survives
is narrower and still real: **the package does not exist yet**, so a rondo written before continuo's
release path lands has the CLI as its only executable route, and the costs below are what that
interim costs. The shape stays on the table as an interim, not as the destination.

- It defers §9.1 entirely: no native transitive dependency, no D-0016 supersession, no allowlist
  widening, no macOS prebuild question, and no blocking on continuo's release path.
- It matches what actually exists. continuo's verbs are real and exercised — the dogfood ran
  `run admit`, `lap perform` and the six gate commands end to end at revision `aa87f35`
  (`lap-1-dogfood.md:646-745`). Its *library* surface is reachable too (`src/index.ts` re-exports
  `performLap`, `LapRequest`, `LapOutcome`, `createDefaultSessionProvider`), but only through the
  single `.` export, and only once the package can be installed at all.
- It keeps §2.3's claim easy to hold for *types* — a process boundary cannot leak one — but not for
  names; see the costs below.

Its costs are real and must be recorded rather than glossed:

- **No typed surface.** The conductor parses CLI output, and the CLI's contract today is an
  operations runbook rather than a specification: `minimal-operating-loop.md` names exactly one verb
  spelling (`continuo db create|migrate|verify`), and `run admit` / `lap perform` / the eight `gate`
  verbs are recorded only in `src/cli.ts` and in the dogfood runbook, which is explicit that it
  records "the commands that were actually run … not what the design expects".
- **F-6 is live.** Piping `gate show` into `head` kills the CLI with `EPIPE`
  (`lap-1-dogfood.md:920-924`). A conductor that pipes verb output walks straight into it.
- **`--help` does not state the constraints that exit 2** (F-3, F-4), so the conductor must encode
  them: `--endpoint-recipient` must name a registered handler (`external-notify` or
  `human-gated-effect`, and the second delivers nothing by design), the destination dir must not
  exist, the workspace must not exist, and `--role` is *not* validated at admission — a typo is
  accepted, persisted, and paid for later when `lap perform` renders the fence (continuo#126).
- **The invocation itself is executor-shaped.** `lap perform` makes `--claude-command`,
  `--interlock-root` and `--claude-org-path` required (`src/lap/cli.ts:490-500`), so the CLI route
  puts a literal Claude command name and a claude-org path on the caller's composition path. The
  process boundary **relocates** the executor's name rather than removing it: that rendering belongs
  inside §2.3's bundled replaceable unit — `src/adapters/continuo-cli/` in §8's sketch — outside
  `CONDUCTOR_MODULES` in case 1 and inside `REPLACEABLE` in case 2.
- **It answers "which continuo is this" less well than any of the three, and that is the property
  §9.1 used to reject option C.** The CLI exists only as `dist/cli.js` inside a checkout an operator
  built — the dogfood invokes it as `node "$CLI"`, not as `continuo` (`lap-1-dogfood.md:52-66`) — and
  nothing on cadenza's side records which continuo revision a run drove. How a cadenza run pins and
  records that revision is left open here, unanswered, and is the first thing the CLI boundary owes
  back.

**Recommendation (decision C-8): drive continuo across the CLI boundary for lap 1, and name the
published package (continuo D-0045) as the destination for whenever a typed surface is needed.**
It is the only option that is executable today, and it makes the dependency question non-blocking
rather than a precondition.

**C-8 after D-0029.** The recommendation is unchanged in shape and demoted in weight. It was central
while the alternative was cadenza widening its own allowlist for a dependency its accepted entries
say it does not have; now it is an interim-versus-wait choice inside rondo, taken on when continuo
publishes rather than on what it would cost cadenza. It is also no longer cadenza's row to answer
alone: the consumer is rondo, and the decision belongs to whichever gate rondo's ledger establishes
(D-0029's second stated price). The row stays in §11 because the question is live and unanswered, and
because `--claude-command` and its two companions land on the caller's composition path either way —
which is the part of C-8 that touches §2.3 and does not depend on who the caller is.

---

### 9.3 Where the conductor itself lives — decided: **B**, and the repository is **rondo** (D-0029)

**This is the one row of §11 that is no longer open.** The human gate took it on 2026-09-05 and named
the repository the same day; `DECISIONS.md` D-0029 is the record and is what a later reader should
cite. The argument below is kept as written, because it is the reason the decision went the way it
did and D-0029 cites it rather than restating it.

§9 asks how the host reaches continuo. A prior question is whether the conductor is a thing *in*
cadenza at all. continuo's design already frames it, as the second of two operator premises supplied
to that document: premise 1 is structural (the end state is a single web application, one host
process owning the SQLite record of truth and speaking MCP over localhost to agent sessions);
**premise 2 — "that application is hosted by cadenza, as an outermost adapter" — is recorded
explicitly as a working assumption rather than a decision**, with a counter-proposal on the page and
a revisit trigger: *the first line of application code*
(`minimal-operating-loop.md:41-88`). The conductor is that first line. So the trigger has arrived,
and this document raises the question rather than inheriting the assumption. **D-0029 supersedes that
assumption** — along with the same assumption in cadenza#22's comments of 2026-08-29 — but it does
not edit continuo's page: cadenza's numbering space is its own, and recording premise 2's revision is
continuo's gate's.

| | Option |
|---|---|
| **A** | The conductor is an outermost adapter inside the cadenza repository, beside the existing catalog adapter |
| **B** | The conductor is a third repository — the host application — consuming cadenza and continuo as libraries |

**Three things argue for B, and the first is the one the human raised.**

*The name argues against A.* cadenza's README says what the word means: "the moment the orchestra
falls silent and a soloist plays on their own judgment — within an agreed frame, and ending with the
trill that cues the ensemble back in", and — decisively — "**That is what this layer defines, not
what it performs**". A conductor is precisely who is *not* playing during a cadenza. Housing the
thing that runs the programme inside the layer that defines the soloist's frame inverts the metaphor
the repository chose deliberately, and metaphors that invert stop guiding the boundary decisions they
were adopted to guide.

*The ownership table argues against A.* Of the four things #22's console renders, **three are
continuo's** — the delegation record, run and belt state with `awaiting_user` events, the outbox —
and one is cadenza's (gate semantics), with the operator conversation undecided. Under A the host
lives in the repository that owns the minority of what it draws and reaches for the majority across a
package boundary.

*The layer discipline argues against A, measurably.* cadenza's import boundary is not a layer
allowlist but a **per-binding external allowlist**, and `src/adapters` — "the one layer that is
allowed I/O, and only this much of it" — currently admits exactly `readFileSync` and `statSync`. A
host needs an HTTP server, continuo's exports, and a SQLite driver reached through them, each named
binding by binding. That is a deliberate widening of the single check that keeps cadenza I/O-minimal,
and it is not reversible by removing a directory later.

**What argues for A**, and it is not nothing: it adds no repository, and continuo records that
neither repository's `DECISIONS.md` can hold a decision binding both (`minimal-operating-loop.md`
§8), so a shape that multiplies cross-repository decisions walks into a defect already named. A third
repository needs a third ledger and a rule for what it may decide alone.

**Decision: B — and the repository is `rondo`** (D-0029), with the packaging cost stated rather than
buried. cadenza is `private: true` at `0.0.0` exactly as continuo is, so B does not inherit §9's
publication problem — it **doubles** it: two packages must become consumable instead of one. That is
the honest price, and it is a price in the same currency as continuo D-0045 rather than a new kind of
problem. The second price is the one A's argument named: a third repository needs a third ledger and
a rule for what it may decide alone, and establishing both is rondo's, not settled here.

**The name.** A rondo is the piece that keeps coming home: a refrain set between episodes that are
free to wander, and the refrain is where the piece is decided. Each delegated run is an episode that
leaves it and is cued back to it; every return is a gate. continuo underpins the piece, cadenza
defines the soloist's frame, rondo is where the piece always returns — which is the same rule that
picked the other two names, applied to what this repository does. "Conductor" survives only as the
name of the loop component inside rondo, if at all; the repository and the host are rondo, and this
document keeps saying "the conductor" for the loop it describes.

**How §9 generalises under D-0029.** The consumption question stops being "how does cadenza take a
dependency on continuo" and becomes "how does rondo take a dependency on each of them", and that
reframing dissolves most of §9.1 rather than moving it: cadenza never widens
`ALLOWED_EXTERNALS_BY_LAYER`, never acquires `better-sqlite3` as a transitive native dependency, and
D-0016's "`smol-toml` is the port's one runtime dependency" and D-0004's "cadenza has no native
dependency today" both stay true — so C-9's three consequent entries never need taking. C-8's CLI
process boundary also stops being the interesting answer: it exists to spare cadenza a dependency it
cannot take today, and a host that is being written anyway can take continuo's published package
directly (continuo D-0045) once the release path exists, keeping the typed surface §9.2 gives up.
What the decision does *not* dissolve is C-14: whichever way, something must record which continuo revision a
run drove.

**What stays cadenza's, and would have under either answer.** The G1 registry, the G2 contract and `classify()`, and
the agent-type record of §7 — which is registry semantics, not application code. C-10 (the record
lives in the TypeScript tree alongside G2) is unaffected by C-17: rondo *reads* cadenza's
agent types, it does not own them.

---

## 10. What the conductor's loop looks like, end to end

Putting §§3-9 together, one conductor iteration for one request:

0. **Gather.** Make the one-liner concrete from the G1 registry, the issue, and prior decisions.
1. **Classify.** Build the intended actions from the agent type (§7), classify each against the
   run's `DelegationContract`. `refused` → refuse the request and say why. `needs_approval` → **ask
   back** (§6.1) and wait; an answer arrives as a superseding contract.
2. **Admit.** `run admit` with the seven required fields, plus only the `--cli-arg` values on the
   conductor's own allowlist (decision **C-6**).
3. **Act.** `lap perform` — one run, single-flight (§6.7). The worker is turn-shaped; there is no
   mid-run intervention (§3). **The call returns with the gate already open**: `performLap` ingests
   the terminal report and opens the `worker_escalation` gate before it returns, so steps 4-6 run
   over a question already put to the human. **Unless the turn is `isError`**: `ingestTerminalReport`
   refuses it and throws, and `performLap` rethrows (`report_ingress.ts:259-265`), so there is no
   `LapOutcome`, no gate, and steps 7-8 have nothing to act on — the conductor reports the execution
   failure to the human on its own path.
4. **Verify.** The conductor's own ground-truth check (§6.2). A verify that did not run is `no_run`;
   one whose result could not be read is `indeterminate`; neither is `passed`.
   **Anything but `passed` ends the iteration here**, on the same path as an aborted review below: no
   review, no presentation, no publish. §6.2's rule is that only `passed` makes a run commit-worthy,
   and putting an unverified artefact in front of a human as an approvable gate would spend the one
   human contact this loop is rationing. The gate opened in step 3 is settled the way step 5 settles
   it, and the conductor reports the verdict and its detail.
5. **Review.** The Codex gate and whatever the agent type's policy names. A blocking review **ends
   the iteration without marking the run commit-worthy** (§5.1). It does not return to step 3:
   `lap perform` cannot be re-entered on an admitted run — the run id is taken, the topic branch and
   workspace exist, and the endpoint destination dir must not exist (F-4). The next attempt is a
   **new** run needing a fresh (run id, topic branch, workspace, dropbox) tuple, and the allocator for
   that tuple does not exist (§6.7), so the conductor is one lap per request in lap 1.
   **The gate opened in step 3 must still be terminated**, or it stays open forever while the request
   it belongs to cannot be retried. Only three outcomes are a hand's to write —
   `withdrawn`, `expired`, `unanswerable` (`gate/operator.ts:102-116`) — and only `withdrawn` may be
   written from the `received` stage (`gates.ts:277-284`), which is where an un-presented gate sits.
   `withdrawn` is not an approval (`minimal-operating-loop.md:349-353`), which is exactly the property
   an abort wants. **But the conductor must not write it**, for C-4's reason one file along:
   `closeOpenGate` hard-codes `actorKind: "human"` (`gate/operator.ts:991`), so a conductor-issued
   close records an agent action as a person's, in the same way a conductor-composed answer body
   would. The close belongs to the #22 surface, on the same rule and for the same reason. Decision
   **C-13**.
6. **No-progress.** Key on the verify detail (§6.3). A repeated failure signature halts and reports.
   **In lap 1 this step and `loopPolicy`'s round budget are dormant, and the document says so rather
   than implying they work**: with one lap per request and no allocator for the next identifier tuple
   (§6.7, step 5), no signature can repeat and no second round can run. Both become live the moment
   C-7's allocator exists — they are specified here so the design does not have to be reopened then,
   not because they fire today.
7. **Gate.** On the gate opened in step 3: `gate present` →
   `gate deliver` → `gate ack` → **a human answers** → `gate deliver` → `gate ack`. **The yes/no is
   not automatic**: `lap perform`'s `--gate-option` is repeated and left unset when never given
   (`lap/cli.ts:287-289`), so a lap admitted without it presents a question carrying no options at
   all. The conductor must pass the options it wants answerable, and the #22 surface must constrain
   the answer to them — otherwise "two contact points, one of them a yes/no" is a description of a
   free-text box. The gate closes
   as `answered_and_forwarded` only via the forward relay's ack; the conductor cannot write that
   outcome directly (`gate close` admits only `withdrawn`, `expired`, `unanswerable`).
8. **Stop.** Report to the human: the gate outcome, the verify verdict, and the fact that the run row
   is still `created` because no verb moves it (§6.6). Publish is the operator's.

Two human contacts on a turn that escalates: step 0's request and step 7's answer. On an `isError`
turn there is no gate, and the second contact is the conductor's own failure report. Everything
between is the conductor's.

---

## 11. Open decisions — for cadenza's human gate

Propose-only. Each carries a recommendation and the reason. **None of these is taken here**, and
per AGENTS.md §6 an issue carrying open decisions is not started until they are.

**One row has since been taken at the gate, and the table records it rather than dropping it:**
**C-17** — decided **B**, the repository is **rondo**, `DECISIONS.md` **D-0029** (2026-09-05). Its row
below carries the outcome in place of the recommendation. Two rows change status as a consequence
without being decided: **C-9**'s condition is left unreached, and **C-8** is demoted from central to
an interim question that is rondo's rather than cadenza's (§9.2).

**The other fourteen rows are unchanged in substance and change hands in a way this document cannot
settle.** Some are about things cadenza will hold — **C-1**, **C-2**, **C-10**, **C-12** and **C-16**
are the agent-type record and the contract, which D-0029 leaves here — and some are about things that
moved with the conductor: **C-6**'s `--cli-arg` allowlist and **C-15**'s role mapping locate logic in
rondo's invocation adapter, **C-7**'s capacity ledger and identifier allocator would be rondo's,
**C-13** and **C-4** are about who invokes a continuo verb, and **C-14** is about what a rondo run
records. cadenza's gate cannot decide those *for* rondo, and rondo's own ledger and the rule for what
it may decide alone do not exist yet — D-0029's second stated price. So the rows keep their
recommendations and their reasons, and **who takes each of them is open until rondo's ledger says
so**; naming an owner here would be exactly the cross-repository decision continuo records that
neither ledger can hold (`minimal-operating-loop.md` §8).

| id | Decision | Recommendation | Reason |
|---|---|---|---|
| **C-1** | Does the agent-type record express "what a run may touch" anywhere other than G2? | **No.** The record carries capability key sets the conductor uses to *build* a `DelegationContract` | Two authority answers under two digests with no precedence rule, which G2 explicitly refuses to invent (§7.1) |
| **C-2** | Where does the agent-type record live, and does it enter `config_digest`? | A **separate record keyed by agent type**, not a field on `Project`, **outside** `config_digest`, and carrying **its own `agent_type_digest`** that a run persists alongside `config_digest` and `contract_digest` | Inside the project digest it changes every project's `config_digest` and refuses every already-issued contract as `stale_subject`; outside it *with no digest of its own* the record's policy could change under an unchanged `agentTypeId` and "under what policy did it do that" would stop being answerable (§7.1, §7.2) |
| **C-3** | Do tiered models per stage belong to the conductor? | **No.** Tier goes in `executorPolicy`: carried, and never read by cadenza *or* by the conductor — unlike `loopPolicy`, which the conductor does read (§7.1) | G1 §1 and D-0027 forbid naming an executor in `domain`/`application`/`ports`, and the one adapter seam that would host the tier-to-model mapping, `src/adapters/interlock/`, is closed by D-0014 (§6.8) |
| **C-4** | May the conductor author a human's answer — a gate-answer body, or the widening that answers a `needs_approval`? | **No** — it may carry a human's answer verbatim, never compose one. `gate answer` should be invoked by the #22 surface, and a widening successor should be issued only on an answer that surface recorded, with that surface as issuer | Neither side records who answered: continuo derives the actor kind from the verb (§6.5), and `adopt()` does not refuse widening — G2 hands that to the control plane (§6.1) |
| **C-5** | Does the conductor perform step 11 mechanically after approval? | **No** for lap 1: it holds no push credentials and stops at the closed gate | continuo executes no git or GitHub call, has no verb that moves `run.status` (F-7, "Workaround. None"), and defers the privileged publisher to lap 2 (§6.6) |
| **C-6** | May the conductor compose `run admit --cli-arg` freely? | **No — the allowlist starts empty.** The conductor admits with no `--cli-arg`; a first entry is its own decision at this gate; `--dangerously-skip-permissions`, `--allowedTools` / `--disallowedTools` and `--add-dir` are permanently refused (§2.3) | `FENCE_OWNED_FLAGS` does not cover `--dangerously-skip-permissions`, `--allowedTools`, `--disallowedTools`, `--add-dir` (continuo#133), so a documented-verb path can make the human gate advisory (§2.3) |
| **C-7** | Address the concurrency residual first, or stay single-flight? | **Single-flight for lap 1**; parallel admission waits on continuo's post-lap entry or a cadenza-side capacity ledger designed on its own evidence | `minimal-operating-loop.md:989-995` makes the residual unreachable at zero cost under one provider instance per run and bands it post-lap; and the verbs refuse on existence, so a retry needs an identifier allocator nothing provides (§6.7) |
| **C-8** | How does **rondo** consume continuo? (was: how does cadenza) | **Across the CLI process boundary** while continuo is unpublished; the published package (continuo D-0045) is the destination for a typed surface. **Demoted by D-0029**: an interim-versus-wait choice, and rondo's gate's to take rather than cadenza's | It is the only option executable today: the package is unpublished (`E404`, `private: true`), a git dep has no `prepare` and collides with `--ignore-scripts`, and a workspace defeats D-0004's lockfile property (§9). Its original weight came from sparing *cadenza* a dependency its entries say it does not have, and D-0029 removes that reason (§9.2); its own cost — it answers "which continuo is this" worse still — survives as C-14 |
| **C-9** | If **cadenza** ever does take the npm dependency, are the three consequent entries acceptable? | Unchanged, and **not reached**: D-0029 puts the dependency in rondo, so cadenza takes none and the three entries never need taking. Kept as a contingency; if the condition is ever met, take them **explicitly, as three separate entries** (native transitive dependency vs D-0004's falsifier; D-0016's "one runtime dependency"; the `ALLOWED_EXTERNALS_BY_LAYER` widening), and note the macOS-first-exercise risk | Each is a named falsifier of an accepted entry, and D-0004 says so in its own words (§9.1). D-0029 does not answer the row — it removes the antecedent, which is why the row is retired rather than decided |
| **C-10** | Which tree hosts the **agent-type record** — cadenza's TypeScript `src/` or its Python `src/cadenza/`? (The conductor's own repository is C-17, not this row, and it is rondo — D-0029; this row is about the record, which stays cadenza's) | **TypeScript**, alongside G2 | G2 is TypeScript-only (cadenza#25), the boundary suite that would police the record runs over the TS graph, and C-8's boundary is an npm/CLI question either way |
| **C-11** | Which recipient does the gate relay address? | Treat it as **continuo's** open decision; the conductor's read path is `gate show`, not the dropbox | continuo already calls it "a decision, not a detail"; `external-notify` writes `\uXXXX`-escaped `.effect.json` files a person cannot read (F-5, still reproducing), and the other handler delivers nothing by design (§3) |
| **C-12** | Should the premise "the conductor is built on cadenza's semantics" — taken with the human on 2026-09-04 and recorded only in cadenza#40 — become a `D-` entry? (Not the placement question: that was C-17, now D-0029, which leaves this one untouched) | **Yes**, as its own entry, before any conductor code is written | AGENTS.md §3 requires a `DECISIONS.md` entry for any settled design question, and an architectural premise recorded only in an issue is the drift D-0001's oracle order exists to prevent. This document may not create it (propose-only), so it names it instead |
| **C-13** | Who terminates the gate when an iteration aborts before an answer, and as what outcome? | **`gate close --outcome withdrawn`, invoked by the #22 surface — not by the conductor**; the conductor asks for the close and reports why | `withdrawn` is the only outcome writable from the `received` stage (`gates.ts:277-284`, `gate/operator.ts:102-116`) and is explicitly not an approval. But `closeOpenGate` hard-codes `actorKind: "human"` (`gate/operator.ts:991`), so a conductor-issued close records an agent action as a person's — C-4's problem exactly, one verb along (§10 step 5) |
| **C-14** | How does a cadenza run pin and record which continuo revision it drove? | **Record it per run** — the continuo revision the invocation adapter used, persisted beside the run's other identifying digests — and treat pinning the checkout as part of whatever C-8's interim is | C-8's CLI boundary answers "which continuo is this" worse than any of the three npm options, which is the property §9.1 used to reject option C; approving C-8 without this leaves the question hidden (§9.2) |
| **C-15** | Where does the agent-type role name map onto the executor's role roster, and what refuses an unmapped name? | **In the continuo-invocation adapter, refusing before admission** — the agent type carries cadenza's own role name; the adapter maps it and refuses an unmapped one | `run admit --role` is required but unvalidated: a wrong role is accepted, persisted, and paid for only when `lap perform` renders the fence, after the branch and worktree exist (continuo#126). Refusing in the adapter is the only place that costs nothing, and it keeps the roster out of `domain` (§7.1) |
| **C-16** | How are superseded agent-type records retained, so a run's `agent_type_digest` still addresses something? | **Immutably, by minting a new record on every edit**; where superseded records are stored is the store owner's, not cadenza's | A digest detects change but does not hand back the policy a past run used. Immutability is D-0015's and D-0026 §1's existing move; durability is what D-0026 §2 assigns to the control plane rather than to cadenza (§7.1) |
| **C-17** | Where does the conductor itself live — **A** an outermost adapter in the cadenza repository, or **B** a third repository (the host application) consuming cadenza and continuo as libraries? | **DECIDED: B, and the repository is `rondo`** — human gate, 2026-09-05, recorded as **D-0029**. continuo's premise 2 named A a working assumption with a revisit trigger — "the first line of application code" — and the conductor is that line | The name says cadenza "defines, not performs", and a conductor is who is *not* playing during a cadenza; #22's ownership table puts three of the console's four sources in continuo; and A widens cadenza's per-binding external allowlist from `readFileSync`/`statSync` to an HTTP server, continuo's exports and a SQLite driver, irreversibly. Costs of B, stated: two packages must become consumable instead of one, and a third repository needs a third ledger (§9.3, D-0029) |

Two things that are **not** cadenza decisions and are recorded here only so the design does not
silently depend on them: continuo's S1 promotion (the "would you accept these settings?" question
D-0059 defers), and continuo growing a run-close verb and a publisher. Both are continuo's gate's.

---

## 12. What would falsify this document

- **§2.3's claim**, if continuo's lap becomes provider-agnostic — e.g. `readTerminalReport` joins the
  `SessionProvider` contract and the report-fact vocabulary stops naming stream-json fields. Then the
  bundled replaceable unit shrinks back to "the provider", and §2's correction is no longer needed.
- **§4's `verify` row**, if continuo wires a ground-truth verdict into a lap (`ci_ingest`'s
  `CI_VERDICTS` reaching `src/lap/`, or a per-lap check elsewhere). Then verify stops being a slot the
  conductor fills and becomes a capability it consumes.
- **§6.6 and §6.7**, if continuo grows a publisher, a `run close` verb, and a concurrency entry. All
  three are banded post-lap on continuo's side and each would reopen its requirement.
- **§9**, the moment `@suisya-systems/continuo` is actually published with a working `dist/`. C-8's
  reason is a fact about today, not a preference, and it expires when the fact does.
- **§7**, if a later design lets `classify()` consult the agent type at classification time. That is
  the role-as-authority shape D-0026 §1 rejected, and D-0026 would have to be superseded rather than
  extended.
- **The whole document**, if the decision that the conductor is built on cadenza's semantics is
  revisited (cadenza#40, taken with the human on 2026-09-04). C-17 was *not* that falsifier, and its
  answer bears that out: D-0029 changed §9's shape, §2.3's module names and the ownership of §8's
  sketch, and nothing else here. What the conductor *is* and does is the same document under either
  repository.
- **D-0029's own falsifiers are the entry's**, not this document's — a host that cannot be written
  without reaching inside cadenza, cross-repository decisions arriving faster than the allowlist
  widening would have cost, or the packaging price never being paid. If any of them fires, §9.3 and
  everything downstream of it in this document is reopened by the entry rather than by the text.
