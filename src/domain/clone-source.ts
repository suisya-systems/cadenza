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

export function gitUrlSource(url: string): GitUrlSource {
  return { kind: "git_url", url };
}

export function localPathSource(path: string): LocalPathSource {
  return { kind: "local_path", path };
}

export function newRepositorySource(): NewRepositorySource {
  return { kind: "new" };
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
