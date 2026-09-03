/**
 * `contractDigest()`: what the digest covers, and what it must not collapse.
 *
 * **Target-only**: there is no Python G2 (#25), so no case here translates a
 * source case; `parity/target-only.json` records the file as such.
 *
 * The cases are written as **distinctions**: for each field of the contract,
 * two contracts differing only in that field must not share a digest. A digest
 * that ignored a field would be a digest two parties could agree on while
 * meaning different things, which is the one job it has (D-0026 section 1).
 */
import { describe, expect, test } from "vitest";

import { canonicalJson } from "../../src/domain/canonical-json.js";
import { gitUrlSource } from "../../src/domain/clone-source.js";
import { type DelegationContractInput, delegationContract } from "../../src/domain/contract.js";
import { contractDigest, contractPayload } from "../../src/domain/contract-digest.js";
import { configDigest, DIGEST_PATTERN } from "../../src/domain/digest.js";
import { project } from "../../src/domain/project.js";

const CONFIG_DIGEST = `sha256:${"a1".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"b2".repeat(32)}`;

function valid(overrides: Partial<DelegationContractInput> = {}): DelegationContractInput {
  return {
    vocabularyVersion: 1,
    projectId: "cadenza",
    configDigest: CONFIG_DIGEST,
    issuer: "operator:desk",
    grantee: "run:0f2a",
    granted: ["command.run", "worktree.write"],
    askable: ["branch.push"],
    supersedes: null,
    ...overrides,
  };
}

function digest(overrides: Partial<DelegationContractInput> = {}): string {
  return contractDigest(delegationContract(valid(overrides)));
}

describe("contractDigest", () => {
  test("is sha256 and 64 lowercase hex, the shape the contract fields are validated against", () => {
    // Same shape on both sides of the seam: a `contract_digest` is what a
    // successor's `supersedes` carries, so a digest this function produces has
    // to pass the validator that reads one back.
    expect(digest()).toMatch(DIGEST_PATTERN);
  });

  test("is stable across the caller's ordering and repetition", () => {
    expect(digest({ granted: ["worktree.write", "command.run", "command.run"] })).toBe(
      digest({ granted: ["command.run", "worktree.write"] }),
    );
  });

  test("changes with the grantee, because the contract is not a bearer token", () => {
    expect(digest({ grantee: "run:0f2a" })).not.toBe(digest({ grantee: "run:beef" }));
  });

  test("changes with the issuer", () => {
    expect(digest({ issuer: "operator:desk" })).not.toBe(digest({ issuer: "operator:other" }));
  });

  test("changes with the lineage, and an opened lineage is not a replaced one", () => {
    // `null` written rather than omitted: without it a contract that opens a
    // lineage and one that replaces something could collide.
    expect(digest({ supersedes: null })).not.toBe(digest({ supersedes: OTHER_DIGEST }));
  });

  test("changes with the vocabulary version", () => {
    // Vacuous while one version is known -- there is no second version to pin
    // -- so the property is asserted on the payload instead, where it is real.
    const payload = contractPayload(delegationContract(valid()));
    expect(payload.vocabulary_version).toBe(1);
    expect(canonicalJson({ ...payload, vocabulary_version: 2 })).not.toBe(canonicalJson(payload));
  });

  test("changes with the subject, by id and by digest", () => {
    expect(digest({ projectId: "cadenza" })).not.toBe(digest({ projectId: "continuo" }));
    expect(digest({ configDigest: CONFIG_DIGEST })).not.toBe(
      digest({ configDigest: OTHER_DIGEST }),
    );
  });

  test("changes when a capability moves from granted to askable", () => {
    // The two sets are disjoint, so moving a key between them is a different
    // grant rather than a rearrangement of the same one.
    expect(digest({ granted: ["command.run"], askable: [] })).not.toBe(
      digest({ granted: [], askable: ["command.run"] }),
    );
  });
});

describe("contractPayload", () => {
  test("uses the wire spellings and covers every field, and nothing else", () => {
    const payload = contractPayload(delegationContract(valid()));
    expect(Object.keys(payload).sort()).toEqual([
      "askable",
      "config_digest",
      "granted",
      "grantee",
      "issuer",
      "project_id",
      "supersedes",
      "vocabulary_version",
    ]);
  });

  test("writes the key lists in code-point order", () => {
    const payload = contractPayload(
      delegationContract(valid({ granted: ["worktree.write", "command.run"] })),
    );
    expect(payload.granted).toEqual(["command.run", "worktree.write"]);
  });
});

describe("the shared digest framing", () => {
  test("config_digest is unchanged by G2 reusing the path", () => {
    // `configDigest` now goes through `digestOf` rather than framing the hash
    // itself. That refactor must be invisible: this is a byte the differential
    // oracle also pins, restated here so a failure names the reuse.
    const value = project(
      "web",
      ["site"],
      gitUrlSource("https://example.invalid/org/web.git"),
      "main",
    );
    expect(configDigest(value)).toBe(
      "sha256:f8164b9818d51de9544eff63d19ec1458af2bef7c34f6cab1ed1791d3c5e15e2",
    );
  });
});
