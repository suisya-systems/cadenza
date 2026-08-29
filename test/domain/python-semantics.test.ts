/**
 * The contracts of the other Python built-ins this port had to rebuild.
 *
 * Target-only, for the reason `test/domain/canonical-json.test.ts` is: the
 * Python suite has nothing to say about `str.isspace()`, `difflib` or
 * `urlsplit`, because in Python they are the standard library and are true by
 * construction. Reimplementing them in a language whose nearest equivalents
 * answer differently is what created the surface.
 *
 * Every expected value here was taken from CPython 3.12 rather than reasoned
 * out, and each case is one where the *obvious* JavaScript spelling gives a
 * different answer. What these functions decide is not cosmetic: `isPythonSpace`
 * decides which catalogs are accepted, `urlsplit` decides which URLs are, and
 * `getCloseMatches` decides what an operator is told when a name is wrong.
 */
import { describe, expect, test } from "vitest";

import { getCloseMatches } from "../../src/domain/python-difflib.js";
import {
  isControlCharacter,
  isPythonSpace,
  pythonRepr,
  pythonTypeName,
} from "../../src/domain/python-text.js";
import {
  hostname,
  port,
  UrlValueError,
  urlsplit,
  userinfo,
} from "../../src/domain/python-urlsplit.js";

describe("str.isspace", () => {
  test("it disagrees with /\\s/ in both directions", () => {
    // The two differences, and both are reachable from a catalog file: a
    // base_branch holding U+0085 is refused by Python and would be accepted by
    // a `/\s/` translation, and one holding U+FEFF is the other way round.
    expect(isPythonSpace("\u0085")).toBe(true);
    expect(/\s/.test("\u0085")).toBe(false);
    expect(isPythonSpace("\ufeff")).toBe(false);
    expect(/\s/.test("\ufeff")).toBe(true);
  });

  test("the separators below U+0020 are whitespace to Python", () => {
    // U+001C..U+001F: file, group, record and unit separator.
    for (const code of [0x1c, 0x1d, 0x1e, 0x1f]) {
      expect(isPythonSpace(String.fromCodePoint(code))).toBe(true);
    }
    // U+200B ZERO WIDTH SPACE is not whitespace to Python, despite the name.
    expect(isPythonSpace("\u200b")).toBe(false);
  });

  test("the ordinary cases still answer the ordinary way", () => {
    for (const character of [" ", "\t", "\n", "\r", "\u00a0", "\u3000"]) {
      expect(isPythonSpace(character)).toBe(true);
    }
    expect(isPythonSpace("a")).toBe(false);
    expect(isPythonSpace("")).toBe(false);
  });

  test("a control character is C0 or DEL, and DEL is not whitespace", () => {
    expect(isControlCharacter("\u0000")).toBe(true);
    expect(isControlCharacter("\u007f")).toBe(true);
    expect(isPythonSpace("\u007f")).toBe(false);
    expect(isControlCharacter(" ")).toBe(false);
  });
});

describe("repr and type names", () => {
  test("repr switches quotes the way CPython does", () => {
    expect(pythonRepr("web")).toBe("'web'");
    expect(pythonRepr("it's")).toBe('"it\'s"');
    expect(pythonRepr('say "hi"')).toBe("'say \"hi\"'");
    // Both quotes present: single wins and is escaped.
    expect(pythonRepr("'\"")).toBe("'\\'\"'");
    expect(pythonRepr("a\\b")).toBe("'a\\\\b'");
    expect(pythonRepr("a\nb\tc")).toBe("'a\\nb\\tc'");
    expect(pythonRepr("\u0000")).toBe("'\\x00'");
  });

  test("a type name is Python's, as far as the language allows", () => {
    expect(pythonTypeName("x")).toBe("str");
    expect(pythonTypeName(null)).toBe("NoneType");
    expect(pythonTypeName(true)).toBe("bool");
    expect(pythonTypeName([1])).toBe("list");
    expect(pythonTypeName({})).toBe("dict");
    expect(pythonTypeName(1.5)).toBe("float");
    // And the one it does not: `1.0` is a float in Python and an integer here,
    // because JavaScript has a single numeric type. Asserted rather than left
    // as a comment, so the limitation is visible where it bites.
    expect(pythonTypeName(1.0)).toBe("int");
  });
});

describe("difflib.get_close_matches", () => {
  test("it suggests the near miss and refuses the unrelated name", () => {
    expect(getCloseMatches("wbe", ["api", "web"], 5)).toEqual(["web"]);
    expect(getCloseMatches("zzzzzzzz", ["api", "web"], 5)).toEqual([]);
  });

  test("ties break on the name, descending, not on the input order", () => {
    // `heapq.nlargest` over (score, word) pairs, which the standard library
    // documents as `sorted(reverse=True)[:n]`. Both candidates score 0.5
    // against "ab", so the ORDER is decided by the name, largest first -- not by
    // the order the possibilities were supplied in. The cutoff has to be lowered
    // to see it: at the default 0.6 both are refused, which is the next case's
    // subject.
    expect(getCloseMatches("ab", ["aa", "ba"], 5, 0.4)).toEqual(["ba", "aa"]);
    expect(getCloseMatches("ab", ["aa", "ba"], 5)).toEqual([]);
  });

  test("n caps the result and the cutoff is 0.6", () => {
    // Scores are 1.0, 0.857, 0.75 and 0.667; `n` keeps the best two.
    expect(getCloseMatches("web", ["web", "webb", "webbb", "webbbb"], 2)).toEqual(["web", "webb"]);
    // "cba" against "abc" shares no run of length two, so it scores below the
    // cutoff even though it is a permutation. An edit-distance substitute would
    // have ranked it much closer, which is why difflib is ported rather than
    // approximated.
    expect(getCloseMatches("abc", ["cba"], 5)).toEqual([]);
  });
});

describe("urlsplit", () => {
  test("it splits lexically instead of normalising like the URL class", () => {
    const parts = urlsplit("HTTPS://Example.INVALID/x");
    // The scheme is lower-cased and the host is left exactly as written; only
    // `hostname` lower-cases, and only for the caller that asks.
    expect(parts.scheme).toBe("https");
    expect(parts.netloc).toBe("Example.INVALID");
    expect(hostname(parts)).toBe("example.invalid");
  });

  test("a scp-style address has no scheme rather than a guessed one", () => {
    // `new URL` refuses this outright; `urlsplit` returns an empty scheme, and
    // an empty scheme is what `parseCloneSource` turns into its own refusal.
    expect(urlsplit("git@host:org/repo.git").scheme).toBe("");
  });

  test("userinfo is split at the LAST at-sign", () => {
    const parts = urlsplit("https://a@b@host/x");
    expect(userinfo(parts)).toEqual({ username: "a@b", password: null });
    expect(userinfo(urlsplit("https://user:pw@host/x"))).toEqual({
      username: "user",
      password: "pw",
    });
    expect(userinfo(urlsplit("https://host/x"))).toEqual({ username: null, password: null });
  });

  test("reading the port is what validates it", () => {
    // The split itself accepts anything; the refusal happens on access, which
    // is why `parseCloneSource` reads a port it otherwise has no use for.
    const bad = urlsplit("https://host:abc/x");
    expect(() => port(bad)).toThrow(UrlValueError);
    expect(() => port(urlsplit("https://host:99999/x"))).toThrow(/out of range/);
    expect(port(urlsplit("https://host:8080/x"))).toBe(8080);
    expect(port(urlsplit("https://host/x"))).toBe(null);
    // `str.isdigit()` is true for a fullwidth digit; CPython guards it with
    // `isascii()`, so this is refused rather than read as 12.
    expect(() => port(urlsplit("https://host:\uff11\uff12/x"))).toThrow(UrlValueError);
  });

  test("a bracketed host must be a real IPv6 literal", () => {
    expect(urlsplit("https://[::1]/x").netloc).toBe("[::1]");
    expect(() => urlsplit("https://[::1/x")).toThrow(/Invalid IPv6 URL/);
    expect(() => urlsplit("https://[1.2.3.4]/x")).toThrow(/IPv4 address cannot be in brackets/);
    expect(() => urlsplit("https://[bad]/x")).toThrow(UrlValueError);
  });

  test("a netloc that NFKC would turn into another URL is refused", () => {
    // U+2100 normalises to "a/c", so this host is one name before normalisation
    // and a different URL after it.
    expect(() => urlsplit("https://\u2100b/x")).toThrow(/NFKC normalization/);
    // A host that merely holds non-ASCII is fine: it normalises to itself.
    expect(urlsplit("https://b\u00fccher.example/x").netloc).toBe("b\u00fccher.example");
  });
});
