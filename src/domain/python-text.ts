/**
 * The Python string semantics this port depends on, spelled out.
 *
 * Each function here exists because the obvious JavaScript spelling is *nearly*
 * the Python one, and the gap is silent. `docs/porting.md` section 7 records the
 * first of them as a known trap for this belt; the rest were found the same way,
 * by asking what the Python built-in actually does rather than what it looks
 * like it does.
 */

/**
 * `str.isspace()` for one character.
 *
 * **Not `/\s/`.** The two sets differ in both directions, and both differences
 * are reachable from a catalog file:
 *
 *  - Python is whitespace at U+001C..U+001F (the file/group/record/unit
 *    separators) and U+0085 (NEL); JavaScript's `\s` is not.
 *  - JavaScript's `\s` is whitespace at U+FEFF (the byte-order mark); Python's
 *    `str.isspace()` is not.
 *
 * `_parse_git_url` and `parse_base_branch` both refuse a value on this
 * predicate, so translating either to `\s` would change **which catalogs are
 * accepted** -- a `base_branch` containing U+0085 would start composing, and one
 * containing U+FEFF would stop. The set below is CPython's: bidirectional class
 * WS, B or S, or general category Zs.
 */
const PYTHON_WHITESPACE: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000,
]);

/** Whether `character`, a single code point, satisfies Python's `str.isspace()`. */
export function isPythonSpace(character: string): boolean {
  const code = character.codePointAt(0);
  return code !== undefined && PYTHON_WHITESPACE.has(code);
}

/** A C0 control or DEL, which is what the domain refuses in a path or a URL. */
export function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  return code !== undefined && (code < 0x20 || code === 0x7f);
}

/**
 * `type(value).__name__`, for the "got {type}" half of a refusal.
 *
 * **`int` versus `float` cannot be recovered here**, and this is not a
 * shortcoming of the mapping -- it is the language. Python's `1` and `1.0` are
 * different types; JavaScript has one numeric type and `1.0 === 1`. So an
 * integral `number` is reported as `int`. The place where that distinction is
 * load-bearing rather than cosmetic is `schema_version`, and it is recorded as a
 * finding in `parity/compose.ledger.json` rather than papered over here.
 */
export function pythonTypeName(value: unknown): string {
  if (value === null || value === undefined) {
    return "NoneType";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "bigint") {
    return "int";
  }
  if (typeof value === "string") {
    return "str";
  }
  if (Array.isArray(value)) {
    return "list";
  }
  return "dict";
}

/**
 * `repr()` of a string, for the `{value!r}` in a refusal's text.
 *
 * CPython prefers single quotes and switches to double quotes only for a string
 * that contains a single quote and no double quote. Escapes are `\\`, the quote
 * in use, `\t`, `\n`, `\r`, and `\xXX` for every other non-printable character.
 *
 * **Limitation, stated rather than hidden:** CPython decides "printable" from
 * the Unicode general category, so a non-ASCII format-control or unassigned code
 * point is escaped there and passes through as itself here. Reproducing that
 * needs the Unicode character database. It affects the *text of a refusal* and
 * nothing a run persists, and no case in this belt's three source files reaches
 * it, so the gap is documented and left. The ASCII range -- which is what every
 * refusal in the ported suite prints -- is exact.
 */
export function pythonRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const character of value) {
    if (character === "\\") {
      out += "\\\\";
    } else if (character === quote) {
      out += `\\${quote}`;
    } else if (character === "\t") {
      out += "\\t";
    } else if (character === "\n") {
      out += "\\n";
    } else if (character === "\r") {
      out += "\\r";
    } else if (isControlCharacter(character)) {
      const code = character.codePointAt(0) as number;
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else {
      out += character;
    }
  }
  return out + quote;
}

/**
 * `ascii()` of a string: `repr()` with every non-ASCII character escaped.
 *
 * G2's refusals print values the caller chose -- a run identity, a capability
 * key, a digest -- and unlike G1's they are not constrained to ASCII by the
 * shape rule that refused them: a `grantee` may legitimately hold any printable
 * Unicode (design document section 4.1), and a refused key may hold anything at
 * all. D-0007 requires everything cadenza prints to be ASCII, because the
 * console this is developed against is cp932, where an unencodable character
 * kills the process at the print rather than at the bug.
 *
 * So G2 formats with this rather than with {@link pythonRepr}, and the choice is
 * CPython's own: `ascii()` is exactly `repr()` with the non-ASCII escaped,
 * spelled `\xXX`, `\uXXXX` or `\UXXXXXXXX` by width. The limitation
 * {@link pythonRepr} records does not reach here -- every non-ASCII character is
 * escaped regardless of its category, which is what CPython does too.
 */
export function pythonAscii(value: string): string {
  return escapeNonAscii(pythonRepr(value));
}

/**
 * Escape every non-ASCII character of `text`, leaving the rest as it is.
 *
 * Split out from {@link pythonAscii} because it is also needed on text that is
 * already a formatted refusal: G2 reuses G1's `parseIdentifier`, whose message
 * is built with {@link pythonRepr} and cannot change without changing what the
 * ported suite pins, so the G2 caller escapes the result instead. Escaping a
 * message that is already ASCII leaves it byte for byte identical, which is why
 * doing so costs nothing where it is not needed.
 */
export function escapeNonAscii(text: string): string {
  let out = "";
  for (const character of text) {
    const code = character.codePointAt(0) as number;
    if (code <= 0x7e) {
      out += character;
    } else if (code < 0x100) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else if (code < 0x10000) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += `\\U${code.toString(16).padStart(8, "0")}`;
    }
  }
  return out;
}
