/**
 * Python's `json.dumps(..., sort_keys=True, separators=(",", ":"),
 * ensure_ascii=False, allow_nan=False).encode("utf-8")`, reproduced byte for
 * byte.
 *
 * This module exists because `config_digest` is a **persisted** value
 * (`docs/design/g1-project-registry.md` section 4): a run records it, and a
 * later audit compares the recorded digest against a freshly computed one. A
 * digest that changed when the implementation language changed would make every
 * pre-port run look like a catalog that had moved. So the encoding is not "some
 * canonical JSON"; it is CPython's, and the bytes are the contract.
 *
 * `JSON.stringify` is close, and the places it is not close are the whole
 * reason this file is not a one-liner:
 *
 *  - **Key order.** `sort_keys=True` sorts by Python's `<` on `str`, which
 *    compares **code points**. `JSON.stringify` emits insertion order, and the
 *    obvious repair -- `Object.keys(o).sort()` -- sorts by UTF-16 **code
 *    units**. Those two orders disagree for any key holding an astral character
 *    beside one in U+E000..U+FFFF, because a surrogate code unit (0xD800..) is
 *    numerically *below* U+FFFD while the code point it encodes is above it.
 *    See {@link compareByCodePoint}.
 *  - **Lone surrogates.** `JSON.stringify` is well-formed since ES2019: it
 *    escapes an unpaired surrogate as `\udXXX` and returns a string. Python
 *    emits the raw character and then `.encode("utf-8")` raises
 *    `UnicodeEncodeError`. Refusing is the behaviour that ports; producing a
 *    digest where the source produced an exception is not. See
 *    {@link SurrogateInStringError}.
 *
 * Everything else does agree, and is relied on rather than re-implemented:
 * both escape `"` and `\`, both spell U+0008/U+0009/U+000A/U+000C/U+000D as
 * `\b`/`\t`/`\n`/`\f`/`\r`, both spell every other C0 control as `\u00xx` with
 * **lowercase** hex, and neither escapes U+007F. That agreement is an
 * assumption about two runtimes, so it is not left as a comment: it is pinned
 * against real CPython output by the differential oracle
 * (`docs/porting.md` section 4).
 */

/** Values this encoder accepts. Deliberately narrow: it is not a general codec. */
export type CanonicalValue =
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * A string held an unpaired surrogate, which CPython cannot encode as UTF-8.
 *
 * Python's failure here is `UnicodeEncodeError` from the `.encode("utf-8")`
 * that follows `json.dumps`. The class differs; that a digest is refused rather
 * than invented does not.
 */
export class SurrogateInStringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurrogateInStringError";
  }
}

/**
 * Python's `<` on `str`: compare by Unicode code point.
 *
 * `String.prototype.localeCompare` is locale-dependent and therefore cannot be
 * used for a persisted value at all; `<` on strings is UTF-16 code-unit order,
 * which differs from code-point order exactly where surrogates are involved.
 * Iterating with `for..of` yields code points, so the comparison below is the
 * one Python makes.
 */
export function compareByCodePoint(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    // `a[index]` is a whole code point, so `codePointAt(0)` is its scalar value.
    const x = (a[index] as string).codePointAt(0) as number;
    const y = (b[index] as string).codePointAt(0) as number;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (a.length === b.length) {
    return 0;
  }
  return a.length < b.length ? -1 : 1;
}

/** The UTF-8 bytes CPython would produce for `value`. */
export function canonicalJsonBytes(value: CanonicalValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/** The text CPython's `json.dumps` would produce for `value`. */
export function canonicalJson(value: CanonicalValue): string {
  if (typeof value === "string") {
    return encodeString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalJson(element)).join(",")}]`;
  }
  const object = value as { readonly [key: string]: CanonicalValue };
  const keys = Object.keys(object).sort(compareByCodePoint);
  const members = keys.map((key) => {
    // `Object.keys` on a plain object never yields a missing entry, but
    // `noUncheckedIndexedAccess` cannot know that; the assertion is narrower
    // than a non-null on the whole lookup chain.
    return `${encodeString(key)}:${canonicalJson(object[key] as CanonicalValue)}`;
  });
  return `{${members.join(",")}}`;
}

function encodeString(value: string): string {
  rejectLoneSurrogates(value);
  // Safe only because the escape sets are identical (see the module comment),
  // and that identity is what the differential oracle checks.
  return JSON.stringify(value);
}

function rejectLoneSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit < 0xd800 || unit > 0xdfff) {
      continue;
    }
    const isHigh = unit <= 0xdbff;
    const next = index + 1 < value.length ? value.charCodeAt(index + 1) : Number.NaN;
    if (isHigh && next >= 0xdc00 && next <= 0xdfff) {
      index += 1;
      continue;
    }
    throw new SurrogateInStringError(
      `cannot encode string as UTF-8: unpaired surrogate U+${unit
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")} at index ${index}`,
    );
  }
}
