# How a consumer installing with `--ignore-scripts` obtains a built cadenza

**Status: taken.** All nine rows of section 11 were taken as recommended at cadenza's human gate on
2026-09-05 and written to [`DECISIONS.md`](../../DECISIONS.md) as **D-0035**. This document is now the
argument behind that entry rather than a proposal: sections 1-9 keep the reasoning as it was argued
and are annotated where D-0035 has since changed the tree under them, section 10 points at the entry
instead of drafting it, and section 11 records each row's outcome. The
consumer-facing procedure the entry's row D5 asks for is
[`docs/artifact-delivery-bridge.md`](../artifact-delivery-bridge.md); read that to *use* the bridge and
this to know why it is that one. The shape - argue a decision to a draft entry, leave the taking to the
gate - is continuo's
[`docs/design/cli-args-allowlist.md`](https://github.com/suisya-systems/continuo/blob/main/docs/design/cli-args-allowlist.md).

D-0033 made cadenza *packable*. It did not make cadenza *deliverable*, and the two are not the same
claim: `npm pack` proves that a freshly built working tree produces a consumable tarball, and says
nothing about what any install specifier hands a consumer who never builds. rondo measured the gap
on 2026-09-05 and recorded it as `rondo D-0016`: at cadenza `4b53eca`, a pinned git dependency
installs `LICENSE package.json README.md src` and no `dist/`, and the import dies with
`ERR_MODULE_NOT_FOUND`; the deep path that used to rescue it is now closed by the `exports` map with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. `rondo D-0016` states the residue in one sentence: *"What remains is
the honest question of who builds it."* This document answers that question, and only that question.

**What this document does not do.** It does not publish cadenza, propose that cadenza publish as part
of the change it recommends, or decide the registry name, the release process, the version at which a
first release happens, or who may run one. `docs/repository-policy.md` §3 leaves all four open in as
many words, the package is `private: true` at `0.0.0`, and D-0033's own alternatives section calls a
registry name a one-way door. Section 6 argues that npm publication is the right *permanent* shape,
and section 9 says exactly what a gate would have to decide before it could be taken. D-0035 decides
one thing: the **temporary bridge**.

---

## 1. What is broken, stated precisely

Three facts, all measured, none of them cadenza's opinion:

1. **A pinned git dependency delivers no build output.** npm packs the checkout, `files` is honoured,
   and `dist/` was never built, so the installed package has an `exports` map pointing at files that
   do not exist (`rondo D-0016`, cadenza at `4b53eca`).
2. **A `file:` link, with or without `--install-links`, delivers no build output either** — for the
   same reason, one layer earlier. `rondo D-0001` measured the plain symlink form failing at import
   and the `--install-links` form failing *after a green install that looks correct*, because
   `--install-links` packs the target and the target has no `dist/`. Both were measured against an
   unbuilt checkout; §5.5 records what changes when the checkout is built first, because that
   difference is the whole of route (e).
3. **The `exports` map closed the escape hatch.** `@suisya-systems/cadenza/src/index.ts` is
   `ERR_PACKAGE_PATH_NOT_EXPORTED`. `rondo D-0016` records this as an improvement rather than a
   regression, and it is: cadenza moved from "consumable only by a route rondo declines" to
   "consumable only by the route cadenza intends".

So the failure is not a packaging defect. It is that **no route currently carries the build across the
boundary**, and cadenza has ruled out the only mechanism npm offers to build it on the far side.

### 1.1 A correction to D-0033, which this document must make rather than inherit

D-0033 rejects a `prepare` script, and its stated reason is wrong:

> both repositories install with `--ignore-scripts` (D-0004), so a `prepare` would be skipped exactly
> where it is needed and would install an empty package

`docs/design/conductor.md` §9.1 carried the same claim ("cadenza's CI would skip it and install an
empty package"), and was corrected with D-0035 where it appears. **rondo measured the opposite.**
On npm 10.9.2, against a minimal package built
for the purpose, a git dependency's `prepare` ran *despite* `--ignore-scripts` and produced a
resolvable `dist/` (`rondo D-0001`, option (a): `npm install --ignore-scripts "git+file://<scratch>/lib#4bfbce7"`
→ `ls node_modules/prepare-probe-lib/` → `dist package.json` → `import ok: 1`). rondo states the
consequence in its own words: *"`--ignore-scripts` does not suppress a git dependency's `prepare` on
npm 10.9.2."*

**The rejection survives; the reason is replaced, and it is a stronger reason.** `prepare` is not
broken — it *works*, and that is the problem. It runs upstream code during installation under the
exact flag whose purpose is to stop upstream code running during installation. D-0004 calls
`--ignore-scripts` a standing rule and describes what allowing scripts buys: it "would hand every
transitive package code execution on every CI cell". A `prepare` on cadenza would hand cadenza that
power over every consumer's CI, silently, with the consumer's own policy flag set and having no
effect. continuo reached the same place from its own side and wrote it into `continuo D-0045`, which
chooses `prepack` over `prepare` precisely because "`prepare` is what npm runs when a *consumer*
installs a git dependency".

This correction is load-bearing for the rest of the document. Under D-0033's stated reason, route (a)
does not work; under the measurement, route (a) works and is refused. A design that repeated the
falsified reason would be recommending against a route for a fact that is not true, and the first
person to test it would find route (a) working and conclude the refusal was an oversight.

---

## 2. What "delivered" has to mean

A route is not a delivery unless a consumer that runs `npm ci --ignore-scripts` and nothing else ends
up with all four of these. They are separable, and the routes differ on which they buy.

- **D1 — The build output exists.** `dist/` with `index.js` and the module tree under it.
- **D2 — The full type contract arrives with it.** `dist/**/*.d.ts`, `.d.ts.map`, `.js.map`, **and
  `src/`**. This is one item, not four. D-0033 packs `src/` deliberately: both maps name `../src/*.ts`
  relatively and carry no inlined source, so a delivery holding `dist/` without `src/` ships two maps
  that resolve to nothing — which D-0033 calls "the one combination that is worse than emitting
  neither". **Nothing in this document proposes trimming `src/` out of the artifact.** Doing so would
  be a decision to drop or redesign the maps, with its own entry, not a delivery optimisation.
- **D3 — Resolution happens through the package name.** `import ... from "@suisya-systems/cadenza"`
  resolves, and `tsc --noEmit` under `module: NodeNext` finds the declarations at
  `node_modules/@suisya-systems/cadenza`. A route that leaves the consumer running a file out of a
  checkout by path has not delivered a *library*; it has delivered a directory. This is where the
  continuo precedent stops applying — see §5.5.
- **D4 — Identity is recorded *and* the artifact is checkable against it.** Two halves, and a route
  can hold one without the other, so they are scored separately below rather than summed into a verdict:
  - **D4a — identity is recorded.** The consumer's repository can answer "which cadenza is this?" from
    committed files. A pinned commit sha satisfies this, wherever it is written down. **The `version`
    field never does**: every build of every revision is `0.0.0`, so a lockfile saying `0.0.0`
    distinguishes nothing.
  - **D4b — the installed artifact is checkable against that identity.** Something fails when the bytes
    on disk are not the bytes the record names. This is §3's I3, and it is what a recorded-but-unenforced
    hash does not give. A route with D4a and not D4b tells you which revision was *intended* and cannot
    tell you the artifact was not swapped after the fact.

D1 and D2 are the same thing for every route that ships a packed tarball, and different things for
every route that does not.

---

## 3. Integrity, stated in three layers rather than summarised as "pinned"

The word "pinned" covers three different guarantees with three different strengths, and the routes are
not comparable until they are separated. rondo measured all three.

| Layer | What it fixes | Strongest available evidence |
|---|---|---|
| **I1 — source acquisition** | which revision of cadenza's *source* was obtained | a commit sha, verified after clone (`git rev-parse HEAD` compared to the expected value) |
| **I2 — build output** | that the bytes built here are the bytes used | nothing npm provides; only a digest recorded by whoever built |
| **I3 — installed artifact** | that the package npm installed is the package that was checked | a lockfile `integrity` hash npm **enforces** |

The distinctions that matter. The first three are `rondo D-0001`'s measurements; the fourth is §5.6's,
made for this document because the first three do not cover it and assuming they did produced a wrong
answer in an earlier draft.

- **A git dependency records an I3 hash and does not enforce it.** npm prints
  `npm warn skipping integrity check for git dependency` on every install. The hash is byte-stable
  across independent installs of the same sha, and it is decoration.
- **A `file:` dependency *pointing at a directory* has no I1, no I2 and no I3.** The lockfile records
  `"resolved": "../../../../home/.../continuo", "link": true` — a machine path, no registry URL, no
  integrity, no sha. rondo's summary: *which revision this was built against is recorded nowhere in
  the repository.* It also fails in the wrong direction: with the target renamed away,
  `npm ci --ignore-scripts` reported `added 1 package ... found 0 vulnerabilities` and deferred the
  failure to the first import.
- **A remote tarball URL — codeload, a Release asset, or a registry — gets a real, enforced I3 hash.**
  rondo calls it "strictly better than every other option here" on reproducibility.
- **A `file:` dependency *pointing at a local `.tgz`* is not the directory case, and gets a real,
  enforced I3 hash.** Measured in §5.6: the lockfile records
  `"resolved": "file:cadenza.tgz"` — a path **relative to the consumer's root**, not a machine
  path — beside a `sha512-...` `integrity` value, and `npm ci` refuses a tarball whose bytes do not
  match it with `npm error code EINTEGRITY`. The two `file:` forms differ on every layer that
  matters, and collapsing them is the mistake this bullet exists to prevent.

So: a commit sha (I1), a recorded-but-unenforced git SRI (a broken I3), and an enforced tarball SRI
(a real I3) are three different things. A route that has I1 and no I3 tells you what source was used
and cannot tell you the artifact was not swapped afterwards. A route that has I3 and no I1 tells you
the bytes are the reviewed bytes and cannot tell you which commit produced them. **A route needs both,
and only a route that records the sha *and* installs a digest-checked tarball has both.** The local
tarball of route (e-pack) is such a route; a `file:` link to a built checkout is not.

---

## 4. The exact-byte chain, required of any route that uploads or publishes

Today's `package` CI job builds, then runs `publint --strict`, then `attw --pack .`. Both tools reach
the tarball themselves — publint inspects the project, attw packs its own — and **the job retains no
named `.tgz`**. The job also runs on `ubuntu-latest` only, while the suite runs a 3-OS matrix. Neither
is a defect in D-0033's terms: it checks packaging, and packaging answers are runner-independent, which
the job's own comment says. It becomes a defect the moment something is *shipped*, because then "the
thing that was checked" and "the thing that was shipped" are two different packs of a directory that
was rebuilt in between.

Any route in section 5 that hands bytes to a third party must therefore run this chain, in this order,
over **one file**:

1. `npm ci --ignore-scripts` from the committed lockfile.
2. `npm run build` — **once**.
3. `npm pack` — **once**, producing a named `.tgz` that is retained as a job artifact.
4. `publint --strict` and `attw` against **that file**, not against a fresh pack of the directory.
5. **Smoke-install that file** into a scratch directory with `--ignore-scripts`, type-check an import
   through the package name under `module: NodeNext`, and execute it. This is D-0033's own second
   falsifier ("The tarball checks going quiet ... the answer is a real consumption smoke test in CI")
   promoted from a hypothetical to a step, and it is what rondo did by hand to confirm D-0033's claim.
6. Record the file's `sha256` in the job log and in whatever the route publishes alongside it.
7. Upload or publish **that file**, unrebuilt.

Step 5 needs one platform decision: cadenza's suite runs on ubuntu/macos/windows and the `package` job
does not. A centrally built tarball is platform-independent by construction — it is a tar of emitted
JavaScript — so the right coverage is a **Windows smoke-install of the same Ubuntu-built tarball**, not
a second tarball built on Windows. Building twice would produce two artifacts and require deciding
which one is the release, which is a question no route needs to have.

Nothing in §4 is proposed for implementation by the change section 10 drafts. It is the price attached
to routes (c) and (d2), stated so that the gate is not told they are cheap.

---

## 5. The routes

Each route is priced on: where `npm run build` runs, who owns a failure when cadenza's build changes,
which of D1–D4 it delivers, its I1/I2/I3 story, and what cadenza has to change to offer it.

### 5.1 Route (a) — a `prepare` script, so a git dependency builds on install

**Where the build runs:** on the consumer's machine, inside `node_modules`, during `npm install`.
**Who owns a build failure:** the consumer, at install time, with cadenza's toolchain in cadenza's
`devDependencies` — which npm does install for a git dependency, so this genuinely works.

**Delivers:** D1, D2, D3, **D4a and not D4b**: the sha in the specifier records which revision was
asked for, and the git SRI npm writes beside it is not enforced (§3), so nothing checks that the tree
npm actually fetched and built is that revision's.

**Cost to cadenza:** one line.

**Rejected**, on the corrected reason of §1.1 rather than D-0033's stated one. `prepare` *does* run
under `--ignore-scripts` (measured, npm 10.9.2). That makes it the cheapest route in the document and
the only one that is refused on principle rather than on price: it executes cadenza's build — and
therefore cadenza's `devDependencies`' install-time behaviour — inside a consumer whose install policy
says no dependency code runs at install. D-0004 is a standing rule about what a dependency may do to
its consumer; adding `prepare` would be cadenza deciding that rule does not apply to cadenza. continuo
refused the same line for the same reason (`continuo D-0045`), and rondo, having found that the fix is
one line, explicitly declined to ask for it.

**The honest counter-argument, recorded rather than hidden:** a consumer that wants this can have it
without cadenza's consent, by dropping `--ignore-scripts` for one dependency. That is the consumer's
policy decision to take against its own risk, in its own repository, and it is not cadenza's to take
on their behalf by shipping the script.

### 5.2 Route (b) — commit `dist/`

**Where the build runs:** in cadenza's repository, before every commit that touches `src/`.
**Who owns a build failure:** cadenza, at commit time. This is the route's real attraction: the failure
moves *earliest*, and it is the only route that makes the **existing** specifiers work — a pinned git
dependency and a codeload tarball both start delivering D1/D2/D3 the day `dist/` is tracked, with no
change on the consumer's side and no lifecycle script anywhere.

**Delivers:** D1, D2, D3, and **D4a without D4b** — exactly as well as a git dependency does, and for
the same reason: the sha is recorded and the SRI beside it is not enforced.

**Cost to cadenza — and this is the part that is not one line:**

- **`dist/` is gitignored** (`.gitignore:36`); un-ignoring it is trivial and is not the cost.
- **A new drift gate is mandatory, and the existing gate cannot be it.** `check:package` is
  `npm run build && npm run publint && npm run attw`, and `build` is `npm run clean && tsc -p ...`
  where `clean` deletes `dist/` outright (`scripts/clean.mjs`). So the current gate **overwrites the
  committed output before checking it** and would report green on a tree whose committed `dist/` is
  stale — the exact failure mode the route exists to prevent, made invisible by the gate that looks
  like it would catch it. The new gate is a fresh checkout, `npm ci --ignore-scripts`, `npm run build`,
  then an assertion that the tracked tree is unchanged and no new file appeared under `dist/`
  (`git status --porcelain dist` empty, and `git diff --exit-code -- dist`). Both halves are needed:
  `clean` deletes, so a file that stopped being emitted shows up as a deletion, and a file that started
  being emitted shows up as untracked.
- **That gate has to hold on Windows**, or be honestly scoped to Ubuntu. Line endings are the risk:
  `tsc` emits LF, and a Windows checkout under a `core.autocrlf` that rewrites them produces a diff
  that is real to git and meaningless to a reader. There is **no `.gitattributes` in this repository
  today**, so the route brings one with it, pinning `dist/` (and `src/`, since the maps must keep
  agreeing) to LF. (Written before D-0035, which added exactly that `.gitattributes` for row D9's own
  reason; a route (b) would now inherit it rather than bring it.) Untested claim, flagged as such: whether that is sufficient on the Windows cell is
  a measurement the route owes, not an assertion this document can make.
- **Every source change carries an emitted diff into review.** For a repository whose policy makes the
  history "a published artifact" (`docs/repository-policy.md` §2) and which requires an approving
  review on every pull request, this is a standing tax on the thing the policy protects: reviewers
  learn to skip a large mechanical hunk, and a hand-edited `dist/` is then a diff nobody reads. The
  drift gate catches that specific attack, which is another reason it is mandatory rather than
  advisory.
- **`src/` and `dist/` in one tree doubles what `knip` and the import-boundary walk see.** Both are
  rooted at `src/` today (D-0022's walk explicitly so), and D-0033 records that `dist/` being
  gitignored is part of why the boundary is untouched. Un-ignoring it re-opens that question.

**Not recommended as the temporary bridge**, and the reason is not the gate — the gate is buildable.
It is that route (b) is a **permanent change to what this repository is** (a repository that tracks its
own build output) bought to solve a problem that section 6 argues is temporary. When cadenza publishes,
route (b)'s cost stays and its benefit goes. A bridge should be removable.

### 5.3 Route (c) — publish `@suisya-systems/cadenza` to npm

**Where the build runs:** in cadenza's release CI, once, under §4's chain.
**Who owns a build failure:** cadenza, before anything is published; a consumer never builds.

**Delivers:** D1, D2, D3, and **the strongest D4 in the document** — D4a as a real version number that
finally makes the `version` field mean something, and D4b as an enforced integrity hash in the
consumer's lockfile, over bytes whose origin the registry also attests.

**This is the right permanent shape**, and section 6 argues it. It is also **not takeable here**, and
this document does not propose taking it. What it needs is not engineering:

- a registry name and scope, which `docs/repository-policy.md` §3 leaves open and D-0033 calls a
  one-way door;
- a version — `0.0.0` is not publishable in any meaningful sense, so the first publish is also the
  first release, requiring the tag and `CHANGELOG.md` entry `docs/repository-policy.md` §4 mandates;
- `private: true` removed, which is the switch D-0033 deliberately left alone;
- a publisher: an identity, credentials or trusted publishing, and a decision about provenance
  attestation;
- the release job of §4, including its retained tarball and its Windows smoke-install.

Every one of those is a human-gate question about authority and irreversibility, not a delivery
question. **Route (c) is presented as the recommended permanent shape and as an untaken decision.**

### 5.4 Route (d) — GitHub. Two mechanisms, not one

The brief lists this as one route. It is two, and they belong on opposite sides of the table.

**(d1) An Actions artifact — rejected.** It is not a dependency channel at all: an Actions artifact has
a bounded retention, no stable URL npm can install from, and requires authentication to fetch. Using
one would mean a consumer script downloading a build via the GitHub API and installing a local file,
which is route (e)'s shape with a worse I1 (no sha in a URL) and a fetch that expires. It should not be
weighed against the others; it is the thing people reach for when they mean (d2).

**(d2) A GitHub Release asset carrying the packed tarball — viable, and not cheap.** A release asset is
a stable public HTTPS URL to a `.tgz`, so a consumer's dependency is a remote tarball specifier and
npm gives it a **real, enforced I3 hash** (rondo measured exactly this property for the codeload
tarball). It delivers D1, D2, D3, D4 — the same shape as (c), minus the registry.

Its cost is that **it is a public release**, not an upload. `docs/repository-policy.md` §4: a release
tags `main` as `v<version>`, every release requires a `CHANGELOG.md` entry, and the GitHub release is
cut from that tag with notes drawn from the changelog. So (d2) needs the version, the tag, the
changelog entry and the release process — everything in §5.3's list except the registry name and the
publisher credentials. It also needs CI changes cadenza does not have: the workflows declare
`permissions: contents: read` and there is no release job, so the route adds a `contents: write` job
and the §4 chain under it. **Choosing (d2) is therefore a decision of the same kind as (c), taken at
the same gate**, and it buys a channel that (c) would then replace or have to coexist with.

### 5.5 Route (e) — the consumer builds cadenza from a pinned checkout, and installs what it packed

**Where the build runs:** on the consumer's machine and in the consumer's CI, as an explicit step,
never during `npm install`.
**Who owns a build failure:** the consumer, loudly, at a step they wrote. When cadenza's build changes
— a new script, a different `tsc` invocation — the consumer's step breaks visibly rather than silently.
That is the objection to this route and also its one safety property.

**The continuo precedent is operational only, and stating why is the whole of this section.** rondo
consumes continuo by cloning at a pinned sha, building once, and running `node <checkout>/dist/cli.js`
(`rondo D-0001`, item 2) — deliberately taking **no npm dependency**. That works because continuo has a
CLI: a process boundary needs a path to an executable and nothing else. **cadenza has no CLI and will
not have one**; it is a library, so a process boundary does not exist and D3 — resolution through the
package name — is not optional. "Clone and build" is where continuo's story ends and where cadenza's
question starts. `rondo D-0016` says as much: it calls this "consumer ownership of cadenza's
build/hosting", not a settled precedent to copy.

So the bridge has to name a contract. There are two candidates, and this document recommends the first.

**(e-pack) — the recommended form. Build, pack, install the tarball.** It has **two phases**, and
merging them is a defect rather than a simplification: `npm install <tarball>` *writes* the consumer's
lockfile, and `npm ci` *enforces* it. A bridge documented as one phase would either be an
`npm install` in CI — which rewrites the dependency entry it was supposed to be checked against — or
an `npm ci` on a machine with no lockfile entry to check.

*Phase 1 — bootstrap, run once by a person, and its output is committed.*

```
git clone https://github.com/suisya-systems/cadenza.git vendor/cadenza-src
git -C vendor/cadenza-src checkout <sha>
git -C vendor/cadenza-src rev-parse HEAD                       # must equal <sha>        [I1]
npm --prefix vendor/cadenza-src ci --ignore-scripts
npm --prefix vendor/cadenza-src run build
npm pack ./vendor/cadenza-src --pack-destination vendor        # -> vendor/suisya-systems-cadenza-0.0.0.tgz
node vendor/pin.mjs record                                     # writes vendor/cadenza.tgz.sha256   [I2]
npm install --ignore-scripts ./vendor/suisya-systems-cadenza-0.0.0.tgz                  [I3, written]
```

(The `./` on the local paths is load-bearing and was missing when this section was first written: npm
reads a bare `vendor/cadenza-src` as the GitHub shorthand `github:vendor/cadenza-src` and tries to
clone it. Corrected here and in the bridge page, where the commands are normative.)

**Committed afterwards, and this list is the contract:** the `.tgz` itself, `vendor/cadenza.tgz.sha256`,
`vendor/pin.mjs`, `<sha>` (in the consumer's own decision record or a pinning file), and the
`package.json` / `package-lock.json` the install wrote. `vendor/cadenza-src` — the clone — is **not**
committed and can be deleted the moment phase 1 ends; it is the only thing here that is scratch.

**Why `node vendor/pin.mjs` and not `sha256sum`.** `sha256sum` is a GNU coreutils command: it is absent
on a stock macOS (`shasum -a 256`) and on Windows (`Get-FileHash`), and the whole point of this bridge
is that it works on a consumer whose matrix includes both. Node is the one interpreter a consumer of a
Node library certainly has, so the check is a script rather than a shell builtin — the same call
cadenza made for its own `clean`, whose comment says it in as many words: "written as a script rather
than `rm -rf dist` so the same command works on the Windows matrix cell ... nothing cadenza asks a
developer to run may assume a POSIX shell". The helper is small enough to state in full:

```js
// vendor/pin.mjs -- record or check the pinned cadenza tarball. `node vendor/pin.mjs record|check`.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const TARBALL = "vendor/suisya-systems-cadenza-0.0.0.tgz";
const DIGEST = "vendor/cadenza.tgz.sha256";
const actual = createHash("sha256").update(readFileSync(TARBALL)).digest("hex");

if (process.argv[2] === "record") {
  writeFileSync(DIGEST, `${actual}\n`);
} else {
  const expected = readFileSync(DIGEST, "utf8").trim();
  if (actual !== expected) {
    console.error(`${TARBALL} is not the pinned artifact.\n  expected ${expected}\n  actual   ${actual}`);
    process.exit(1);
  }
}
```

*Phase 2 — every CI run and every fresh clone. No `npm install`, and nothing is rewritten.* There are
two forms, and **the first is recommended**.

**2a (recommended) — commit the `.tgz`; phase 2 rebuilds nothing.**

```
node vendor/pin.mjs check     # cheap, portable, and fails with a diagnosis      [I2 checked]
npm ci --ignore-scripts       # enforces the committed lockfile                  [I3 checked]
```

The consumer commits `vendor/suisya-systems-cadenza-0.0.0.tgz` (118 files, ~128 KB) alongside the
digest and the sha. Phase 2 is then a plain `npm ci` on every platform, with no clone, no cadenza
toolchain, no build, and — decisively — **no dependence on `npm pack` being byte-reproducible
anywhere**, because nothing is packed twice. The build happens once, on one machine, by one person,
per cadenza bump.

Its cost is a vendored binary in the consumer's history: a blob no reviewer can read, which a reader
must take on the digest and the sha rather than on inspection. That is a real cost and it is the
smaller one — the artifact is regenerable from `<sha>` by phase 1 at any time, and §5.6's whole
platform question disappears with it.

**2b (alternative) — rebuild in CI, for a consumer who refuses a vendored binary.**

```
git clone ... vendor/cadenza-src && git -C vendor/cadenza-src checkout <sha>
git -C vendor/cadenza-src rev-parse HEAD                       # must equal <sha>        [I1 checked]
npm --prefix vendor/cadenza-src ci --ignore-scripts
npm --prefix vendor/cadenza-src run build
npm pack ./vendor/cadenza-src --pack-destination vendor        # same path as phase 1
node vendor/pin.mjs check                                      # fails loudly on drift   [I2 checked]
npm ci --ignore-scripts                                        # enforces the lockfile   [I3 checked]
```

**2b requires `npm pack` to be byte-identical to phase 1's**, because the lockfile hash is enforced —
and §5.6 shows that is measured on one platform and **has two named reasons to be false across
platforms**: as argued, cadenza set no `newLine` in `tsconfig.build.json` and had no `.gitattributes`
to hold `src/` to LF in a checkout. **Both were pinned when D-0035 was taken (row D9)**, which removes
the two named reasons without turning a one-platform measurement into a cross-platform guarantee. A
consumer whose bootstrap and CI platforms differ should still prefer 2a.

In both forms the `pin.mjs check` is not decoration beside the lockfile: it fails with a *diagnosis*
("the tarball is not the one this repository was pinned to"), whereas the `npm ci` that would fail a
moment later reports `EINTEGRITY` against a hash nobody can read. It is also cache-independent, which §5.6 shows
matters. Both are wanted, in that order.

- **D1, D2:** yes, by the same mechanism as every other tarball route — `npm pack` honours `files`, so
  `dist/`, `src/` and both map families arrive together. rondo ran the equivalent steps and got
  `118 files` and `import ok: 70 exports`; §5.6 reproduces it.
- **D3:** yes. The tarball installs under the package name, and the `exports` map, `types` and the
  declarations resolve as they do from a registry. This is what (e-pack) buys over a bare checkout.
- **D4a and D4b, and D4b is stronger than an earlier draft of this document claimed.** D4a is the
  committed sha beside the committed digest. D4b is a **real, npm-enforced** lockfile integrity hash —
  §5.6 measured `npm ci` rejecting a swapped tarball with `EINTEGRITY` — plus `pin.mjs check`, which
  is cache-independent where npm is not. The `resolved` value is a path relative to the consumer's
  root, so unlike a directory link it is not machine-specific. What it still lacks against (c) and (d2)
  is **provenance**: npm can say these are the pinned bytes and cannot say where they came from. The
  chain from `<sha>` to the tarball is the documented procedure and the person who ran it.

**Because I3 is enforced, byte-reproducibility of `npm pack` is load-bearing rather than a curiosity.**
If phase 2's pack differed from phase 1's, every CI run would fail. §5.6 measures it and finds it
holds; §5.6 also states exactly how far that measurement reaches.

**(e-link) — the documented fallback. `file:` to the built checkout, with `--install-links`.**
rondo measured `--install-links` failing on continuo, but the failure was `files: ["dist"]` with no
`dist/` on disk: `--install-links` packs the target, and the target was unbuilt. **Against a checkout
that has already been built, that failure does not apply** — the pack contains `dist/` and `src/`, and
D1/D2/D3 hold. What does not change is §3's *directory* case, which this is: a `file:` dependency on a
directory records a machine path, no integrity and no revision, and it fails green when the target
moves. That is the whole difference from (e-pack), which points `file:` at a `.tgz` and gets an
enforced hash and a relative path for it. (e-link) is the fallback for a developer's local loop, where
a path is the point; it is not what a consumer's CI should install from.

**(e-codeload) — rejected variant, named because it will be proposed.** Installing
`https://github.com/suisya-systems/cadenza/archive/<sha>.tar.gz` gets an enforced I3 on the *source*
and full working tree (remote tarballs are not filtered by `files`), but delivers no `dist/`, so the
consumer must run cadenza's build **inside `node_modules`** — which the next `npm ci` erases. rondo
weighed this exact shape for continuo, called it "the runner-up", and rejected it for making the
consumer "responsible for building a dependency it does not own" by reproducing that dependency's
internal build in its own repository. (e-pack) has the same ownership cost and does not additionally
put a build product somewhere `npm ci` deletes.

**Cost to cadenza for route (e): documentation.** No `package.json` change, no CI change, no tracked
build output, no lifecycle script, no release. The two phases above, written down in cadenza's README
or a `docs/` page so that "the supported bridge" is a specification cadenza owns rather than folklore
the consumer reconstructs. That is the entire price, and it is why it is the recommended bridge.

### 5.6 What was measured for this document, and how far it reaches

Run on 2026-09-05 in this worktree at cadenza `62cd11f` (tree identical to `4b53eca` for everything
that packs), **npm 10.9.2, Node v22.17.0, Linux** — the same npm rondo measured on. Two questions,
because §5.5's contract fails without both.

**Q1 — is `npm pack` byte-reproducible?** Three packs, and a full `npm run build` (which cleans
`dist/` first, so every emitted file has a new mtime) between the second and the third:

```
7010decf...a4fa  a.tgz   # pack of the built tree
7010decf...a4fa  b.tgz   # immediate second pack
7010decf...a4fa  c.tgz   # pack after `npm run build` re-emitted every file
```

Identical. npm normalises entry mtimes when it packs, which is the usual source of tar variance, and
removing it is what makes form 2b of §5.5 possible at all. **How far this reaches, and why the limit
is not a formality:** one machine, one npm, one Node, one platform. It shows that *time* and
*rebuilding* do not perturb the tarball. It does **not** show that a Windows runner produces the same
bytes, and there are two named reasons to expect it may not:

- **`tsconfig.build.json` sets no `newLine`.** TypeScript's line-ending default is a property of the
  compiler and the platform rather than of this configuration, so emitted `dist/` files are not pinned
  to LF by anything in this repository. (Not measured here: cadenza is on TypeScript 7.0.2, whose
  compiler is native, and this worktree has no Windows runner. The point is that nothing in the tree
  *fixes* it, not that it is known to differ.)
- **There is no `.gitattributes`.** `files` packs `src/`, whose bytes come from the consumer's
  checkout, so a Windows clone under a `core.autocrlf` that rewrites line endings packs different
  `.ts` files than a Linux one — with no compiler involved at all.

**Both were fixed when D-0035 was taken (row D9): `newLine: "lf"` and a `.gitattributes` holding every
packed path to LF — `src/**`, `dist/**`, `README.md`, `LICENSE` and `package.json`, since `README.md`
and `LICENSE` travel in the tarball on the same terms as the sources.** The two paragraphs above are kept as the reason those two lines exist.
What the fix does *not* do is convert this section's measurement into a cross-platform one: it removes
two named ways the bytes could differ, and no Windows runner has packed cadenza yet.

`package-lock.json` pins `typescript@7.0.2` exactly, so the *compiler* is the same input everywhere;
the newline and the checkout are not. This is why §5.5 recommends form **2a**, which packs once and
therefore cannot be affected by any of it, and why §11 rows D6 and D9 own what is left.

**Q2 — does npm enforce a local tarball's integrity?** A consumer package installed `a.tgz`:

```
"resolved": "file:cadenza.tgz",
"integrity": "sha512-ZbEn1qa3hfsJ8MbORdQFOxAm6RvstE89y6Mg8NCd4mepKz8972eFXeiNxHINkpIAtzMKuB3s/kM+cq8EistuRA=="
```
```
node -e 'import("@suisya-systems/cadenza")'   ->  import ok: 70 exports
```

A different but valid tarball (`a.tgz` unpacked, one byte appended to `README.md`, repacked) was then
put at that exact path and `npm ci --ignore-scripts` re-run **with a cold cache**:

```
npm warn tarball tarball data for @suisya-systems/cadenza@file:.../cadenza.tgz (sha512-ZbEn1q...) seems to be corrupted.
npm error code EINTEGRITY
npm error sha512-ZbEn1q... integrity checksum failed when using sha512: wanted sha512-ZbEn1q... but got sha512-n/w69E... (127157 bytes)
```

**So the integrity is real and enforced**, which is the opposite of the directory-link case and the
opposite of what an earlier draft of this document asserted by analogy with it.

**Q3 — does §5.5's helper do what the document says?** The `vendor/pin.mjs` block above was extracted
from this file verbatim and run against the same tarballs, so the code in the document is checked
rather than sketched:

```
node vendor/pin.mjs record   ->  wrote 7010decf...a4fa
node vendor/pin.mjs check    ->  exit 0
node vendor/pin.mjs check    ->  exit 1, after the tampered tarball was put in place:
    vendor/suisya-systems-cadenza-0.0.0.tgz is not the pinned artifact.
      expected 7010decf...a4fa
      actual   5f749d40...b541d
```

**One wrinkle, recorded because it will confuse somebody.** The same swap with a *warm* npm cache
exited 0, and the installed `README.md` was the **original** content, not the tampered file. That is
integrity working rather than failing — npm resolved the recorded hash to bytes it already held and
declined to use the file on disk — but it means a tampered or drifted tarball produces `EINTEGRITY` on
a cold cache (a CI runner) and a silent, correct install on a warm one (a developer's laptop). It is
another reason §5.5 keeps the explicit `pin.mjs check`: that check is cache-independent and reports the
drift in the one place npm will not.

---

## 6. The comparison, and the recommendation

| Route | D1 build | D2 types+maps+`src` | D3 by package name | D4a identity recorded | D4b artifact checkable | Where the build runs | Cost to cadenza | Verdict |
|---|---|---|---|---|---|---|---|---|
| (a) `prepare` | yes | yes | yes | sha in the specifier | **no** — git SRI unenforced | consumer, **during install** | one line | **rejected** — runs dependency code under `--ignore-scripts` (§1.1) |
| (b) committed `dist/` | yes | yes | yes | sha in the specifier | **no** — git SRI unenforced | cadenza, every commit | new drift gate + `.gitattributes` + review tax, permanently | **not recommended** — permanent cost for a temporary problem |
| (c) npm publication | yes | yes | yes | **a real version number** | **yes** — enforced, plus registry provenance | cadenza release CI | registry name, version, publisher, provenance, release job | **preferred permanent shape — untaken decision** (§9) |
| (d1) Actions artifact | n/a | n/a | no | no | no | — | — | **rejected** — not a dependency channel |
| (d2) Release asset | yes | yes | yes | tag + version | **yes** — enforced | cadenza release CI | tag + changelog + release process + `contents: write` job | viable; a release decision, at the same gate as (c) |
| (e-pack) consumer builds and packs | yes | yes | yes | committed sha + digest | **yes** — enforced (§5.6), no provenance | consumer, once per bump (2a) | **documentation only** | **recommended temporary bridge** |
| (e-link) `file:` + `--install-links` to a *directory* | yes | yes | yes | **no** — a machine path, no revision | **no** — no integrity at all | consumer, explicit step | documentation only | fallback for local development only |
| (e-codeload) source tarball + build in place | no | no | no | sha in the URL | on the *source* only | consumer, inside `node_modules` | none | rejected — build erased by `npm ci` |

**The recommendation is two-part, and the parts are not alternatives.**

**Temporary bridge: (e-pack).** It is the only route that delivers all four properties to the standard
each can be delivered at today, while changing nothing about what cadenza is. It needs no decision
cadenza has not taken, no release, no tracked artifact, no lifecycle script; it costs a page of
documentation; and it is **removable without residue** the day a stronger route exists — a consumer
deletes a build step and changes a specifier. Its weakness is exactly the one rondo names and accepts
for continuo: the consumer owns the build of a dependency it does not own. That is a real cost, and it
is the cost of a bridge rather than a destination. What it is **not** weak on is integrity: §5.6
measured `npm ci` enforcing the local tarball's hash, so the bridge's gap against (c) is provenance —
npm cannot say where the bytes came from — rather than tamper-detection.

**Permanent shape: (c).** Registry publication is the only route where a consumer's `npm ci` is the
whole of the story: no build step, no clone, an enforced integrity hash in the lockfile, a version
number that identifies a revision, and `dist`/`src`/maps arriving by the same `files` allowlist that
CI already checks. (d2) reaches the same technical shape and stops short of it, buying a second
distribution channel that (c) would have to replace or coexist with — so if a gate is going to take a
release decision at all, it should take (c) and not (d2). But **that gate has not been asked**, and
§5.3 lists what it would have to answer. This document names the destination; it does not walk there.

---

## 7. What the bridge obliges cadenza to, and what it does not

**Obliges:** keeping §5.5's bootstrap phase true. If cadenza's build acquires a step — a copy
script, a second config — the documented bridge is wrong the same day, and rondo's CI breaks on a step
rondo wrote. That is the ownership cost, and it is one-directional: cadenza can break its consumers by
changing its build, and the only thing that fixes it structurally is a route where cadenza builds.
This is an argument for (c) on a timer, not an argument against the bridge.

**Does not oblige:** publishing, versioning, tagging, or making `0.0.0` mean anything. The bridge works
against `private: true` at `0.0.0` because `npm pack` and a local tarball install both ignore `private`
(rondo measured a `private: true` cadenza tarball installing and importing cleanly). This is worth
stating because it is the reason the bridge can be taken without touching any of §5.3's open questions.

---

## 8. What later publication changes

For the record, so that taking the bridge is not read as a commitment either way:

- **For (e-pack), publication supersedes it wholesale.** The clone, the build, the pack and the digest
  record all disappear; the consumer's dependency becomes an ordinary pinned version with an enforced
  integrity hash. `rondo D-0016` says the same from the other side: cadenza publishing fires its first
  falsifier and "the delivery objection — the larger half of this entry — disappears". The bridge is
  written to be deleted.
- **For (b), publication does not supersede it.** The tracked `dist/`, the drift gate and the review
  tax all remain, having become pure cost. That asymmetry is the strongest argument against (b) as a
  bridge.
- **For (d2), publication forces a second decision**: whether the registry replaces the Release-asset
  channel or runs beside it. Two channels for one artifact means two things a consumer can be pinned to
  and two answers to "which cadenza is this", which is the question §3 exists to keep answerable.

---

## 9. What this document does not close

- **Publication (route (c)) is not proposed here.** §5.3 lists the five things a gate must decide, all
  of them about authority and irreversibility. `docs/repository-policy.md` §3 is where the openness is
  recorded, and it stays open.
- **Whether rondo consumes cadenza at all.** `rondo D-0016` decided **no** for lap 1, on two reasons:
  delivery (this document's subject) and the fact that the one record rondo most needs — the agent-type
  record — is not on cadenza's exported surface. **This document closes the first reason only.** A
  parallel lane is implementing the agent-type record; even with both closed, whether rondo takes the
  dependency remains rondo's decision, to be re-argued on its merits.
- ~~**Whether the bridge should live in cadenza's README or a `docs/` page**, and whether cadenza ships
  a script that runs it.~~ **Closed:** row D5 of D-0035 - a `docs/` page,
  [`docs/artifact-delivery-bridge.md`](../artifact-delivery-bridge.md), linked from `README.md`, and no
  shipped script.
- **Byte-reproducibility of `npm pack` across machines and platforms.** Measured stable across time
  and across a clean rebuild on one Linux machine (§5.6); unmeasured on Windows, where §5.6 names two
  reasons it may differ. It is load-bearing only for form 2b, because the enforced lockfile hash turns
  a differing pack into a red CI run; the recommended form 2a packs once and does not depend on it
  (§11 rows D6, D9).
- ~~**Whether cadenza pins its own emitted and checked-out line endings** (`newLine`,
  `.gitattributes`).~~ **Closed:** taken as row D9 of D-0035 and implemented with it. It was never a
  precondition of the bridge — 2a does not need it — and it is what makes 2b sound off one platform.
- **Windows behaviour of a route (b) drift gate**, which is only owed if the gate overturns the
  recommendation.

---

## 10. The entry, as taken

**Taken on 2026-09-05 at cadenza's human gate and written to
[`DECISIONS.md`](../../DECISIONS.md) as `D-0035`.** This section drafted that entry while the decision
was open; it is now a pointer rather than a second copy, because a design document holding its own
version of a taken entry is a place for the two to drift. Read the entry in `DECISIONS.md`:

**`D-0035` - The artifact-delivery bridge: a consumer builds cadenza from a pinned checkout and
installs what it packed; publication remains the destination and remains untaken.**

The ID was left as `D-00NN` here while a parallel lane was also writing to `DECISIONS.md`; `D-0035`
is the number the entry took, and the index row was added with it.

---

## 11. The decision table, and what the gate took

Each row was a question this document had to answer and that the gate could overturn independently.
**On 2026-09-05 the gate took all nine as recommended**, and they are `D-0035`. The recommendation
column is kept as it was written and now reads as the decision; the reason column is why it is that
one, not a second argument for it.

| # | Open decision | **Taken (2026-09-05, D-0035)** | Reason |
|---|---|---|---|
| D1 | Which route is the **temporary bridge**? | **TAKEN: (e-pack)**, in two phases: bootstrap once (clone at sha → verify sha → `npm ci --ignore-scripts` → `npm run build` → `npm pack` → commit sha256 → `npm install` that tarball), then **form 2a** for the recurring phase — commit the `.tgz`, and every CI run is a portable digest check plus `npm ci --ignore-scripts` | It is the only route delivering build output, the full type contract, resolution by package name and a checkable identity while changing nothing about what cadenza is. Cost is one page of documentation, and it is removable without residue when publication lands |
| D2 | Is a `prepare` script added? | **TAKEN: no** | It *works* — rondo measured npm 10.9.2 running it under `--ignore-scripts`, falsifying D-0033's stated reason — and that is why it is refused: it executes cadenza's build inside a consumer whose policy forbids dependency code at install (D-0004). continuo refused the same line for the same reason (`continuo D-0045`) |
| D3 | Is `dist/` committed? | **TAKEN: no** | It would repair the existing git specifier, and it is the one route whose cost survives publication. It also needs a new drift gate — `check:package` cannot serve, because `build` cleans `dist/` first and would mask stale committed output — plus a `.gitattributes` (which row D9 has since added for its own reason) and an emitted diff in every review |
| D4 | Is publication (c) or a Release asset (d2) taken now? | **TAKEN: neither.** (c) is named the permanent shape; both are left for a separate gate | `docs/repository-policy.md` §3 leaves registry name, release process and publisher open; D-0033 calls a registry name a one-way door and stays `private: true`. (d2) is not the cheap half of (c): it needs a version, a tag, a changelog entry and a `contents: write` release job, and it buys a channel (c) would then replace. Overturnable in one direction only — a gate that wants a release should take (c) |
| D5 | Where does the bridge specification live? | **TAKEN: a `docs/` page in cadenza** - [`docs/artifact-delivery-bridge.md`](../artifact-delivery-bridge.md), referenced from `README.md`; no script shipped | A route the consumer reconstructs is folklore. A shipped script would be cadenza taking responsibility for running commands in the consumer's CI, which is the ownership the bridge deliberately leaves on the consumer's side |
| D6 | Does the recurring phase rebuild the tarball, or is the `.tgz` committed? | **TAKEN: committed (form 2a).** Rebuild (2b) stays documented for a consumer who refuses a vendored binary, with its platform caveat attached | Once the lockfile hash turned out to be enforced, `npm pack` byte-stability stopped being a curiosity: under 2b an unstable pack is `EINTEGRITY` on every CI run, not a weaker record. It was measured stable across repeated packs and a full clean rebuild on one Linux machine (§5.6) and **not** across platforms, and §5.6 named two reasons it may differ on Windows (no `newLine`, no `.gitattributes`) - both pinned by row D9. 2a packs once and is immune to all of it; its price is a ~128 KB unreviewable blob in the consumer's history, regenerable from the sha at any time |
| D7 | Does any route trim `src/` from the artifact to reduce its size? | **TAKEN: no, in every route** | Both `.js.map` and `.d.ts.map` name `../src/*.ts` relatively with no inlined source (D-0033). Removing `src/` is a decision to drop or redesign the maps, and needs its own entry |
| D8 | If a release route is ever taken, what does the release job do? | **TAKEN, as a record for that day: build once, pack once, check *that* file with publint/attw, smoke-install it with `--ignore-scripts` on Ubuntu **and** Windows, record its sha256, upload those exact bytes** | Today's `package` job builds and lets both tools pack independently, retains no named `.tgz`, and runs on Ubuntu only. That is fine for checking packaging and wrong for shipping: without the chain, the checked bytes and the shipped bytes are two different packs of a directory rebuilt in between (`continuo D-0045` reaches the same rule from its side) |
| D9 | Does cadenza harden its own output so a rebuilt pack is platform-independent — `newLine: "lf"` in `tsconfig.build.json`, and a `.gitattributes` holding `src/` (and `dist/`) to LF? | **TAKEN, and implemented with the entry.** `newLine: "lf"` in `tsconfig.build.json` and a `.gitattributes` holding every packed path to LF - `src/**`, `dist/**`, `README.md`, `LICENSE`, `package.json`, because a rebuilt pack must reproduce all of them. Still not a precondition of the bridge: form 2a does not need it | It is small, it is the difference between form 2b working everywhere and working on one platform, and it is wanted anyway by any future route (b). It is deliberately not folded into the bridge decision: 2a does not need it, so making it a precondition would price the recommendation above what it costs. A gate that wants 2b as the default should take D9 with it |
