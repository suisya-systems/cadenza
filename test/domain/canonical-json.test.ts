/**
 * The canonical encoder's own contract.
 *
 * **Target-only**: no case here translates a source case, and
 * `parity/target-only.json` records the file as such. `tests/test_digest.py`
 * has nothing to say about any of this, because in Python it is all true by
 * construction -- `sorted()` compares code points, and `str.encode("utf-8")`
 * refuses a lone surrogate, without anyone writing a test. Reimplementing those
 * two facts in a language whose defaults are the other way is what created the
 * surface, so the surface gets assertions.
 *
 * The differential oracle checks the same code against real CPython output and
 * is the stronger check; these cases exist so that a failure says *which
 * property* broke rather than "case 11 diverged".
 */
import { describe, expect, test } from "vitest";

import {
  canonicalJson,
  compareByCodePoint,
  NonIntegerNumberError,
  SurrogateInStringError,
} from "../../src/domain/canonical-json.js";

describe("compareByCodePoint", () => {
  test("orders an astral character above U+FFFD, as Python does", () => {
    // The exact case the default comparator gets wrong: U+10000 begins with the
    // surrogate code unit 0xD800, which is numerically below 0xFFFD, so a
    // UTF-16 comparison puts the astral character first. Python compares code
    // points and puts it last.
    const astral = "\u{10000}";
    const replacement = "\ufffd";
    expect(compareByCodePoint(replacement, astral)).toBeLessThan(0);
    // Stated as the contrast rather than assumed, so this case still means
    // something if a future engine changes its default.
    expect([astral, replacement].sort()).toEqual([astral, replacement]);
    expect([astral, replacement].sort(compareByCodePoint)).toEqual([replacement, astral]);
  });

  test("orders a prefix before the string it prefixes", () => {
    expect(compareByCodePoint("a", "aa")).toBeLessThan(0);
    expect(compareByCodePoint("aa", "a")).toBeGreaterThan(0);
    expect(compareByCodePoint("a", "a")).toBe(0);
  });

  test("orders by the first differing code point, not by length", () => {
    expect(compareByCodePoint("b", "aa")).toBeGreaterThan(0);
  });
});

describe("canonicalJson", () => {
  test("sorts object keys by code point, whatever order they were built in", () => {
    // Unreachable through `Project`, whose payload keys are fixed and ASCII, so
    // it is asserted directly: the encoder is a general function and a later
    // belt may hand it a wider payload.
    expect(canonicalJson({ b: "2", a: "1" })).toBe('{"a":"1","b":"2"}');
    expect(canonicalJson({ "\u{10000}": "astral", "\ufffd": "replacement" })).toBe(
      '{"\ufffd":"replacement","\u{10000}":"astral"}',
    );
  });

  test("emits no whitespace between members", () => {
    // Python's `separators=(",", ":")`. `JSON.stringify` agrees only because no
    // indent argument is passed, which is a default this pins rather than
    // trusts.
    expect(canonicalJson({ a: ["1", "2"], b: { c: "3" } })).toBe('{"a":["1","2"],"b":{"c":"3"}}');
  });

  test("refuses a lone surrogate rather than escaping it", () => {
    // `JSON.stringify` is well-formed since ES2019 and would happily return
    // `"\ud800"`. CPython emits the raw character and then `.encode("utf-8")`
    // raises. Refusing is the behaviour that ports; inventing a digest where
    // the source raised is not.
    expect(() => canonicalJson("\ud800")).toThrow(SurrogateInStringError);
    expect(() => canonicalJson("\udc00")).toThrow(SurrogateInStringError);
    expect(() => canonicalJson({ "\ud800": "key" })).toThrow(SurrogateInStringError);
    expect(() => canonicalJson(["\ud800"])).toThrow(SurrogateInStringError);
  });

  test("accepts a well-formed surrogate pair", () => {
    // The refusal must be about *lone* surrogates: an astral character is a
    // pair, and rejecting it would refuse half the reachable corpus.
    expect(canonicalJson("\u{1f600}")).toBe('"\u{1f600}"');
  });

  // `null` and integers arrived with `contract_digest`
  // (`docs/design/g2-delegation-contract.md` section 6), which carries
  // `supersedes` as a digest or as `null` and `vocabulary_version` as an
  // integer. No G1 payload holds either, so no oracle vector covers them and
  // these cases are the only place the spelling is pinned.
  test("writes null as null, the way json.dumps writes None", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson({ supersedes: null })).toBe('{"supersedes":null}');
    // The distinction the digest depends on: an omitted key and a null key are
    // different bytes, so a contract that opens a lineage cannot collide with
    // one that replaces something.
    expect(canonicalJson({})).not.toBe(canonicalJson({ supersedes: null }));
  });

  test("writes an integer as its decimal digits", () => {
    expect(canonicalJson(1)).toBe("1");
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-7)).toBe("-7");
    expect(canonicalJson({ vocabulary_version: 1 })).toBe('{"vocabulary_version":1}');
  });

  test("refuses a number that is not a safe integer", () => {
    // CPython spells `1.0` as `1.0` and JavaScript spells it as `1`, so a float
    // in a digest would depend on which runtime computed it. `allow_nan=False`
    // refuses the rest on the Python side, and so does this.
    expect(() => canonicalJson(1.5)).toThrow(NonIntegerNumberError);
    expect(() => canonicalJson(Number.NaN)).toThrow(NonIntegerNumberError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(NonIntegerNumberError);
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 2)).toThrow(NonIntegerNumberError);
  });

  test("writes negative zero as 0, which is the integer Python would have had", () => {
    // `Number.isSafeInteger(-0)` is true and `String(-0)` is "0". That is the
    // right answer rather than a divergence: the payload field this exists for
    // is an integer, and CPython has no negative zero integer to disagree with.
    expect(canonicalJson(-0)).toBe("0");
  });
});
