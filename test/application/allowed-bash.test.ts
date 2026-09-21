/**
 * `allowed_bash` on the catalog project (D-0041): read, composed, resolved,
 * digested, and carried into the contract's authority.
 *
 * **Target-only**: nothing like it existed on the Python side, so no case here
 * translates a source case; `parity/target-only.json` records the file as such.
 *
 * The load-bearing cases are the first group. D-0040 rule 3 made "every
 * existing `config_digest` stays exactly as it is for a project that declares
 * no list" a condition of this change, so it is asserted against bytes written
 * down before the field existed, not against the encoder under test.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import { contractInputForAgentType } from "../../src/application/agent-type-issuance.js";
import { composeCatalog } from "../../src/application/compose.js";
import { resolveProject } from "../../src/application/resolve.js";
import { agentType } from "../../src/domain/agent-type.js";
import { classify } from "../../src/domain/classification.js";
import { gitUrlSource } from "../../src/domain/clone-source.js";
import { delegationContract } from "../../src/domain/contract.js";
import { canonicalPayload, configDigest } from "../../src/domain/digest.js";
import { CatalogError, UnknownFieldError } from "../../src/domain/errors.js";
import { fieldOrigin, project } from "../../src/domain/project.js";
import type { LayerDocument } from "../../src/ports/catalog-source.js";
import { gitUrlProject, LOCAL_ORIGIN, makeLayer, refusal, TRACKED_ORIGIN } from "../support.js";
import { parametrize } from "../testkit/parametrize.js";

const URL = "https://example.invalid/org/web.git";

function tracked(projects: Record<string, unknown>): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects });
}

function local(projects: Record<string, unknown>): LayerDocument {
  return makeLayer({ schema_version: 1, project: projects }, { layer: "local" });
}

function web(allowedBash?: unknown): Record<string, unknown> {
  return gitUrlProject({
    url: URL,
    extra: allowedBash === undefined ? {} : { allowed_bash: allowedBash },
  });
}

describe("a project that states no list keeps its digest", () => {
  test("the payload is the bytes written before the field existed", () => {
    // The same bytes `test/domain/digest.test.ts` pins for design doc section 4,
    // spelled out independently of the encoder.
    const before =
      '{"aliases":["frontend","site"],"base_branch":"main","project_id":"web",' +
      `"source":{"kind":"git_url","url":"${URL}"}}`;
    const value = project("web", ["site", "frontend"], gitUrlSource(URL), "main");
    expect(Object.keys(canonicalPayload(value))).not.toContain("allowed_bash");
    expect(configDigest(value)).toBe(
      `sha256:${createHash("sha256").update(Buffer.from(before, "utf8")).digest("hex")}`,
    );
  });

  test("an empty list digests as absence does", () => {
    // `[]` means what absence means (no commands), so it may not read as a change.
    expect(configDigest(project("web", [], gitUrlSource(URL), "main", []))).toBe(
      configDigest(project("web", [], gitUrlSource(URL), "main")),
    );
  });
});

describe("a stated list is configuration", () => {
  const base = project("web", [], gitUrlSource(URL), "main", ["echo:*", "npm run:*"]);

  test("adding a command moves the digest", () => {
    const wider = project("web", [], gitUrlSource(URL), "main", [
      "echo:*",
      "npm run:*",
      "npm test:*",
    ]);
    expect(configDigest(wider)).not.toBe(configDigest(base));
    expect(configDigest(base)).not.toBe(
      configDigest(project("web", [], gitUrlSource(URL), "main")),
    );
  });

  test("order does not", () => {
    const reordered = project("web", [], gitUrlSource(URL), "main", ["npm run:*", "echo:*"]);
    expect(configDigest(reordered)).toBe(configDigest(base));
  });

  test("the list is a snapshot, frozen", () => {
    const list = ["echo:*"];
    const value = project("web", [], gitUrlSource(URL), "main", list);
    list.push("rm:*");
    expect(value.allowedBash).toEqual(["echo:*"]);
    expect(Object.isFrozen(value.allowedBash)).toBe(true);
  });

  test("a changed list makes a contract issued under the old one stale", () => {
    // D-0040 rule 2's reason for storing the list here, and its second
    // falsifier: the list reaches the contract's authority through
    // `config_digest`, which `classify()` checks first.
    const record = agentType({
      agentTypeId: "worker",
      vocabularyVersion: 1,
      granted: ["command.run"],
      askable: [],
      loopPolicy: { maxReviewRounds: 3, noProgressWindow: 4, noProgressRepeat: 2 },
      executorPolicy: { roleName: "worker", modelTier: "standard", reportingDuties: [] },
    });
    const parties = { issuer: "operator:desk", grantee: "run:0f2a" };
    const before = resolveProject(composeCatalog([tracked({ web: web(["echo:*"]) })]), "web");
    const after = resolveProject(
      composeCatalog([tracked({ web: web(["echo:*", "npm run:*"]) })]),
      "web",
    );
    const contract = delegationContract(contractInputForAgentType(record, before, parties));
    const action = { capabilities: ["command.run"] };

    expect(
      classify(contract, action, { runId: "run:0f2a", configDigest: before.configDigest }).outcome,
    ).toBe("allowed");
    expect(
      classify(contract, action, { runId: "run:0f2a", configDigest: after.configDigest }),
    ).toMatchObject({ outcome: "refused", reason: "stale_subject" });
  });
});

describe("composition", () => {
  test("a stated list resolves as declared, with its origin", () => {
    const resolved = resolveProject(
      composeCatalog([tracked({ web: web(["npm run:*", "echo:*"]) })]),
      "web",
    );
    expect(resolved.allowedBash).toEqual(["npm run:*", "echo:*"]);
    expect(resolved.provenance["allowed_bash"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
  });

  test("an unstated list is empty, and the defining layer is its origin", () => {
    // Empty means no commands: cadenza adds nothing, not even COMMON_BASH.
    const resolved = resolveProject(composeCatalog([tracked({ web: web() })]), "web");
    expect(resolved.allowedBash).toEqual([]);
    expect(resolved.provenance["allowed_bash"]).toEqual(fieldOrigin("tracked", TRACKED_ORIGIN));
  });

  test("a later layer replaces the list whole", () => {
    const catalog = composeCatalog([
      tracked({ web: web(["echo:*", "npm run:*"]) }),
      local({ web: { allowed_bash: ["echo:*"] } }),
    ]);
    // Not a union: a union would leave no way to take `npm run:*` away.
    expect(catalog.projects["web"]?.allowedBash).toEqual(["echo:*"]);
    expect(catalog.provenance["web"]?.["allowed_bash"]).toEqual(fieldOrigin("local", LOCAL_ORIGIN));
  });

  test("a later layer can empty it", () => {
    const catalog = composeCatalog([
      tracked({ web: web(["echo:*"]) }),
      local({ web: { allowed_bash: [] } }),
    ]);
    expect(catalog.projects["web"]?.allowedBash).toEqual([]);
  });

  test("a later layer that omits it inherits it", () => {
    const catalog = composeCatalog([
      tracked({ web: web(["echo:*"]) }),
      local({ web: { base_branch: "develop" } }),
    ]);
    expect(catalog.projects["web"]?.allowedBash).toEqual(["echo:*"]);
    expect(catalog.provenance["web"]?.["allowed_bash"]).toEqual(
      fieldOrigin("tracked", TRACKED_ORIGIN),
    );
  });

  test("a misspelling is still an unknown field", () => {
    refusal(UnknownFieldError, () =>
      composeCatalog([tracked({ web: { ...web(), allowed_bsh: ["echo:*"] } })]),
    );
  });
});

describe("validation", () => {
  parametrize<unknown>(
    "refuses",
    [
      ["a string rather than a list", "echo:*"],
      ["a non-string entry", ["echo:*", 1]],
      ["an empty entry", [""]],
      ["a blank entry", ["   "]],
      ["a leading space", [" echo:*"]],
      ["a trailing space", ["echo:* "]],
      ["a control character", ["echo\t:*"]],
      ["a newline", ["echo:*\nrm -rf /"]],
      ["non-ASCII", ["echo é"]],
      ["a duplicate", ["echo:*", "echo:*"]],
      ["an entry over 256 characters", ["x".repeat(257)]],
      ["more than 256 entries", Array.from({ length: 257 }, (_, i) => `cmd${i}`)],
    ],
    (value) => {
      const error = refusal(CatalogError, () => composeCatalog([tracked({ web: web(value) })]));
      expect(error.message).toContain("allowed_bash");
      // D-0007: whatever was refused, the message is printable ASCII.
      expect(error.message).toMatch(/^[\x20-\x7e]*$/);
    },
  );

  test("accepts the bounds and an inner space", () => {
    const at = Array.from({ length: 256 }, (_, i) => `cmd${i}`);
    at[0] = "x".repeat(256);
    at[1] = "git switch --detach HEAD~1";
    expect(composeCatalog([tracked({ web: web(at) })]).projects["web"]?.allowedBash).toEqual(at);
  });
});
