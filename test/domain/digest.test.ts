/**
 * `config_digest`: a fingerprint of configuration, not of where it was typed.
 *
 * Ported from `tests/test_digest.py`. The mapping, case by case, is
 * `parity/digest.ledger.json`.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import { canonicalJson } from "../../src/domain/canonical-json.js";
import {
  type CloneSource,
  gitUrlSource,
  localPathSource,
  newRepositorySource,
} from "../../src/domain/clone-source.js";
import { canonicalPayload, configDigest } from "../../src/domain/digest.js";
import { type Project, project } from "../../src/domain/project.js";
import { parametrize } from "../testkit/parametrize.js";

const BASE: Project = project(
  "web",
  ["site", "frontend"],
  gitUrlSource("https://example.invalid/org/web.git"),
  "main",
);

describe("config_digest", () => {
  test("the digest is the sha256 prefix and sixty-four hex characters", () => {
    // `\A`/`\z`-anchored, which is what Python's `re.fullmatch` is. A
    // JavaScript `^...$` would also match `sha256:<64 hex>\n`, and "no trailing
    // newline" is a property this repository already refuses to leave to chance
    // elsewhere (the identifier pattern's `\Z`, design doc section 2).
    expect(configDigest(BASE)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("the digest matches the documented encoding", () => {
    // Written in a deliberately different key order from `canonicalPayload`'s,
    // which pins the sort rather than insertion order.
    const scrambled = {
      base_branch: "main",
      source: { url: "https://example.invalid/org/web.git", kind: "git_url" },
      aliases: ["frontend", "site"],
      project_id: "web",
    };
    // Spelled out rather than re-derived from the encoder under test. The
    // source case can call `json.dumps` -- an implementation it is not testing
    // -- and get an independent answer; TypeScript has no equivalent that
    // agrees on all four of Python's settings at once, so the independent
    // answer is written down. These are the bytes of design doc section 4.
    const documented =
      '{"aliases":["frontend","site"],"base_branch":"main","project_id":"web",' +
      '"source":{"kind":"git_url","url":"https://example.invalid/org/web.git"}}';
    expect(canonicalJson(scrambled)).toBe(documented);
    expect(configDigest(BASE)).toBe(
      `sha256:${createHash("sha256").update(Buffer.from(documented, "utf8")).digest("hex")}`,
    );
  });

  test("alias order does not change the digest", () => {
    // Aliases are a display-only list; reordering one is not a configuration
    // change.
    const reordered = project("web", ["frontend", "site"], BASE.source, BASE.baseBranch);
    expect(configDigest(reordered)).toBe(configDigest(BASE));
  });

  test("the payload excludes provenance and file paths", () => {
    // Section 4: moving a catalog file must not change what the digest says.
    expect(new Set(Object.keys(canonicalPayload(BASE)))).toEqual(
      new Set(["project_id", "aliases", "source", "base_branch"]),
    );
  });

  parametrize<Project>(
    "the digest changes when any semantic field changes",
    [
      ["changed0", project("web2", BASE.aliases, BASE.source, BASE.baseBranch)],
      ["changed1", project("web", ["site"], BASE.source, BASE.baseBranch)],
      ["changed2", project("web", [], BASE.source, BASE.baseBranch)],
      ["changed3", project("web", BASE.aliases, BASE.source, "develop")],
      [
        "changed4",
        project(
          "web",
          BASE.aliases,
          gitUrlSource("https://example.invalid/org/other.git"),
          BASE.baseBranch,
        ),
      ],
      ["changed5", project("web", BASE.aliases, localPathSource("/srv/web"), BASE.baseBranch)],
      ["changed6", project("web", BASE.aliases, newRepositorySource(), BASE.baseBranch)],
    ],
    (changed) => {
      expect(configDigest(changed)).not.toBe(configDigest(BASE));
    },
  );

  test("two source kinds that share a string value do not share a digest", () => {
    // The tag is part of the payload, so "same string, different kind" is a
    // different configuration rather than a collision.
    const shared = "https://example.invalid/org/web.git";
    const asUrl: CloneSource = gitUrlSource(shared);
    const asPath: CloneSource = localPathSource(shared);
    expect(configDigest(project("web", [], asUrl, "main"))).not.toBe(
      configDigest(project("web", [], asPath, "main")),
    );
  });

  test("the digest is deterministic across calls", () => {
    expect(configDigest(BASE)).toBe(configDigest(BASE));
  });
});
