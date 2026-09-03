/**
 * `classify()`: the order, the combination rule, and totality.
 *
 * **Target-only**: there is no Python G2 (#25), so no case here translates a
 * source case; `parity/target-only.json` records the file as such.
 *
 * The file has two halves. The first pins each row of the design document's
 * section 7 tables, one case per row, so a failure says which row moved. The
 * second is the falsifier Issue #32 asks for: a property-style sweep asserting
 * that no input reaches a fourth state or an exception. The first half would
 * pass on an implementation that threw on inputs nobody thought of; the second
 * is what makes "total" a measured claim rather than a description.
 */
import { describe, expect, test } from "vitest";

import {
  type Classification,
  type ClassificationReason,
  classify,
  type Outcome,
} from "../../src/domain/classification.js";
import { type DelegationContractInput, delegationContract } from "../../src/domain/contract.js";
import { contractDigest } from "../../src/domain/contract-digest.js";
import { ForgedContractError } from "../../src/domain/errors.js";
import { refusal } from "../support.js";

const CONFIG_DIGEST = `sha256:${"a1".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"b2".repeat(32)}`;
const GRANTEE = "run:0f2a";

function contractOf(overrides: Partial<DelegationContractInput> = {}) {
  return delegationContract({
    vocabularyVersion: 1,
    projectId: "cadenza",
    configDigest: CONFIG_DIGEST,
    issuer: "operator:desk",
    grantee: GRANTEE,
    granted: ["command.run", "worktree.write"],
    askable: ["branch.push"],
    supersedes: null,
    ...overrides,
  });
}

const CONTRACT = contractOf();

function outcomeOf(capabilities: readonly string[]): Classification {
  return classify(CONTRACT, { capabilities }, { runId: GRANTEE, configDigest: CONFIG_DIGEST });
}

describe("classify: the fixed order", () => {
  test("a stale subject refuses before the grant is read at all", () => {
    // D-0026 section 3 puts staleness first by name. The action below is
    // squarely granted, so the only thing that can refuse it is the digest --
    // which is the point: staleness is not something the grant gets a say in.
    const result = classify(
      CONTRACT,
      { capabilities: ["command.run"] },
      { runId: GRANTEE, configDigest: OTHER_DIGEST },
    );
    expect(result.outcome).toBe("refused");
    expect(result.reason).toBe("stale_subject");
  });

  test("staleness is reported even when the presenting run is wrong too", () => {
    // Both refuse, so the outcome cannot tell them apart; the reason can, and
    // the document fixes which one is reported so two implementations agree.
    const result = classify(
      CONTRACT,
      { capabilities: ["command.run"] },
      { runId: "run:someone-else", configDigest: OTHER_DIGEST },
    );
    expect(result.reason).toBe("stale_subject");
  });

  test("a contract presented on behalf of another run refuses", () => {
    // "A contract is not a bearer token" (D-0026 section 1): an authentic
    // contract copied from a neighbouring run must not carry its authority.
    const result = classify(
      CONTRACT,
      { capabilities: ["command.run"] },
      { runId: "run:beef", configDigest: CONFIG_DIGEST },
    );
    expect(result.outcome).toBe("refused");
    expect(result.reason).toBe("grantee_mismatch");
  });

  test("an action naming no capability refuses", () => {
    expect(outcomeOf([]).reason).toBe("no_capability");
    expect(outcomeOf([]).outcome).toBe("refused");
  });

  test("an action whose capabilities are not a list refuses", () => {
    const result = classify(
      CONTRACT,
      { capabilities: "command.run" as unknown as string[] },
      { runId: GRANTEE, configDigest: CONFIG_DIGEST },
    );
    expect(result.reason).toBe("no_capability");
  });
});

describe("classify: one key at a time", () => {
  test("a granted key is allowed", () => {
    expect(outcomeOf(["command.run"])).toMatchObject({ outcome: "allowed", reason: "granted" });
  });

  test("an askable key needs approval", () => {
    expect(outcomeOf(["branch.push"])).toMatchObject({
      outcome: "needs_approval",
      reason: "askable",
    });
  });

  test("a key in neither set is refused and is not escalatable", () => {
    // `commit.create` is a real key of version 1 that this contract does not
    // mention. It must not become askable by being absent, or a run could
    // escalate its way toward arbitrary authority.
    expect(outcomeOf(["commit.create"])).toMatchObject({
      outcome: "refused",
      reason: "not_in_contract",
    });
  });

  test("a key that is not a string is refused rather than throwing", () => {
    // Found by the sweep below rather than predicted: sorting the keys for a
    // deterministic reason handed `null` to a code-point collation, which threw
    // inside `Array.from`. An exception is a fourth state wearing a different
    // hat, so the case that reproduces it lives here as well as in the sweep.
    const result = classify(
      CONTRACT,
      { capabilities: [null, "command.run"] as unknown as string[] },
      { runId: GRANTEE, configDigest: CONFIG_DIGEST },
    );
    expect(result).toMatchObject({ outcome: "refused", reason: "unknown_capability" });
  });

  test("a key the pinned vocabulary does not contain is refused", () => {
    // Deny-by-default reaches acts the vocabulary has not learned yet
    // (D-0027 section 3): `network.fetch` is not in version 1, so an action
    // needing it cannot be answered `allowed` by any contract pinned there.
    expect(outcomeOf(["network.fetch"])).toMatchObject({
      outcome: "refused",
      reason: "unknown_capability",
    });
    expect(outcomeOf(["not a key at all"]).reason).toBe("unknown_capability");
  });
});

describe("classify: the strictest key wins", () => {
  test("granted plus askable needs approval", () => {
    expect(outcomeOf(["command.run", "branch.push"])).toMatchObject({
      outcome: "needs_approval",
      reason: "askable",
    });
  });

  test("granted plus refused is refused", () => {
    // The hole this closes is the one D-0027 section 3 names: a command that
    // pushes a branch performs both acts, and a contract granting only the
    // execution must not authorise the push.
    const pushingCommand = ["command.run", "branch.push"];
    const withoutAskable = contractOf({ granted: ["command.run"], askable: [] });
    const result = classify(
      withoutAskable,
      { capabilities: pushingCommand },
      {
        runId: GRANTEE,
        configDigest: CONFIG_DIGEST,
      },
    );
    expect(result).toMatchObject({ outcome: "refused", reason: "not_in_contract" });
  });

  test("all granted is allowed", () => {
    expect(outcomeOf(["command.run", "worktree.write"]).outcome).toBe("allowed");
  });

  test("the answer does not depend on the order the caller wrote the keys in", () => {
    const forwards = outcomeOf(["command.run", "branch.push", "network.fetch"]);
    const backwards = outcomeOf(["network.fetch", "branch.push", "command.run"]);
    expect(forwards).toEqual(backwards);
    expect(forwards.reason).toBe("unknown_capability");
  });

  test("two keys that refuse for different reasons report the same one either way", () => {
    // The case that makes the sort load-bearing. Both keys refuse -- one is
    // outside the vocabulary, the other is inside it and outside this contract
    // -- so the outcome cannot distinguish them and only the reason can. Without
    // an ordering, the reported reason would be whichever the caller happened to
    // list first, and two callers asking the same question would be told
    // different things about the same contract.
    const forwards = outcomeOf(["network.fetch", "commit.create"]);
    const backwards = outcomeOf(["commit.create", "network.fetch"]);
    expect(forwards).toEqual(backwards);
    expect(forwards.outcome).toBe("refused");
    // Code-point order, so `commit.create` is the key that reports.
    expect(forwards.reason).toBe("not_in_contract");
  });

  test("a repeated key is not a different action", () => {
    expect(outcomeOf(["command.run", "command.run"])).toEqual(outcomeOf(["command.run"]));
  });
});

describe("classify: what every answer carries", () => {
  test("every result carries the contract's digest, refusals included", () => {
    const digest = contractDigest(CONTRACT);
    const results = [
      outcomeOf(["command.run"]),
      outcomeOf(["branch.push"]),
      outcomeOf(["commit.create"]),
      outcomeOf([]),
      classify(
        CONTRACT,
        { capabilities: ["command.run"] },
        {
          runId: "run:beef",
          configDigest: OTHER_DIGEST,
        },
      ),
    ];
    for (const result of results) {
      expect(result.contractDigest).toBe(digest);
    }
  });

  test("the answer is frozen", () => {
    const result = outcomeOf(["command.run"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as { outcome: Outcome }).outcome = "allowed";
    }).toThrow(TypeError);
  });

  test("refuses to classify a value that is not a contract this package built", () => {
    // Not a fourth state: a forged contract is not an action being classified,
    // it is a value that went through no validation (design document section 4).
    const forged = { ...CONTRACT, grantee: "run:forged" } as unknown as typeof CONTRACT;
    refusal(ForgedContractError, () =>
      classify(
        forged,
        { capabilities: ["command.run"] },
        {
          runId: "run:forged",
          configDigest: CONFIG_DIGEST,
        },
      ),
    );
  });
});

/**
 * The falsifier for D-0026 section 3's totality (Issue #32).
 *
 * A deterministic sweep rather than a random one: the generator is seeded with a
 * constant, so a failure is reproducible from the case id alone and the double-
 * green rule (D-0006) does not turn a property test into a flaky one. The
 * shuffle CI applies is over test *order*, and these inputs must not move with
 * it.
 */
describe("classify: totality", () => {
  const OUTCOMES: readonly Outcome[] = ["allowed", "needs_approval", "refused"];
  const REASONS: readonly ClassificationReason[] = [
    "stale_subject",
    "grantee_mismatch",
    "no_capability",
    "unknown_capability",
    "granted",
    "askable",
    "not_in_contract",
  ];

  /** xorshift32, so the corpus is the same on every machine and every run. */
  function generator(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x1_0000_0000;
    };
  }

  /**
   * The nastiest strings this repository knows about, plus junk.
   *
   * Lone surrogates are here because they are the one class of string that makes
   * an *encoder* throw (D-0013), and a classifier that digested its inputs would
   * inherit that. Keys from a vocabulary version this build does not know are
   * here because "not in the pinned set" and "not a key at all" are different
   * rows that must both land inside the three values.
   */
  const POOL: readonly unknown[] = [
    "",
    " ",
    "command.run",
    "branch.push",
    "commit.create",
    "repo.clone",
    "network.fetch",
    "secret.read",
    "COMMAND.RUN",
    "command.run ",
    "command.run\n",
    "command",
    "command.run.fast",
    "\ud800",
    "\udfff",
    "\u{1f600}",
    "テスト",
    " ",
    "a".repeat(1024),
    "__proto__",
    "constructor",
    "toString",
    0,
    -1,
    Number.NaN,
    true,
    null,
    undefined,
    Symbol("テ"),
    {},
    [],
    () => "command.run",
  ];

  /** Version 1 itself, so the sweep reaches the rows a grant can actually answer. */
  const KEYS: readonly string[] = [
    "branch.push",
    "command.run",
    "commit.create",
    "delegation.issue",
    "pull_request.create",
    "repo.clone",
    "worktree.write",
  ];

  const contracts = [
    CONTRACT,
    contractOf({ granted: [], askable: [] }),
    contractOf({ granted: ["repo.clone"], askable: ["commit.create", "branch.push"] }),
    contractOf({ granted: [], askable: ["command.run"] }),
    contractOf({ supersedes: OTHER_DIGEST }),
  ];

  test("no input reaches a fourth state, and none throws", () => {
    const next = generator(0x5eed_1234);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;

    const seen = new Set<string>();
    for (let iteration = 0; iteration < 20_000; iteration += 1) {
      // Weighted rather than uniform, and the weighting is the point: drawn
      // uniformly from the junk pool, almost every case would refuse at step 1
      // and the sweep would be 20,000 repetitions of `stale_subject`. The
      // coverage assertion at the end is what holds this honest -- it fails if
      // the corpus stops reaching every outcome and every reason.
      const capabilities: unknown[] = [];
      const width = Math.floor(next() * 4);
      for (let index = 0; index < width; index += 1) {
        capabilities.push(next() < 0.7 ? pick(KEYS) : pick(POOL));
      }
      const context = {
        runId: next() < 0.5 ? GRANTEE : (pick(POOL) as string),
        configDigest: next() < 0.5 ? CONFIG_DIGEST : (pick([OTHER_DIGEST, ...POOL]) as string),
      };
      const contract = pick(contracts);

      const result = classify(
        contract,
        { capabilities: capabilities as string[] },
        context as { runId: string; configDigest: string },
      );

      // The assertion is deliberately about the *shape* of the answer rather
      // than about which answer it is: a fourth outcome, a reason nobody
      // defined, or a missing digest are each the failure this exists to catch.
      expect(OUTCOMES).toContain(result.outcome);
      expect(REASONS).toContain(result.reason);
      expect(result.contractDigest).toBe(contractDigest(contract));
      seen.add(`${result.outcome}:${result.reason}`);
    }

    // A sweep that only ever produced refusals would satisfy the assertions
    // above while testing almost nothing, so the corpus is required to have
    // reached every outcome and every reason at least once.
    for (const outcome of OUTCOMES) {
      expect([...seen].some((entry) => entry.startsWith(`${outcome}:`))).toBe(true);
    }
    for (const reason of REASONS) {
      expect([...seen].some((entry) => entry.endsWith(`:${reason}`))).toBe(true);
    }
  });
});
