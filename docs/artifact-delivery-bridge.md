# The artifact-delivery bridge: installing cadenza until it is published

This is the supported way to depend on cadenza today. It is a **bridge**, not a destination: cadenza
is `private: true` at `0.0.0` and publishes nothing, and the day it publishes to a registry this page
is deleted and you replace all of it with an ordinary pinned dependency. It is written to be thrown
away, and it is written down rather than left to folklore because a route you reconstruct yourself is
not a route cadenza can be held to.

Taken at cadenza's human gate on 2026-09-05 as [`DECISIONS.md` D-0035](../DECISIONS.md); the argument
behind it, the routes that were weighed and what was measured are in
[`docs/design/artifact-delivery.md`](design/artifact-delivery.md).

## 1. What you get, and what you do not

`npm pack` of a built cadenza is a normal package. Installing that tarball gives you:

- `dist/` — the build output, with `index.js` and the module tree.
- The full type contract: `dist/**/*.d.ts`, `.d.ts.map`, `.js.map`, **and `src/`**. The maps name
  `../src/*.ts` relatively and carry no inlined source, so the sources travel with them; a stack trace
  or a "go to definition" lands on cadenza's source rather than on generated output.
- Resolution **by package name**: `import { ... } from "@suisya-systems/cadenza"` works, and
  `tsc --noEmit` under `module: NodeNext` finds the declarations under
  `node_modules/@suisya-systems/cadenza`. There is no supported deep path — the `exports` map names
  `.` and `./package.json` and nothing else.
- An identity you can check: the commit sha you pinned, the sha256 you committed, and an
  npm-enforced integrity hash in your lockfile.

What you do not get is **provenance**. npm can tell you the bytes are the bytes you pinned; nothing
here tells you where they came from. The chain from the commit sha to the tarball is this procedure
and the person who ran it. That gap closes with publication and not before.

**The build runs on your machine, in a step you wrote — never during `npm install`.** cadenza adds no
`prepare` and no other lifecycle script, deliberately: a `prepare` *does* run under
`--ignore-scripts` for a git dependency (measured on npm 10.9.2), which is exactly why cadenza will
not ship one. It would execute cadenza's build inside your CI under the flag whose whole purpose is to
stop dependency code running at install time. The cost of that refusal is this page: when cadenza's
build acquires a step, your step breaks visibly, and you own the fix.

## 2. Phase 1 — bootstrap, once per cadenza bump

Run by a person, on one machine. Its output is committed. Everything below assumes you are at the root
of the consuming repository, and that `<sha>` is the cadenza commit you are pinning.

```console
$ git clone https://github.com/suisya-systems/cadenza.git vendor/cadenza-src
$ git -C vendor/cadenza-src checkout <sha>
$ git -C vendor/cadenza-src rev-parse HEAD                    # must print <sha>
$ npm --prefix vendor/cadenza-src ci --ignore-scripts
$ npm --prefix vendor/cadenza-src run build
$ npm pack vendor/cadenza-src --pack-destination vendor       # -> vendor/suisya-systems-cadenza-0.0.0.tgz
$ node vendor/pin.mjs record                                  # writes vendor/cadenza.tgz.sha256
$ npm install --ignore-scripts vendor/suisya-systems-cadenza-0.0.0.tgz
```

The last command is an `npm install` on purpose: it is what *writes* the dependency entry and the
integrity hash into your `package.json` and `package-lock.json`. Phase 2 never installs — it
enforces what this wrote. Merging the two phases into one is the one way to get this wrong: an
`npm install` in CI rewrites the entry it was supposed to be checked against, and an `npm ci` on a
machine that has no lockfile entry has nothing to check.

**Commit afterwards — this list is the contract:**

- `vendor/suisya-systems-cadenza-0.0.0.tgz` (118 files, ~128 KB)
- `vendor/cadenza.tgz.sha256`
- `vendor/pin.mjs`
- `<sha>`, in your own decision record or a pinning file — the tarball cannot tell you which revision
  it is, because every build of every revision is version `0.0.0`
- the `package.json` and `package-lock.json` the install wrote

**Do not commit `vendor/cadenza-src`.** The clone is scratch and can be deleted the moment phase 1
ends; it is regenerable from `<sha>` whenever you need it again.

### `vendor/pin.mjs`

Copy this verbatim. It is a Node script rather than `sha256sum` because `sha256sum` is GNU coreutils:
it is absent on a stock macOS (`shasum -a 256`) and on Windows (`Get-FileHash`), and this bridge has to
work on a matrix that includes both. Node is the one interpreter a consumer of a Node library certainly
has.

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

## 3. Phase 2 — every CI run and every fresh clone

Two forms. **Take form 2a unless you have a reason not to.**

### 2a (recommended) — the `.tgz` is committed, and nothing is rebuilt

```console
$ node vendor/pin.mjs check     # portable, and fails with a diagnosis
$ npm ci --ignore-scripts       # enforces the committed lockfile
```

That is the whole of it, on every platform: no clone, no cadenza toolchain, no build, and — decisively
— no dependence on `npm pack` being byte-reproducible anywhere, because nothing is packed twice. The
build happened once, on one machine, in phase 1.

Its price is a vendored binary in your history: ~128 KB no reviewer can read, which a reader takes on
the digest and the sha rather than on inspection. It is regenerable from `<sha>` by re-running phase 1
at any time.

### 2b (alternative) — rebuild in CI, if you refuse a vendored binary

```console
$ git clone https://github.com/suisya-systems/cadenza.git vendor/cadenza-src
$ git -C vendor/cadenza-src checkout <sha>
$ git -C vendor/cadenza-src rev-parse HEAD                    # must print <sha>
$ npm --prefix vendor/cadenza-src ci --ignore-scripts
$ npm --prefix vendor/cadenza-src run build
$ npm pack vendor/cadenza-src --pack-destination vendor       # same path as phase 1
$ node vendor/pin.mjs check                                   # fails loudly on drift
$ npm ci --ignore-scripts                                     # enforces the lockfile
```

**The caveat, and it is not a formality: 2b requires your rebuilt `npm pack` to be byte-identical to
phase 1's.** The lockfile integrity hash is enforced, so a pack that differs by one byte is
`EINTEGRITY` on a correct tree, on every run. Packing was measured stable across repeated packs and
across a full clean rebuild on **one Linux machine** with npm 10.9.2 (npm normalises entry mtimes when
it packs, which is the usual source of tar variance); it has **not** been measured across platforms.

cadenza has since pinned the two things that were most likely to differ — `newLine: "lf"` in
`tsconfig.build.json`, and a `.gitattributes` holding every packed path to LF (`src/**`, `dist/**`,
`README.md`, `LICENSE`, `package.json`), so neither the compiler's emit nor a `core.autocrlf` checkout
changes the bytes (D-0035, row D9). That removes the
two known reasons; it does not turn one platform's measurement into a cross-platform guarantee. If your
bootstrap machine and your CI runners are different platforms, prefer 2a.

## 4. Why the digest check sits beside `npm ci`

It looks redundant next to an enforced lockfile hash. It is not, for two reasons:

- **It fails with a diagnosis.** `node vendor/pin.mjs check` says *this tarball is not the one this
  repository was pinned to*, and prints both digests. The `npm ci` that would fail a moment later
  reports `EINTEGRITY` against a base64 hash nobody can read.
- **It is cache-independent, and npm is not.** Swap the tarball with a **cold** npm cache and
  `npm ci` fails with `EINTEGRITY` (measured). Do the same with a **warm** cache and npm exits 0
  having installed the *original* bytes it already held — which is integrity working, not failing, but
  it means a drifted tarball is loud on a CI runner and silent on a developer's laptop. The digest
  check is the one place that reports it either way.

Both are wanted, in that order.

## 5. What this bridge is not

- **Not a `file:` link to a checkout.** `file:` to a directory (with or without `--install-links`)
  records a machine path with no revision and no integrity, and it fails green when the target moves.
  Against a *built* checkout it does deliver a working import, so it is fine for a local development
  loop where a path is the point. It is not what CI should install from.
- **Not a source tarball built in place.** Installing
  `https://github.com/suisya-systems/cadenza/archive/<sha>.tar.gz` delivers no `dist/`, so you would
  build inside `node_modules` — which the next `npm ci` erases.
- **Not a commitment about publication.** The bridge works against `private: true` at `0.0.0` because
  `npm pack` and a local tarball install both ignore `private`. Whether cadenza publishes, under what
  name and on what release process, is an open decision at cadenza's gate
  ([`docs/repository-policy.md`](repository-policy.md) section 3).
