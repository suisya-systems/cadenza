/**
 * `FilesystemLocalPathVerifier`: the run-side precondition design doc section
 * 3.1 calls mandatory (D-0038).
 *
 * Target-only, and the reason is in `parity/target-only.json`. In short: the
 * Python G1 never had a verifier either -- the port was empty on both sides --
 * so there is no source case to translate, and the whole surface is new.
 *
 * **How these cases are written.** The rule under test is "the resolved path is
 * inside a resolved allowed root", and it has two failure directions that a
 * naive suite covers neither of:
 *
 * - **Green where it should be red.** A verifier that compared strings with
 *   `startsWith`, or that never resolved a link, passes every "it accepts a
 *   directory under the root" case ever written. So the accepting cases are
 *   outnumbered here by cases built specifically against those two mistakes:
 *   the prefix sibling (`<root>-evil`), the link out of the root, the link in
 *   a middle component, and the root that is itself a link.
 * - **Red where it should be green.** A verifier that refused every symlink
 *   would also pass every escape case, and would be unusable on macOS, where
 *   `/var` is a link. So the link that stays inside the root is asserted to be
 *   ACCEPTED, and to report the target as `real`.
 *
 * Symlinks are created as junctions on Windows, where an unprivileged process
 * cannot make a directory symlink but can make a junction, and `realpathSync`
 * resolves both. That is what keeps the whole file running on every matrix cell
 * instead of carrying a skip (D-0009).
 */
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { FilesystemLocalPathVerifier } from "../../src/adapters/local-path/verifier.js";
import { localPathSource } from "../../src/domain/clone-source.js";
import {
  AllowedRootUnusableError,
  LocalPathEscapesRootError,
  LocalPathMissingError,
  LocalPathNotADirectoryError,
  LocalPathUnreadableError,
} from "../../src/domain/errors.js";
import { nativePath } from "../../src/domain/python-path.js";
import { refusal } from "../support.js";

const verifier = new FilesystemLocalPathVerifier();

/**
 * A directory link that an unprivileged process can create on every supported
 * platform.
 *
 * `"dir"` needs the symlink privilege on Windows and `"junction"` does not, and
 * `realpathSync` resolves a junction exactly as it resolves a symlink -- which
 * is the property under test. A junction's target must be absolute, so every
 * caller here passes one.
 */
function linkDirectory(target: string, link: string): void {
  symlinkSync(target, link, nativePath.name === "windows" ? "junction" : "dir");
}

/**
 * The fixture root, with links resolved.
 *
 * Resolved deliberately: on macOS `mkdtempSync` hands back a path under `/var`,
 * which is a link to `/private/var`, so an unresolved fixture would make every
 * `real` in this file differ from every `declared` for a reason that has nothing
 * to do with the case being written. The link that matters is created by the
 * case that is about links.
 */
let base: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "cadenza-verify-")));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** `<base>/<parts>`, absolute and spelled the way this platform spells paths. */
function under(...parts: readonly string[]): string {
  // `PathFlavour.join` is `os.path.join` with exactly two operands, so the parts
  // are folded rather than spread: spreading them drops everything after the
  // first and silently builds the parent of the path the case meant.
  return nativePath.normpath(parts.reduce((left, right) => nativePath.join(left, right), base));
}

/** The same fold as {@link under}, from an arbitrary absolute anchor. */
function path(anchor: string, ...parts: readonly string[]): string {
  return parts.reduce((left, right) => nativePath.join(left, right), anchor);
}

function makeDirectory(...parts: readonly string[]): string {
  const path = under(...parts);
  mkdirSync(path, { recursive: true });
  return path;
}

function makeFile(...parts: readonly string[]): string {
  const path = under(...parts);
  writeFileSync(path, "", "utf8");
  return path;
}

describe("what it accepts", () => {
  test("a directory under the root, reporting the root that granted it", () => {
    const root = makeDirectory("roots");
    const project = makeDirectory("roots", "web");

    expect(verifier.verify(localPathSource(project), [root])).toEqual({
      declared: project,
      real: project,
      root,
    });
  });

  test("the root itself, which is a project directory as much as any other", () => {
    const root = makeDirectory("roots");

    expect(verifier.verify(localPathSource(root), [root])).toEqual({
      declared: root,
      real: root,
      root,
    });
  });

  test("a link that stays inside the root, reporting the target as `real`", () => {
    // The green case that stops the rule being satisfied by refusing links.
    // `declared` and `real` differ here and nowhere else in this block, which is
    // the whole reason the result carries both.
    const root = makeDirectory("roots");
    const target = makeDirectory("roots", "actual", "web");
    const link = under("roots", "web");
    linkDirectory(target, link);

    expect(verifier.verify(localPathSource(link), [root])).toEqual({
      declared: link,
      real: target,
      root,
    });
  });

  test("a root that is itself a link, because the roots are resolved too", () => {
    // A verifier that resolved the path and compared it against an UNRESOLVED
    // root refuses this, and the operator has no fault to fix: their checkouts
    // simply live behind a link. It is the mirror of the escape cases.
    const target = makeDirectory("real-roots");
    const root = under("roots");
    linkDirectory(target, root);
    const project = makeDirectory("real-roots", "web");

    expect(verifier.verify(localPathSource(path(root, "web")), [root])).toEqual({
      declared: path(root, "web"),
      real: project,
      root: target,
    });
  });

  test("a `..` that stays inside the root", () => {
    const root = makeDirectory("roots");
    makeDirectory("roots", "web");
    makeDirectory("roots", "api");
    const declared = path(root, "web", "..", "api");

    const verified = verifier.verify(localPathSource(declared), [root]);
    expect(verified.real).toBe(under("roots", "api"));
    expect(verified.root).toBe(root);
  });

  test("the second root, when it is the one that contains the path", () => {
    const first = makeDirectory("roots-a");
    const second = makeDirectory("roots-b");
    const project = makeDirectory("roots-b", "web");

    expect(verifier.verify(localPathSource(project), [first, second]).root).toBe(second);
  });

  test("the result is frozen, so a caller cannot edit what it was told", () => {
    const root = makeDirectory("roots");
    const verified = verifier.verify(localPathSource(root), [root]);

    expect(Object.isFrozen(verified)).toBe(true);
    expect(() => {
      (verified as { real: string }).real = under("elsewhere");
    }).toThrow(TypeError);
  });
});

describe("containment, which is the rule this exists for", () => {
  test("a sibling that merely shares a prefix with the root is outside it", () => {
    // The `startsWith` bug, planted deliberately: "/roots-evil" begins with
    // "/roots" and is not under it. `isRelativeTo` compares components, and this
    // case is what says so.
    const root = makeDirectory("roots");
    const sibling = makeDirectory("roots-evil");

    const caught = refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(sibling), [root]),
    );
    expect(caught.message).toMatch(/lexically outside/);
  });

  test("a link that lands on a prefix sibling of the root is outside it too", () => {
    // The prefix bug again, one layer down, and it is a DIFFERENT comparison:
    // the case above catches `startsWith` in the lexical pre-check, and this one
    // catches it in the real one. The declared path is properly inside the root
    // and only its resolution lands on `<root>-evil`, so the lexical check
    // passes it through and the containment test after resolution is the only
    // thing standing between the catalog and a directory it never allowed.
    // Found by mutation: replacing the resolved comparison with `startsWith`
    // left every other case in this file green.
    const root = makeDirectory("roots");
    const outside = makeDirectory("roots-evil", "web");
    const link = under("roots", "web");
    linkDirectory(outside, link);

    const caught = refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(link), [root]),
    );
    expect(caught.message).toContain(`resolves to ${outside}`);
  });

  test("a link inside the root that points out of it is refused, naming where it went", () => {
    const root = makeDirectory("roots");
    const outside = makeDirectory("elsewhere", "secrets");
    const link = under("roots", "web");
    linkDirectory(outside, link);

    const caught = refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(link), [root]),
    );
    expect(caught.message).toContain(`resolves to ${outside}`);
  });

  test("a link in a middle component is refused just as one at the end is", () => {
    // Resolution is of the whole path, not of its last component. A verifier
    // that called `lstat` on the final name only accepts this.
    const root = makeDirectory("roots");
    const outside = makeDirectory("elsewhere");
    makeDirectory("elsewhere", "web");
    linkDirectory(outside, under("roots", "hop"));

    const caught = refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(path(root, "hop", "web")), [root]),
    );
    expect(caught.message).toContain(`resolves to ${path(outside, "web")}`);
  });

  test("a link pointing at the root's own parent is refused", () => {
    const root = makeDirectory("roots");
    linkDirectory(base, under("roots", "up"));

    refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(under("roots", "up")), [root]),
    );
  });

  test("a `..` that climbs out of the root is refused before anything is opened", () => {
    // Two claims in one case. The `..` is refused, and it is refused with the
    // roots pointing at a directory that does not exist -- so the refusal cannot
    // have come from a filesystem call. That is what pins the ordering the
    // adapter documents: a path outside the roots is never probed.
    const root = under("roots-that-are-not-there");
    const declared = path(root, "..", "etc");

    const caught = refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(declared), [root]),
    );
    expect(caught.message).toMatch(/lexically outside/);
  });
});

describe("existing, missing, and not a directory are three different answers", () => {
  test("a path inside the root that is not there is missing, not an escape", () => {
    // The distinction the brief for this belt asks for: an operator whose
    // catalog has gone stale must not be told their path escaped a root.
    const root = makeDirectory("roots");

    const caught = refusal(LocalPathMissingError, () =>
      verifier.verify(localPathSource(under("roots", "web")), [root]),
    );
    expect(caught.message).toMatch(/does not exist/);
  });

  test("a dangling link is missing, for the same reason and with the same fix", () => {
    const root = makeDirectory("roots");
    const target = makeDirectory("gone");
    const link = under("roots", "web");
    linkDirectory(target, link);
    rmSync(target, { recursive: true, force: true });

    refusal(LocalPathMissingError, () => verifier.verify(localPathSource(link), [root]));
  });

  test("a file inside the root is not a directory to clone from", () => {
    const root = makeDirectory("roots");
    const file = makeFile("roots", "web");

    const caught = refusal(LocalPathNotADirectoryError, () =>
      verifier.verify(localPathSource(file), [root]),
    );
    expect(caught.message).toContain(file);
  });

  test("a file in a middle component is not a directory either", () => {
    const root = makeDirectory("roots");
    makeFile("roots", "web");

    refusal(LocalPathNotADirectoryError, () =>
      verifier.verify(localPathSource(path(root, "web", "inner")), [root]),
    );
  });

  test("a directory this process cannot enter is unreadable, not missing", () => {
    // Total on every platform rather than skipped on some (D-0009). Windows
    // ignores the mode bits and a process running as root ignores them too, so
    // the case asks the operating system what it actually did and asserts the
    // branch that follows. Either way something is asserted, and the assertion
    // is the one that distinguishes "cannot be read" from "is not there".
    const root = makeDirectory("roots");
    const project = makeDirectory("roots", "web");
    chmodSync(project, 0o000);
    let denied: boolean;
    try {
      accessSync(project, constants.R_OK | constants.X_OK);
      denied = false;
    } catch {
      denied = true;
    }

    if (denied) {
      const caught = refusal(LocalPathUnreadableError, () =>
        verifier.verify(localPathSource(project), [root]),
      );
      expect(caught.message).toMatch(/not readable/);
    } else {
      expect(verifier.verify(localPathSource(project), [root]).real).toBe(project);
    }
    chmodSync(project, 0o700);
  });
});

describe("a root that cannot be used is the layer's fault, and is named as one", () => {
  test("a root that does not exist", () => {
    const root = under("roots");

    const caught = refusal(AllowedRootUnusableError, () =>
      verifier.verify(localPathSource(path(root, "web")), [root]),
    );
    expect(caught.message).toContain(root);
  });

  test("a root that is a file", () => {
    const root = makeFile("roots");

    refusal(AllowedRootUnusableError, () =>
      verifier.verify(localPathSource(path(root, "web")), [root]),
    );
  });

  test("a broken root is reported even when another root would have granted the path", () => {
    // Fails closed. Skipping the unusable root would accept this call and leave
    // the real fault -- an unmounted disk, a typo in `allowed_local_roots` --
    // to be discovered by whichever project needed exactly that root.
    const good = makeDirectory("roots-a");
    const project = makeDirectory("roots-a", "web");
    const broken = under("roots-b");

    refusal(AllowedRootUnusableError, () =>
      verifier.verify(localPathSource(project), [good, broken]),
    );
  });
});

describe("the caller's own arguments are a RangeError, never a refusal", () => {
  test("no roots at all is refused rather than read as a wildcard", () => {
    // The one catastrophic default available here: an empty list must never mean
    // "anything goes". `parseLocalPath` applies the same rule at the catalog.
    const project = makeDirectory("roots", "web");

    expect(() => verifier.verify(localPathSource(project), [])).toThrow(RangeError);
  });

  test("a relative root", () => {
    expect(() => verifier.verify(localPathSource(under("roots", "web")), ["roots"])).toThrow(
      RangeError,
    );
  });

  test("a relative path", () => {
    expect(() => verifier.verify(localPathSource("web"), [makeDirectory("roots")])).toThrow(
      RangeError,
    );
  });

  test("an empty path", () => {
    expect(() => verifier.verify(localPathSource(""), [makeDirectory("roots")])).toThrow(
      RangeError,
    );
  });

  test("a source that is not a local_path", () => {
    const root = makeDirectory("roots");
    expect(() =>
      verifier.verify({ kind: "git_url", url: "https://example.invalid/org/repo.git" } as never, [
        root,
      ]),
    ).toThrow(RangeError);
  });
});

describe("the order of the checks, which is fixed and observable", () => {
  test("lexical containment is answered before existence", () => {
    // Both faults are present: the path escapes AND nothing is there. The
    // escape is what is reported, because the filesystem is never asked about a
    // path outside the roots.
    const root = makeDirectory("roots");

    refusal(LocalPathEscapesRootError, () =>
      verifier.verify(localPathSource(under("elsewhere", "web")), [root]),
    );
  });

  test("the roots are answered before the path", () => {
    // The root is a file, so the path under it cannot exist either, and the two
    // faults have different answers: asking about the root first gives
    // `AllowedRootUnusableError`, asking about the path first would give the
    // `ENOTDIR` reading, `LocalPathNotADirectoryError`. Which one arrives is the
    // ordering, and a project must not be blamed for a root that is not one.
    const root = makeFile("roots");

    const caught = refusal(AllowedRootUnusableError, () =>
      verifier.verify(localPathSource(path(root, "web")), [root]),
    );
    expect(caught.message).toContain(root);
  });
});
