/**
 * `CloneSource`: the tagged union and its per-kind rules (design doc section 3.1).
 *
 * Ported from `tests/test_clone_source.py`. The mapping, case by case, is
 * `parity/clone-source.ledger.json`. `parseCloneSource` itself came over with
 * the composition belt, because `composeCatalog` calls it -- this belt closes
 * the gap that left, and its own 57 source cases were not exercised until now.
 */
import { describe, expect, onTestFinished, test } from "vitest";

import {
  ALLOWED_URL_SCHEMES,
  type CloneSource,
  gitUrlSource,
  localPathSource,
  newRepositorySource,
  parseCloneSource,
  type RawTable,
  toCanonical,
} from "../../src/domain/clone-source.js";
import {
  InvalidCloneSourceError,
  MissingFieldError,
  UnknownFieldError,
} from "../../src/domain/errors.js";
import { nativePath } from "../../src/domain/python-path.js";
import { CATALOG_DIR, ELSEWHERE, refusal } from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

const LOCATION = "config/projects.toml: project.web.source";

function parse(
  table: RawTable,
  options: { baseDir?: string; allowedLocalRoots?: readonly string[] } = {},
): CloneSource {
  return parseCloneSource(
    table,
    options.baseDir ?? CATALOG_DIR,
    options.allowedLocalRoots ?? [],
    LOCATION,
  );
}

// --- the tag itself ---------------------------------------------------------

describe("the tag itself", () => {
  test("kind is required", () => {
    const caught = refusal(MissingFieldError, () =>
      parse({ url: "https://example.invalid/o/r.git" }),
    );
    expect(caught.message).toMatch(/requires the key 'kind'/);
  });

  test("an unknown kind is refused and lists the known ones", () => {
    const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "svn" }));
    expect(caught.message).toMatch(/unknown clone source kind 'svn'/);
  });

  parametrize<unknown>(
    "a non-string kind is refused",
    [
      ["1", 1],
      ["True", true],
      ["None", null],
      ["kind3", ["git_url"]],
    ],
    (kind) => {
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind }));
      expect(caught.message).toMatch(/kind must be a string/);
    },
  );
});

// --- git_url ------------------------------------------------------------------

describe("git_url", () => {
  test("the allowed schemes are exactly https and ssh", () => {
    expect(new Set(ALLOWED_URL_SCHEMES)).toEqual(new Set(["https", "ssh"]));
  });

  parametrize<string>(
    "authenticated transports are accepted",
    [
      ["https://github.com/org/repo.git", "https://github.com/org/repo.git"],
      ["ssh://git@github.com/org/repo.git", "ssh://git@github.com/org/repo.git"],
      ["ssh://github.com/org/repo.git", "ssh://github.com/org/repo.git"],
      // scheme comparison is case-insensitive
      ["HTTPS://github.com/org/repo.git", "HTTPS://github.com/org/repo.git"],
    ],
    (url) => {
      expect(parse({ kind: "git_url", url })).toEqual(gitUrlSource(url));
    },
  );

  parametrize<{ url: string; expected: string }>(
    "each documented scheme is refused with its reason",
    [
      [
        "http://github.com/org/repo.git-plaintext",
        { url: "http://github.com/org/repo.git", expected: "plaintext" },
      ],
      [
        "git://github.com/org/repo.git-unauthenticated",
        { url: "git://github.com/org/repo.git", expected: "unauthenticated" },
      ],
      [
        "file:///srv/repos/repo.git-local_path",
        { url: "file:///srv/repos/repo.git", expected: "local_path" },
      ],
    ],
    ({ url, expected }) => {
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(new RegExp(expected));
    },
  );

  test("a scheme that is merely unknown is refused", () => {
    const caught = refusal(InvalidCloneSourceError, () =>
      parse({ kind: "git_url", url: "ftp://example.invalid/repo.git" }),
    );
    expect(caught.message).toMatch(/scheme 'ftp' is not allowed/);
  });

  test("scp-style shorthand is refused rather than rewritten", () => {
    // Accepting both spellings of one remote would give one source two digests.
    const caught = refusal(InvalidCloneSourceError, () =>
      parse({ kind: "git_url", url: "git@github.com:org/repo.git" }),
    );
    expect(caught.message).toMatch(/has no scheme/);
  });

  test("bare git@ userinfo is the one accepted credential shape", () => {
    const url = "ssh://git@github.com/org/repo.git";
    expect(parse({ kind: "git_url", url })).toEqual(gitUrlSource(url));
  });

  parametrize<string>(
    "other userinfo is refused",
    [
      ["ssh://alice@github.com/org/repo.git", "ssh://alice@github.com/org/repo.git"],
      // 'git@' is a user only over ssh
      ["https://git@github.com/org/repo.git", "https://git@github.com/org/repo.git"],
      ["https://token@github.com/org/repo.git", "https://token@github.com/org/repo.git"],
    ],
    (url) => {
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(/must not embed credentials/);
    },
  );

  parametrize<string>(
    "an embedded password is refused",
    [
      [
        "https://alice:s3cret@github.com/org/repo.git",
        "https://alice:s3cret@github.com/org/repo.git",
      ],
      ["ssh://git:s3cret@github.com/org/repo.git", "ssh://git:s3cret@github.com/org/repo.git"],
    ],
    (url) => {
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(/must not embed a password/);
    },
  );

  parametrize<string>(
    "whitespace and control characters in a url are refused",
    [
      ["https://github.com/org/ repo.git", "https://github.com/org/ repo.git"],
      ["https://github.com/org/repo.git\\n", "https://github.com/org/repo.git\n"],
      ["https://g\\x01.com/r", "https://g\x01.com/r"],
    ],
    (url) => {
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(/whitespace or control characters/);
    },
  );

  test("a url with no host is refused", () => {
    const caught = refusal(InvalidCloneSourceError, () =>
      parse({ kind: "git_url", url: "https:///org/repo.git" }),
    );
    expect(caught.message).toMatch(/has no host/);
  });

  test("url is required and must be a string", () => {
    const missing = refusal(MissingFieldError, () => parse({ kind: "git_url" }));
    expect(missing.message).toMatch(/requires the key 'url'/);
    const invalid = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url: 7 }));
    expect(invalid.message).toMatch(/url must be a string/);
  });

  test("git_url rejects an unknown field", () => {
    const caught = refusal(UnknownFieldError, () =>
      parse({ kind: "git_url", url: "https://github.com/o/r.git", branch: "main" }),
    );
    expect(caught.message).toMatch(/'branch'/);
  });
});

// --- local_path -----------------------------------------------------------

describe("local_path", () => {
  test("a relative path is anchored to the declaring layer's directory", () => {
    // Never the process CWD: the same catalog must mean the same thing
    // whatever directory cadenza is invoked from.
    const source = parse(
      { kind: "local_path", path: "repos/web" },
      { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] },
    );
    expect(source).toEqual(
      localPathSource(nativePath.join(nativePath.join(CATALOG_DIR, "repos"), "web")),
    );
  });

  test("an absolute path is kept as-is", () => {
    const target = nativePath.join(CATALOG_DIR, "web");
    const source = parse(
      { kind: "local_path", path: target },
      { baseDir: ELSEWHERE, allowedLocalRoots: [CATALOG_DIR] },
    );
    expect(source).toEqual(localPathSource(target));
  });

  test("a tilde is expanded against the home directory", () => {
    // `ntpath.expanduser` ignores HOME entirely and reads USERPROFILE, so
    // setting only HOME would assert nothing on Windows.
    const home = ELSEWHERE;
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    onTestFinished(() => {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = originalUserProfile;
      }
    });
    const source = parse(
      { kind: "local_path", path: "~/work/web" },
      { baseDir: CATALOG_DIR, allowedLocalRoots: ["~/work"] },
    );
    expect(source).toEqual(localPathSource(nativePath.join(nativePath.join(home, "work"), "web")));
  });

  test("an interior dot-dot is collapsed and kept when it stays inside", () => {
    const source = parse(
      { kind: "local_path", path: "sub/../web" },
      { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] },
    );
    expect(source).toEqual(localPathSource(nativePath.join(CATALOG_DIR, "web")));
  });

  test("a dot-dot that climbs out of every root is refused, naming the roots", () => {
    const root = nativePath.join(CATALOG_DIR, "work");
    const caught = refusal(InvalidCloneSourceError, () =>
      parse(
        { kind: "local_path", path: "../../etc/shadow" },
        { baseDir: root, allowedLocalRoots: [root] },
      ),
    );
    expect(caught.message).toMatch(/outside the allowed local roots/);
    expect(caught.message).toContain(root);
  });

  test("a layer with no roots may not declare a local_path", () => {
    // Absence of roots is a refusal, not an implicit "anything goes" (section 3.3).
    const caught = refusal(InvalidCloneSourceError, () =>
      parse(
        { kind: "local_path", path: nativePath.join(CATALOG_DIR, "web") },
        { baseDir: CATALOG_DIR, allowedLocalRoots: [] },
      ),
    );
    expect(caught.message).toMatch(/allowed_local_roots/);
  });

  test("a sibling of a root does not count as contained", () => {
    // "/srv/work-other" must not pass because it shares a prefix with "/srv/work".
    const root = nativePath.join(CATALOG_DIR, "work");
    const caught = refusal(InvalidCloneSourceError, () =>
      parse(
        {
          kind: "local_path",
          path: nativePath.join(nativePath.join(CATALOG_DIR, "work-other"), "web"),
        },
        { baseDir: CATALOG_DIR, allowedLocalRoots: [root] },
      ),
    );
    expect(caught.message).toMatch(/outside the allowed local roots/);
  });

  test("any of several roots may contain the path", () => {
    const source = parse(
      { kind: "local_path", path: nativePath.join(nativePath.join(CATALOG_DIR, "b"), "web") },
      {
        baseDir: CATALOG_DIR,
        allowedLocalRoots: [nativePath.join(CATALOG_DIR, "a"), nativePath.join(CATALOG_DIR, "b")],
      },
    );
    expect(source).toEqual(
      localPathSource(nativePath.join(nativePath.join(CATALOG_DIR, "b"), "web")),
    );
  });

  test("an empty path is refused", () => {
    const caught = refusal(InvalidCloneSourceError, () =>
      parse(
        { kind: "local_path", path: "" },
        { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] },
      ),
    );
    expect(caught.message).toMatch(/path must not be empty/);
  });

  parametrize<string>(
    "NUL and control characters in a path are refused",
    [
      ["web\\x00repo", "web\x00repo"],
      ["web\\x01", "web\x01"],
      ["web\\x7f", "web\x7f"],
    ],
    (path) => {
      const caught = refusal(InvalidCloneSourceError, () =>
        parse(
          { kind: "local_path", path },
          { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] },
        ),
      );
      expect(caught.message).toMatch(/NUL bytes or control characters/);
    },
  );

  test("path is required and must be a string", () => {
    const options = { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] };
    const missing = refusal(MissingFieldError, () => parse({ kind: "local_path" }, options));
    expect(missing.message).toMatch(/requires the key 'path'/);
    const invalid = refusal(InvalidCloneSourceError, () =>
      parse({ kind: "local_path", path: 7 }, options),
    );
    expect(invalid.message).toMatch(/path must be a string/);
  });

  test("local_path rejects an unknown field", () => {
    const caught = refusal(UnknownFieldError, () =>
      parse(
        { kind: "local_path", path: CATALOG_DIR, url: "https://x.invalid/r.git" },
        { baseDir: CATALOG_DIR, allowedLocalRoots: [CATALOG_DIR] },
      ),
    );
    expect(caught.message).toMatch(/'url'/);
  });
});

// --- new --------------------------------------------------------------------

describe("new", () => {
  test("new takes no fields", () => {
    expect(parse({ kind: "new" })).toEqual(newRepositorySource());
  });

  parametrize<RawTable>(
    "new refuses any field beyond kind",
    [
      ["extra0", { url: "https://x.invalid/r.git" }],
      ["extra1", { path: "/srv/web" }],
      ["extra2", { template: "blank" }],
    ],
    (extra) => {
      const caught = refusal(UnknownFieldError, () => parse({ kind: "new", ...extra }));
      expect(caught.message).toMatch(/does not accept/);
    },
  );
});

// --- canonical form -----------------------------------------------------------

describe("canonical form", () => {
  parametrize<{ source: CloneSource; expected: Readonly<Record<string, string>> }>(
    "the canonical form always carries the tag",
    [
      [
        "source0-expected0",
        {
          source: gitUrlSource("https://x.invalid/r.git"),
          expected: { kind: "git_url", url: "https://x.invalid/r.git" },
        },
      ],
      [
        "source1-expected1",
        { source: localPathSource("/srv/web"), expected: { kind: "local_path", path: "/srv/web" } },
      ],
      ["source2-expected2", { source: newRepositorySource(), expected: { kind: "new" } }],
    ],
    ({ source, expected }) => {
      expect(toCanonical(source)).toEqual(expected);
    },
  );

  test("sources are frozen", () => {
    const source = gitUrlSource("https://x.invalid/r.git");
    expect(() => {
      // @ts-expect-error -- mutating a frozen source is exactly what this proves is refused.
      source.url = "https://other.invalid/r.git";
    }).toThrow(TypeError);
  });
});

// --- regressions: refusals that used to escape as untyped errors ----------

describe("regressions: refusals that used to escape as untyped errors", () => {
  parametrize<string>(
    "a url that urlsplit itself rejects is a typed refusal",
    [
      // urlsplit itself raises on these, and neither carries whitespace or a
      // control character, so the character scan lets them through to the
      // parser.
      ["https://[::1/repo.git", "https://[::1/repo.git"],
      ["https://exa\\u2100mple.com/r.git", "https://exa℀mple.com/r.git"],
    ],
    (url) => {
      // Design section 7: nothing is refused via a bare error, and every
      // refusal names the file and key. An untyped error here would name
      // neither, and would take down a whole catalog load from one line of TOML.
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(/is not parseable/);
      expect(caught.location).toBe(LOCATION);
    },
  );

  test("a relative base_dir cannot anchor a local_path", () => {
    // A relative anchor leaves the anchored path relative, so whoever clones it
    // would re-anchor against its own CWD -- section 3.1's rule defeated one
    // level up -- and config_digest would depend on the invocation directory.
    const caught = refusal(InvalidCloneSourceError, () =>
      parse({ kind: "local_path", path: "repo" }, { baseDir: "config", allowedLocalRoots: ["."] }),
    );
    expect(caught.message).toMatch(/base_dir must be absolute/);
  });

  parametrize<string>(
    "a malformed port is refused at composition",
    [
      ["https://example.invalid:abc/o/r.git", "https://example.invalid:abc/o/r.git"],
      ["https://example.invalid:99999/o/r.git", "https://example.invalid:99999/o/r.git"],
    ],
    (url) => {
      // urlsplit carries a nonsense port until something reads it, so an
      // unvalidated port would let the catalog compose and the clone fail later
      // -- the ordering this validator exists to fix.
      const caught = refusal(InvalidCloneSourceError, () => parse({ kind: "git_url", url }));
      expect(caught.message).toMatch(/is not parseable/);
    },
  );

  parametrize<string>(
    "a well-formed port is accepted",
    [
      ["https://example.invalid:443/o/r.git", "https://example.invalid:443/o/r.git"],
      ["ssh://git@example.invalid:22/o/r.git", "ssh://git@example.invalid:22/o/r.git"],
    ],
    (url) => {
      expect(parse({ kind: "git_url", url })).toEqual(gitUrlSource(url));
    },
  );
});
