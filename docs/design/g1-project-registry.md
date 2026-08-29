# G1 — Project Registry

Status: accepted (bootstrap scope)
Applies to: `cadenza.domain`, `cadenza.application`, `cadenza.ports`,
`cadenza.adapters.toml_catalog`

This document is the contract for G1. The code implements what is written here;
where the two disagree, this document is the defect report.

## 1. What G1 is

G1 answers exactly one question:

> given a **name** an operator typed, which **project** is that, and what
> concrete facts does a run need in order to act on it?

It answers with three facts — **clone source**, **base branch**, and an
**immutable project identity** — plus enough metadata for a run to be audited
and replayed later. It is pure data and pure rules: G1 never clones, never
touches a network, and never reads a working tree.

G1 is **provider-agnostic**. Nothing in `domain`, `application` or `ports` names
Claude, GitHub, interlock, or any other executor. (The repository uses
"provider-agnostic" throughout; "provider-neutral" is not used, so that a
boundary reviewer greps for one word.)

### Deliberately out of scope

- Executing a clone, creating a repository, or verifying that a path exists.
  G1 records *intent*; carrying it out belongs to a run-side adapter.
- Any dependency on interlock. See §9.

## 2. Identity: `project_id` vs. alias

A run that stored only the name an operator typed cannot be audited: the
catalog's clone source or base branch may have changed since, and the run's
record would silently start meaning something else.

So identity is split:

- **`project_id`** — immutable, opaque, assigned once. It is the table key in
  the catalog file. Shape: `^[a-z][a-z0-9_-]{0,63}$`. A `project_id` is
  **never renamed and never reused**; "renaming" a project means creating a new
  one. Runs persist this.
- **alias** — a mutable display name. Same shape rule, but free to change.
  Aliases exist for humans typing at a prompt; nothing durable refers to one.

Both live in **one flat namespace** (§5.4), so resolution never has to break a
tie between "this is an id" and "this is somebody else's alias".

## 3. Data model

### 3.1 `CloneSource` — a tagged union

URL, local path and "create it fresh" have different validation, different
reproducibility and different trust boundaries; collapsing them into one string
field hides that. `kind` is the tag and is always required.

| `kind` | fields | meaning |
| --- | --- | --- |
| `git_url` | `url` | clone from a remote |
| `local_path` | `path` | clone from a path on the operator's machine |
| `new` | *(none)* | no source exists; the run-side adapter initialises one |

**`git_url`.** Allowed schemes: `https`, `ssh`. Everything else is refused,
naming the scheme:

- `http` — plaintext; a clone is code execution, so the transport is authenticated
  or it is refused.
- `git` — the unauthenticated git protocol, same reason.
- `file` — a filesystem path wearing a URL; use `local_path`, which is the form
  that carries the containment rules.

The URL must additionally carry no embedded credentials (a userinfo component),
with one exception: the bare `git@` userinfo of `ssh://git@host/...`, which
names a *user*, not a secret. A password in a tracked catalog file is a leaked
password. Control characters and whitespace are refused.

**`local_path`.** Validated **lexically** in the domain — the domain never
touches a filesystem, so that catalog data stays checkable in CI, on another
machine, without the operator's disks:

1. `path` is anchored: a relative path resolves against the **directory of the
   layer file that defined it** (§5.5), never against the process CWD.
2. `~` is expanded.
3. The result is normalised lexically (`..` and `.` collapsed) and must remain
   inside one of the **allowed local roots** of *the layer that defined it*
   (§3.3). A path that climbs out is refused, naming the root it escaped.
4. NUL bytes, control characters and the empty path are refused.

Filesystem-dependent checks — does it exist, is any component a symlink, is it
readable — are **not** G1's. They are a run-side precondition, declared as the
`LocalPathVerifier` port (`cadenza.ports`) and left unimplemented in this
milestone. This is a real trust boundary and is stated as one: a lexically
contained path can still be a symlink pointing anywhere, so the run-side
verifier is mandatory before a clone, not optional hardening.

**`new`.** Carries no fields. Cadenza does not create repositories; recording
`kind = "new"` is how the catalog says "the run-side adapter is responsible for
initialising this, and there is nothing to reproduce from".

### 3.2 `Project` and `ResolvedProject`

`Project` is what a composed catalog holds:

- `project_id`
- `aliases` — ordered, unique, disjoint from every other name (§5.4)
- `source: CloneSource`
- `base_branch`

`base_branch` is a git ref name and is validated as one: non-empty, no
whitespace or control characters, no `..`, no `@{`, none of ``~^:?*[\``, no
leading or trailing `/`, no `//`, no leading `-`, no trailing `.`, not the
single character `@`, no `.lock` suffix on any component, and no component
beginning with `.`.

The validator's job is to move a git-level refusal earlier, so the property that
matters is one-directional: it must refuse **everything git refuses**, and it is
allowed to be stricter. `tests/test_refs.py` pins that direction against
`git check-ref-format` itself rather than against a second copy of the rules, so
a rule this list forgets fails the build instead of surfacing at the clone.
Being stricter than git is a deliberate choice in exactly one place: a bare `@`
is git's shorthand for HEAD in revision syntax, so a catalog and whatever
resolves it would read it differently.

`ResolvedProject` is the **snapshot handed to a run** — the whole point of §2:

- `project_id` (immutable identity)
- `source`, `base_branch` (the facts, as of resolution)
- `aliases` (informational)
- `config_digest` (§4)
- `provenance` — for each field, which layer and which file it came from

A run persists `project_id` and `config_digest` alongside `source` and
`base_branch`. Later, a changed digest is the signal that the catalog moved
under a run that already happened; without it, that change is invisible.

### 3.3 Layer-level settings

A layer file carries, besides its projects:

```toml
schema_version = 1

[catalog]
allowed_local_roots = ["~/work"]
```

`allowed_local_roots` is **layer-local and does not merge**: a `local_path`
declared in layer L is checked against L's own roots. A tracked file shared by
everyone must not be able to authorise a directory on someone else's machine,
and an operator's local file must not need permission from the tracked one. If
a layer declares a `local_path` and has no roots, that is a refusal, not an
implicit "anything goes".

## 4. `config_digest`

`sha256:<hex>` over the canonical JSON encoding of the resolved project's
**semantics** — `project_id`, `aliases` (sorted), `source` (normalised union),
`base_branch`. Encoding is UTF-8, `sort_keys=True`,
`separators=(",", ":")`, `ensure_ascii=False`, `allow_nan=False`.

Provenance and file paths are **excluded**: moving a catalog file must not
change what the digest says about the project. The digest is a statement about
configuration, not about where it was typed.

## 5. Composition

### 5.1 Layers

Ordered, lowest precedence first:

1. **tracked** — `config/projects.toml`, committed, shared.
2. **local** — `config/projects.local.toml`, gitignored, operator-owned.

Composition is a pure function of the layer documents. Adding a third layer
later means adding an entry to the list, not changing the rules.

### 5.2 Schema version

Every layer file declares `schema_version`. A missing version, a non-integer, or
a version this build does not know is refused for **that file**, naming it.
Refusing beats guessing: a newer file read by an older cadenza would otherwise
resolve to something plausible and wrong.

### 5.3 Field-level merge

For a `project_id` present in both layers, each field the local layer *states*
replaces the tracked value; fields it omits are inherited. Two fields do not
follow that rule, for reasons:

- **`source` replaces whole.** It is a tagged union. Merging it field-wise
  lets a local file supply a `path` on top of a tracked `kind = "git_url"` and
  produce a shape nobody wrote. An override restates the entire `[…​.source]`
  table, `kind` included.
- **`aliases` replaces whole.** Appending would leave no way to *remove* an
  alias, and a name is exactly the kind of thing that has to be removable.

The local layer may also introduce a `project_id` the tracked layer does not
have. That is an operator-only project and is normal.

### 5.4 Names collide → refuse

After composition, `project_id`s and aliases share one namespace. If any name
maps to more than one project, composition fails and names both sides. Nothing
is resolved by precedence, "last wins", or declaration order — a silent winner
here means an operator's `cadenza run foo` quietly acts on the wrong repository.

### 5.5 Tombstones

A local layer removes a tracked project with:

```toml
[project.legacy_thing]
tombstone = true
```

- A tombstoned table carrying any other field is refused: it reads as both
  "delete this" and "and configure it", and only one of those can be meant.
- A tombstone naming a `project_id` no layer defines is refused. That is a typo
  or a stale local file, and silently accepting it means the operator's next
  typo is silent too.

### 5.6 Unknown fields → refuse

Every table is closed. An unknown key — anywhere, at any level — is refused,
naming the key and the file. A typo'd `base_brnach` that falls back to a default
is exactly the failure this catalog exists to prevent.

### 5.7 Provenance

Each resolved field records the layer name and the file it came from, so a
`cadenza` operator asking "why is this the base branch?" gets an answer without
diffing two files by eye.

## 6. Resolution

`resolve_project(catalog, name) -> ResolvedProject`

`name` is matched against the flat namespace of §5.4. Because that namespace is
collision-free by construction, the lookup is total and unambiguous: exactly one
project, or `ProjectNotFoundError` naming the closest candidates.

## 7. Errors

Every refusal is a typed exception under `cadenza.domain.errors`, carrying the
file and the key at fault. Nothing is refused via a bare `ValueError` and
nothing is refused silently — a catalog that half-loads is worse than one that
does not load.

## 8. Layout

```
src/cadenza/
  domain/        identities, clone sources, project, digest, errors  (no I/O)
  application/   composition and resolution                          (no I/O)
  ports/         protocols the outside world implements
  adapters/
    toml_catalog/   TOML files -> raw layer documents
    interlock/      placeholder; see §9
    claude_code/    placeholder
```

Dependency direction is inward only: `adapters -> application -> domain`, and
`ports` is depended on, never depends. `tests/test_import_boundaries.py`
enforces this in CI rather than in review.

The package is `cadenza`, and no module under it is named `core` or `runtime` —
those names belong to interlock's vocabulary and reusing them makes a boundary
review harder than it needs to be.

## 9. On interlock

Cadenza is designed to sit on top of interlock, and **does not depend on it** —
not in `pyproject.toml`, not in an extra, not in a comment that says
"temporarily". Interlock's control-plane API and SQLite schema are marked
throwaway on interlock's own side (interlock D-0026), and interlock is frozen,
so importing them would convert a deliberate spike into a dependency by inertia
and no later stabilisation is coming to change that. Whether cadenza takes a
control-plane dependency at all, and against what, is decided here
(`DECISIONS.md` D-0023) rather than settled elsewhere.

`cadenza/adapters/interlock/` therefore exists and is empty: the seam is
reserved so that the first real integration is a new file in a place already
agreed, and `tests/test_import_boundaries.py` fails the build the day anything
under `cadenza` imports `claude_org_runtime`.
