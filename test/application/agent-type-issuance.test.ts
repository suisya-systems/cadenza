/**
 * `contractInputForAgentType()`: the rendering, and the two things the record
 * must not have touched.
 *
 * **Target-only**: there is no Python side for the agent-type record (#25,
 * D-0032), so no case here translates a source case; `parity/target-only.json`
 * records the file as such.
 *
 * The first half asserts what the renderer produces, and the load-bearing case
 * is the last of them: what it returns goes into `delegationContract()` and
 * comes out a valid contract, because the whole design rests on the record
 * being *inputs to contract construction* rather than a second authority
 * (D-0031 section 1).
 *
 * The second half is a regression guard for the trap D-0031 section 2 was
 * taken to avoid. Putting the record on `Project` / `ResolvedProject` would
 * move every project's `config_digest`, every already-issued contract pins the
 * old one, and `classify()`'s first step would return `refused` /
 * `stale_subject` for all of them -- a mass revocation triggered by editing an
 * agent type. That failure is silent from inside this belt, so it is asserted
 * from outside it.
 */
import { describe, expect, test } from "vitest";

import { contractInputForAgentType } from "../../src/application/agent-type-issuance.js";
import { composeCatalog } from "../../src/application/compose.js";
import { resolveProject } from "../../src/application/resolve.js";
import { type AgentType, type AgentTypeInput, agentType } from "../../src/domain/agent-type.js";
import { gitUrlSource } from "../../src/domain/clone-source.js";
import { delegationContract } from "../../src/domain/contract.js";
import { configDigest } from "../../src/domain/digest.js";
import { ForgedAgentTypeError } from "../../src/domain/errors.js";
import { project, type ResolvedProject } from "../../src/domain/project.js";
import { makeLayer, refusal, TRACKED_ORIGIN } from "../support.js";

function valid(overrides: Partial<AgentTypeInput> = {}): AgentTypeInput {
  return {
    agentTypeId: "reviewer",
    vocabularyVersion: 1,
    granted: ["command.run", "worktree.write"],
    askable: ["branch.push"],
    loopPolicy: { maxReviewRounds: 3, noProgressWindow: 4, noProgressRepeat: 2 },
    executorPolicy: {
      roleName: "worker",
      modelTier: "standard",
      reportingDuties: ["post_summary", "verify_output"],
    },
    ...overrides,
  };
}

/** A resolved project, through the real composer so its digest is the real one. */
function resolved(): ResolvedProject {
  const catalog = composeCatalog([
    makeLayer({
      schema_version: 1,
      project: {
        cadenza: {
          source: { kind: "git_url", url: "https://example.invalid/org/cadenza.git" },
          base_branch: "main",
        },
      },
    }),
  ]);
  return resolveProject(catalog, "cadenza");
}

const PARTIES = { issuer: "operator:desk", grantee: "run:0f2a" } as const;

describe("contractInputForAgentType", () => {
  test("renders the record's key sets and the project's identity into one input", () => {
    const record = agentType(valid());
    const target = resolved();

    const input = contractInputForAgentType(record, target, PARTIES);

    expect(input.vocabularyVersion).toBe(record.vocabularyVersion);
    expect(input.granted).toEqual(record.granted);
    expect(input.askable).toEqual(record.askable);
    expect(input.projectId).toBe(target.projectId);
    expect(input.configDigest).toBe(target.configDigest);
    expect(input.issuer).toBe("operator:desk");
    expect(input.grantee).toBe("run:0f2a");
  });

  test("opens a lineage: an initial issuance supersedes nothing", () => {
    // A successor names the `contract_digest` it replaces, which is a fact
    // about a contract that already exists. It comes from the contract side
    // (`delegate` / `adopt`, D-0026 section 3) and never from the record.
    expect(
      contractInputForAgentType(agentType(valid()), resolved(), PARTIES).supersedes,
    ).toBeNull();
  });

  test("carries no agent-type identity or digest into the contract input", () => {
    // D-0031 section 2: the record's identity and digest are run provenance the
    // host persists *beside* the contract. G2's field list is fixed, and adding
    // to it here would be this belt reopening it.
    const input = contractInputForAgentType(agentType(valid()), resolved(), PARTIES);
    expect(Object.keys(input).sort()).toEqual([
      "askable",
      "configDigest",
      "granted",
      "grantee",
      "issuer",
      "projectId",
      "supersedes",
      "vocabularyVersion",
    ]);
  });

  test("freezes what it returns, and the arrays inside it", () => {
    const input = contractInputForAgentType(agentType(valid()), resolved(), PARTIES);
    expect(Object.isFrozen(input)).toBe(true);
    expect(() => {
      (input.granted as string[]).push("branch.push");
    }).toThrow(TypeError);
    expect(() => {
      (input as { grantee: string }).grantee = "run:other";
    }).toThrow(TypeError);
  });

  test("produces an input delegationContract() accepts unchanged", () => {
    // The whole design in one case: the record renders to a grant, the grant
    // becomes a contract, and the contract is the only authority afterwards.
    const record = agentType(valid());
    const target = resolved();

    const contract = delegationContract(contractInputForAgentType(record, target, PARTIES));

    expect(contract.granted).toEqual(record.granted);
    expect(contract.askable).toEqual(record.askable);
    expect(contract.configDigest).toBe(target.configDigest);
    expect(contract.supersedes).toBeNull();
  });

  test("refuses a record that did not come from agentType()", () => {
    // An unbranded object's `granted` set was never bounded by a vocabulary,
    // and that set is about to become a grant.
    const forged = { ...agentType(valid()) } as unknown as AgentType;
    refusal(ForgedAgentTypeError, () => contractInputForAgentType(forged, resolved(), PARTIES));
  });

  test("mints no identity: the parties it renders are the caller's, verbatim", () => {
    // "Run" is not a cadenza type and cadenza reads no clock, so there is no
    // route by which either identity could be derived here.
    const input = contractInputForAgentType(agentType(valid()), resolved(), {
      issuer: "operator:other",
      grantee: "run:beef",
    });
    expect(input.issuer).toBe("operator:other");
    expect(input.grantee).toBe("run:beef");
  });
});

describe("the record stays outside the project's semantics", () => {
  test("constructing a record moves no project's configDigest", () => {
    const subject = project(
      "cadenza",
      ["cad"],
      gitUrlSource("https://example.invalid/org/cadenza.git"),
      "main",
    );
    const before = configDigest(subject);

    agentType(valid());
    agentType(
      valid({
        agentTypeId: "builder",
        loopPolicy: { maxReviewRounds: 9, noProgressWindow: 9, noProgressRepeat: 9 },
      }),
    );

    expect(configDigest(subject)).toBe(before);
    // Pinned against a fixed value as well as against itself, so that the
    // agent-type record entering `canonicalPayload` would fail here even if it
    // entered it for every project at once.
    expect(before).toBe("sha256:9190461ee13253b8c92725cf64e5a9f5437f2bcede26ce60ddbe99c4cd5cf160");
  });

  test("ResolvedProject has no agent-type field", () => {
    // The shape, pinned. D-0031 section 2's whole argument is that a record on
    // this value would be a documentation-driven mass revocation, and a field
    // added here would be silent from inside the agent-type belt.
    const target = resolved();
    expect(Object.keys(target).sort()).toEqual([
      "aliases",
      "baseBranch",
      "configDigest",
      "projectId",
      "provenance",
      "source",
    ]);
    expect(TRACKED_ORIGIN).toContain("projects.toml");
  });
});
