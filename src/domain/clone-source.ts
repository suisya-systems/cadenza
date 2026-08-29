/**
 * `CloneSource` -- the tagged union of where a project's code comes from.
 *
 * Design doc section 3.1. URL, local path and "create it fresh" carry different
 * validation, different reproducibility and different trust boundaries, so
 * `kind` is always present; nothing here touches a filesystem or a network.
 *
 * **Scope of this file in the bootstrap.** Only the union and its canonical
 * form are ported. `parse_clone_source` -- the validation of schemes, userinfo,
 * control characters and allowed local roots -- is the subject of
 * `tests/test_clone_source.py` (57 source cases) and belongs to the belt that
 * ports that file. The digest pilot needs the *shape* the digest covers and
 * nothing else, and porting the parser as a side effect of the pilot would put
 * 57 unledgered cases into the tree.
 */

/** Clone from a remote over an authenticated transport. */
export interface GitUrlSource {
  readonly kind: "git_url";
  readonly url: string;
}

/** Clone from a lexically normalised absolute path on the operator's machine. */
export interface LocalPathSource {
  readonly kind: "local_path";
  readonly path: string;
}

/** No source exists; the run-side adapter initialises one. */
export interface NewRepositorySource {
  readonly kind: "new";
}

export type CloneSource = GitUrlSource | LocalPathSource | NewRepositorySource;

/**
 * The three factories freeze what they return, for the reason `project` does:
 * the source is part of a persisted digest, and `readonly` is a claim the type
 * checker makes rather than one the runtime keeps. Python's frozen dataclasses
 * keep it at runtime.
 */
export function gitUrlSource(url: string): GitUrlSource {
  return Object.freeze({ kind: "git_url", url });
}

export function localPathSource(path: string): LocalPathSource {
  return Object.freeze({ kind: "local_path", path });
}

export function newRepositorySource(): NewRepositorySource {
  return Object.freeze({ kind: "new" });
}

/**
 * A frozen copy of `source`, whatever the caller handed over.
 *
 * The factories above freeze what *they* return, and that is not enough on its
 * own: `CloneSource` is a structural type, so `{ kind: "git_url", url }` written
 * as a plain object literal is a perfectly valid one and is not frozen. A caller
 * can pass such an object, keep the reference, and mutate `url` afterwards --
 * and `configDigest` would then report a different value for a project nobody
 * edited. Python's frozen dataclasses have no such route.
 *
 * Rebuilt through the factories rather than spread, so the copy carries exactly
 * the fields its `kind` defines. The `switch` is exhaustive: a member added
 * later fails to compile here rather than falling through to a shared reference.
 */
export function snapshotSource(source: CloneSource): CloneSource {
  switch (source.kind) {
    case "git_url":
      return gitUrlSource(source.url);
    case "local_path":
      return localPathSource(source.path);
    case "new":
      return newRepositorySource();
  }
}

/**
 * The union member as the digest payload holds it.
 *
 * The **tag travels with the value**, which is what stops a URL and a path that
 * happen to spell the same string from sharing a digest. In Python `kind` is a
 * `ClassVar` -- not a dataclass field, so it is absent from equality and
 * present in `to_canonical` -- while here it is the discriminant. The observable
 * result, which is all the digest sees, is identical.
 */
export function toCanonical(source: CloneSource): Readonly<Record<string, string>> {
  switch (source.kind) {
    case "git_url":
      return { kind: source.kind, url: source.url };
    case "local_path":
      return { kind: source.kind, path: source.path };
    case "new":
      return { kind: source.kind };
  }
}
