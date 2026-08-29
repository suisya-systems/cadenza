/**
 * The `os.path` / `pathlib` port's own contract.
 *
 * Target-only: the Python suite has nothing to say about any of this, because in
 * Python there is nothing to say. `posixpath.normpath` and
 * `PureWindowsPath.is_absolute` are the standard library, and
 * `tests/test_toml_loader.py` asks about them exactly once
 * (`test_a_drive_less_path_is_not_absolute_on_windows`) and only to explain why
 * `tests/support.py` builds its paths the way it does. Reimplementing them in a
 * language whose `node:path` answers differently is what created the surface, so
 * the surface gets assertions.
 *
 * **Every expected value here was taken from CPython 3.12**, not reasoned out.
 * The generating comparison ran both flavours over several thousand generated
 * paths; what is pinned below is the subset that a reader can check by eye and
 * that a future edit is most likely to break -- the cases where `node:path` and
 * `os.path` disagree, and the cases where the two Python answers disagree with
 * each other.
 *
 * Both flavours are asserted on **every** platform. A test that only exercised
 * the host's flavour would leave the other half of a cross-platform port
 * unexercised on every machine that runs it.
 */
import { describe, expect, test } from "vitest";

import { posix, windows } from "../../src/domain/python-path.js";

describe("posixpath", () => {
  test("normpath keeps exactly two leading slashes and collapses three", () => {
    // POSIX gives exactly two an implementation-defined meaning. This is one of
    // the places `path.posix.normalize` disagrees: it collapses two as well.
    expect(posix.normpath("//a/b")).toBe("//a/b");
    expect(posix.normpath("///a/b")).toBe("/a/b");
    expect(posix.normpath("////a")).toBe("/a");
    expect(posix.normpath("//")).toBe("//");
  });

  test("normpath drops a trailing slash", () => {
    // The other `node:path` disagreement: `path.posix.normalize` keeps it.
    expect(posix.normpath("/a/b/")).toBe("/a/b");
    expect(posix.normpath("x/")).toBe("x");
  });

  test("normpath collapses dots and cannot climb past the root", () => {
    expect(posix.normpath("a/./b")).toBe("a/b");
    expect(posix.normpath("a//b")).toBe("a/b");
    expect(posix.normpath("/../a")).toBe("/a");
    expect(posix.normpath("/a/../../b")).toBe("/b");
    expect(posix.normpath("../a")).toBe("../a");
    expect(posix.normpath("a/..")).toBe(".");
    expect(posix.normpath("")).toBe(".");
  });

  test("both absoluteness questions agree here", () => {
    // They only come apart on Windows; asserted so that a change which unified
    // the two predicates fails on this side too.
    expect(posix.isAbsolute("/srv")).toBe(true);
    expect(posix.isPathlibAbsolute("/srv")).toBe(true);
    expect(posix.isAbsolute("C:/srv")).toBe(false);
    expect(posix.isPathlibAbsolute("C:/srv")).toBe(false);
  });

  test("is_relative_to compares whole components, case-sensitively", () => {
    expect(posix.isRelativeTo("/srv/catalog/web", "/srv/catalog")).toBe(true);
    expect(posix.isRelativeTo("/srv/catalog", "/srv/catalog")).toBe(true);
    // "/srva" is not under "/srv": a prefix of the STRING is not a prefix of
    // the path, and this is the check that keeps a local_path contained.
    expect(posix.isRelativeTo("/srva/x", "/srv")).toBe(false);
    expect(posix.isRelativeTo("/A/b", "/a")).toBe(false);
  });

  test("join lets an absolute right-hand side win", () => {
    expect(posix.join("/srv/catalog", "web")).toBe("/srv/catalog/web");
    expect(posix.join("/srv/catalog", "/abs")).toBe("/abs");
    expect(posix.join("/", "web")).toBe("/web");
  });
});

describe("ntpath", () => {
  test("normpath preserves a run of leading separators verbatim", () => {
    // CPython 3.12 moved this into C, and it does NOT collapse the run the way
    // the older pure-Python ntpath did. Three separators stay three.
    expect(windows.normpath("///")).toBe("\\\\\\");
    expect(windows.normpath("////a")).toBe("\\\\\\\\a");
    expect(windows.normpath("/a/b/")).toBe("\\a\\b");
  });

  test("normpath does not collapse a dot-dot inside a UNC anchor", () => {
    // In `//a/../b` the `..` is the SHARE, which is part of the anchor and not
    // a component. `path.win32.normalize` collapses it; CPython does not.
    expect(windows.normpath("//a/../b")).toBe("\\\\a\\..\\b");
    expect(windows.normpath("//server/share/../..")).toBe("\\\\server\\share\\");
    expect(windows.normpath("//?/C:/a/../b")).toBe("\\\\?\\C:\\b");
  });

  test("normpath collapses separators after a drive, and keeps a bare drive bare", () => {
    expect(windows.normpath("C:///a")).toBe("C:\\a");
    expect(windows.normpath("C:/a/../../b")).toBe("C:\\b");
    // Not "C:.": the `.` fallback is only for a path with neither drive nor root.
    expect(windows.normpath("C:.")).toBe("C:");
    expect(windows.normpath("C:./a")).toBe("C:a");
    expect(windows.normpath("a/..")).toBe(".");
  });

  test("the two absoluteness questions disagree, which is the point", () => {
    // `ntpath.isabs` needs only a leading separator; `PureWindowsPath` needs a
    // drive as well. `_normalise_path` asks the first and `layerDocument` asks
    // the second, and `tests/support.py` exists because of the difference.
    expect(windows.isAbsolute("/srv/catalog")).toBe(true);
    expect(windows.isPathlibAbsolute("/srv/catalog")).toBe(false);
    expect(windows.isAbsolute("C:/srv")).toBe(true);
    expect(windows.isPathlibAbsolute("C:/srv")).toBe(true);
    expect(windows.isAbsolute("C:srv")).toBe(false);
    expect(windows.isPathlibAbsolute("C:srv")).toBe(false);
  });

  test("a UNC anchor is absolute only once it names both server and share", () => {
    expect(windows.isPathlibAbsolute("//s/sh")).toBe(true);
    expect(windows.isPathlibAbsolute("//s/sh/a")).toBe(true);
    expect(windows.isPathlibAbsolute("//")).toBe(false);
    expect(windows.isPathlibAbsolute("//s")).toBe(false);
    // A device path is not a UNC one: `?` and `.` are excluded by name.
    expect(windows.isPathlibAbsolute("//?/x")).toBe(false);
    expect(windows.isPathlibAbsolute("//./x")).toBe(false);
    // And `///C:` is excluded because CPython spells the exclusion
    // `drv_parts[2] not in '?.'` -- a SUBSTRING test, which the empty piece
    // this path produces satisfies. Written as two character comparisons, this
    // one comes out absolute and CPython says it is not.
    expect(windows.isPathlibAbsolute("///C:")).toBe(false);
  });

  test("is_relative_to folds case, and still compares whole components", () => {
    expect(windows.isRelativeTo("C:/SRV/web", "c:/srv")).toBe(true);
    expect(windows.isRelativeTo("//S/SH/a", "//s/sh")).toBe(true);
    expect(windows.isRelativeTo("C:/ab", "C:/a")).toBe(false);
  });

  test("join adopts a drive rather than concatenating one", () => {
    expect(windows.join("C:/srv", "web")).toBe("C:/srv\\web");
    // A rooted right-hand side keeps the left's drive.
    expect(windows.join("C:/srv", "/abs")).toBe("C:/abs");
    // Same drive, stated again: adopted, not repeated.
    expect(windows.join("C:/srv", "C:rel")).toBe("C:/srv\\rel");
    // A different drive discards the left entirely.
    expect(windows.join("C:/srv", "D:rel")).toBe("D:rel");
    // A UNC anchor with no root needs a separator before a tail -- but only
    // when there IS a tail, which is why the empty case comes back unchanged
    // while `C:/srv` picks up a trailing separator.
    expect(windows.join("//s/sh", "a")).toBe("//s/sh\\a");
    expect(windows.join("//s/sh", "")).toBe("//s/sh");
    expect(windows.join("C:/srv", "")).toBe("C:/srv\\");
  });
});
