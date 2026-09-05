/**
 * `agent_type_digest`: what it covers, what it must not collapse, and the exact
 * bytes it is taken over.
 *
 * **Target-only**: there is no Python side for the agent-type record (#25,
 * D-0032), so no case here translates a source case; `parity/target-only.json`
 * records the file as such.
 *
 * The cases are written as **distinctions**, the way `contract-digest.test.ts`
 * is: for each semantic field, two records differing only in that field must
 * not share a digest. A digest that quietly ignored the model tier would let a
 * host record "this run used that policy" while the policy it names had
 * changed -- which is the one job D-0031 section 2 gives this digest.
 *
 * The other half is the golden. `agent_type_digest` reuses `digestOf`, so it
 * inherits the `sha256:` framing and CPython's canonical JSON; what it adds is
 * a payload shape, and the payload's key spellings are a wire format the moment
 * a host persists a digest. The golden below is what makes changing one a
 * failure rather than a silent re-issue of every record in existence.
 */
import { describe, expect, test } from "vitest";

import {
  type AgentTypeInput,
  agentType,
  agentTypeDigest,
  agentTypePayload,
} from "../../src/domain/agent-type.js";
import { canonicalJson } from "../../src/domain/canonical-json.js";
import { DIGEST_PATTERN, digestOf } from "../../src/domain/digest.js";
import { ForgedAgentTypeError } from "../../src/domain/errors.js";
import { refusal } from "../support.js";

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

function digest(overrides: Partial<AgentTypeInput> = {}): string {
  return agentTypeDigest(agentType(valid(overrides)));
}

describe("agentTypeDigest", () => {
  test("is sha256 and 64 lowercase hex, the shape a run persists", () => {
    expect(digest()).toMatch(DIGEST_PATTERN);
  });

  test("is the field the record carries", () => {
    const record = agentType(valid());
    expect(record.agentTypeDigest).toBe(agentTypeDigest(record));
  });

  test("is stable across the caller's ordering and repetition", () => {
    expect(digest({ granted: ["worktree.write", "command.run", "command.run"] })).toBe(
      digest({ granted: ["command.run", "worktree.write"] }),
    );
    expect(
      digest({
        executorPolicy: {
          roleName: "worker",
          modelTier: "standard",
          reportingDuties: ["verify_output", "post_summary", "post_summary"],
        },
      }),
    ).toBe(digest());
  });

  test("is stable across the key order of a nested policy object", () => {
    // The members are written in a different order, and canonical JSON sorts
    // keys, so the bytes are the same. Asserted rather than assumed, because
    // this is the property that lets a host build a policy however it likes.
    expect(
      digest({
        loopPolicy: { noProgressRepeat: 2, maxReviewRounds: 3, noProgressWindow: 4 },
      }),
    ).toBe(digest());
  });

  // --- one distinction per semantic field ----------------------------------

  test("changes with the agent type id, because identity is semantics", () => {
    expect(digest({ agentTypeId: "reviewer" })).not.toBe(digest({ agentTypeId: "builder" }));
  });

  test("changes with the granted set", () => {
    expect(digest({ granted: ["command.run"] })).not.toBe(digest({ granted: [] }));
  });

  test("changes with the askable set", () => {
    expect(digest({ askable: ["branch.push"] })).not.toBe(digest({ askable: [] }));
  });

  test("does not collapse a key moving from granted to askable", () => {
    // Two records over the same keys, meaning different things: one may push a
    // branch, the other must ask. A digest that covered only the union would
    // report them as the same policy.
    expect(digest({ granted: ["branch.push"], askable: [] })).not.toBe(
      digest({ granted: [], askable: ["branch.push"] }),
    );
  });

  test("changes with every member of the loop policy", () => {
    expect(
      digest({ loopPolicy: { maxReviewRounds: 4, noProgressWindow: 4, noProgressRepeat: 2 } }),
    ).not.toBe(digest());
    expect(
      digest({ loopPolicy: { maxReviewRounds: 3, noProgressWindow: 5, noProgressRepeat: 2 } }),
    ).not.toBe(digest());
    expect(
      digest({ loopPolicy: { maxReviewRounds: 3, noProgressWindow: 4, noProgressRepeat: 3 } }),
    ).not.toBe(digest());
  });

  test("changes with every member of the executor policy, which nothing here reads", () => {
    // Covered *because* it is opaque. The digest is what makes "under what
    // policy did it run" answerable, and a tier that changed under an unchanged
    // digest is exactly the reconstructability failure D-0031 section 2 names.
    const base = {
      roleName: "worker",
      modelTier: "standard",
      reportingDuties: ["post_summary", "verify_output"],
    };
    expect(digest({ executorPolicy: { ...base, roleName: "curator" } })).not.toBe(digest());
    expect(digest({ executorPolicy: { ...base, modelTier: "premium" } })).not.toBe(digest());
    expect(digest({ executorPolicy: { ...base, reportingDuties: ["post_summary"] } })).not.toBe(
      digest(),
    );
  });

  // --- the payload ---------------------------------------------------------

  test("covers every field of the record except the digest itself", () => {
    // A digest cannot cover itself, so "over all of the above" (D-0031) means
    // the six semantic fields. This is that sentence, checkable.
    const record = agentType(valid());
    expect(Object.keys(agentTypePayload(record)).sort()).toEqual([
      "agent_type_id",
      "askable",
      "executor_policy",
      "granted",
      "loop_policy",
      "vocabulary_version",
    ]);
  });

  test("refuses a value that did not come from agentType()", () => {
    const forged = { ...agentType(valid()) };
    refusal(ForgedAgentTypeError, () => agentTypePayload(forged as never));
  });

  test("is digestOf over its own payload, and nothing else", () => {
    const record = agentType(valid());
    expect(agentTypeDigest(record)).toBe(digestOf(agentTypePayload(record)));
  });

  // --- the golden ----------------------------------------------------------

  test("encodes to a fixed canonical JSON and a fixed digest", () => {
    // Both halves are pinned rather than one. The digest alone would go red on
    // any change without saying what moved; the JSON alone would not notice the
    // framing changing underneath it.
    //
    // Note the integers. The oracle corpus is built from `Project` values and
    // holds no number at all (`src/domain/canonical-json.ts` says so), so the
    // one encoder shape this payload adds over `config_digest` is the integer
    // -- pinned in `test/domain/canonical-json.test.ts` directly, and pinned
    // again here in situ.
    const record = agentType(valid());
    const encoded = canonicalJson(agentTypePayload(record));

    expect(encoded).toBe(
      '{"agent_type_id":"reviewer","askable":["branch.push"],' +
        '"executor_policy":{"model_tier":"standard","reporting_duties":' +
        '["post_summary","verify_output"],"role_name":"worker"},' +
        '"granted":["command.run","worktree.write"],' +
        '"loop_policy":{"max_review_rounds":3,"no_progress_repeat":2,"no_progress_window":4},' +
        '"vocabulary_version":1}',
    );
    expect(record.agentTypeDigest).toBe(
      "sha256:e89e996eef3938d15d373ce1fa0ef0afc63b9c83447c1faaa8722c957a458198",
    );
  });
});
