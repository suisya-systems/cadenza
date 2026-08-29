/**
 * `urllib.parse.urlsplit`, and the four accessors `_parse_git_url` reads.
 *
 * **Not `new URL(...)`.** The WHATWG parser the platform ships is a different
 * function with a different job: it lower-cases, percent-encodes, applies IDNA
 * to the host, resolves relative references and drops a default port. Python's
 * `urlsplit` is a lexical split that keeps the string as written and validates
 * almost nothing until an accessor is *read*. The distinction is load-bearing
 * twice over: the URL that survives validation is stored verbatim and hashed
 * into `config_digest`, and the source's own comment records that reading
 * `parts.port` is *what validates it* -- `urlsplit` carries `"abc"` or `99999`
 * happily until something asks.
 *
 * Ported against CPython 3.12.
 *
 * **Where this port is knowingly approximate**, and who owns closing it:
 * `_check_bracketed_host` defers to `ipaddress.ip_address`, and the check below
 * uses `node:net`'s `isIP` instead. The two agree on ordinary addresses and may
 * disagree at the edges (a scoped or otherwise unusual literal). No case in this
 * belt's three source files uses a bracketed host; the 57 cases of
 * `tests/test_clone_source.py` are where the URL surface is pinned, and that
 * belt owns this line. It is recorded in the ledgers as an inherited limitation
 * rather than left for someone to find.
 */
import { isIP } from "node:net";

/** What `urlsplit` returns, minus the fragment and query this caller ignores. */
export interface SplitResult {
  readonly scheme: string;
  readonly netloc: string;
}

/** Raised where CPython raises `ValueError` from `urlsplit` or an accessor. */
export class UrlValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValueError";
  }
}

const SCHEME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-.";

function isAsciiLetter(character: string): boolean {
  return /^[A-Za-z]$/.test(character);
}

/**
 * `_check_bracketed_netloc`: WHERE the brackets may appear, not merely what is
 * inside them.
 *
 * CPython's comment on this function is that it "must mirror the splitting done
 * in `NetlocResultMixins._hostinfo()`", and the mirroring is the whole point:
 * checking only the text between the brackets accepts `x[::1]` and `[::1]x:80`,
 * whose bracketed part is a perfectly good IPv6 literal sitting in the wrong
 * place. CPython refuses both as `Invalid IPv6 URL`, so a port that checked only
 * the inside would compose clone sources the reference implementation rejects.
 *
 * (Found by review. The earlier version of this file extracted the bracketed
 * host with two `partition`s and validated that alone -- which is what CPython
 * did before 3.11 moved the placement rules into this function.)
 */
function checkBracketedNetloc(netloc: string): void {
  const at = netloc.lastIndexOf("@");
  const hostAndPort = at === -1 ? netloc : netloc.slice(at + 1);
  const open = hostAndPort.indexOf("[");
  let host: string;
  if (open !== -1) {
    // No data is allowed before a bracket.
    if (open !== 0) {
      throw new UrlValueError("Invalid IPv6 URL");
    }
    const bracketed = hostAndPort.slice(open + 1);
    const close = bracketed.indexOf("]");
    host = close === -1 ? bracketed : bracketed.slice(0, close);
    const rest = close === -1 ? "" : bracketed.slice(close + 1);
    // No data is allowed after the bracket but before the port delimiter.
    if (rest !== "" && !rest.startsWith(":")) {
      throw new UrlValueError("Invalid IPv6 URL");
    }
  } else {
    const colon = hostAndPort.indexOf(":");
    host = colon === -1 ? hostAndPort : hostAndPort.slice(0, colon);
  }
  checkBracketedHost(host);
}

/** `_check_bracketed_host`: what may appear between `[` and `]`. */
function checkBracketedHost(host: string): void {
  if (host.startsWith("v")) {
    if (!/^v[a-fA-F0-9]+\..+$/.test(host)) {
      throw new UrlValueError("IPvFuture address is invalid");
    }
    return;
  }
  const version = isIP(host);
  if (version === 0) {
    throw new UrlValueError(
      `${JSON.stringify(host)} does not appear to be an IPv4 or IPv6 address`,
    );
  }
  if (version === 4) {
    throw new UrlValueError("An IPv4 address cannot be in brackets");
  }
}

/**
 * `_checknetloc`: refuse a netloc that NFKC normalisation would turn into a
 * different URL.
 *
 * The attack this closes is a host containing a character such as U+2100, which
 * normalises to `a/c` -- so a name that looks like one host is another one after
 * the normalisation some later consumer applies.
 */
function checkNetloc(netloc: string): void {
  // `str.isascii()` is true for the empty string, so both arms of CPython's
  // guard collapse to "nothing to do" here.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range is the test.
  if (netloc === "" || /^[\x00-\x7f]*$/.test(netloc)) {
    return;
  }
  const stripped = netloc
    .replaceAll("@", "")
    .replaceAll(":", "")
    .replaceAll("#", "")
    .replaceAll("?", "");
  const normalised = stripped.normalize("NFKC");
  if (stripped === normalised) {
    return;
  }
  for (const character of "/?#@:") {
    if (normalised.includes(character)) {
      throw new UrlValueError(
        `netloc '${netloc}' contains invalid characters under NFKC normalization`,
      );
    }
  }
}

/**
 * The C0 controls and space `urlsplit` strips from the left of a URL.
 *
 * `_WHATWG_C0_CONTROL_OR_SPACE` in CPython. Unreachable from `_parse_git_url`,
 * which refuses every one of these characters before it calls `urlsplit` -- kept
 * because `urlsplit` is ported as `urlsplit`, not as "the part of it one caller
 * happens to reach".
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is the subject.
const C0_CONTROL_OR_SPACE = /^[\x00-\x20]+/;

/** `urllib.parse.urlsplit(url)`, for the parts this domain reads. */
export function urlsplit(rawUrl: string): SplitResult {
  // Only the left end is stripped: some applications rely on a preserved
  // trailing space, and CPython says so in a comment.
  let url = rawUrl.replace(C0_CONTROL_OR_SPACE, "");
  for (const unsafe of ["\t", "\r", "\n"]) {
    url = url.replaceAll(unsafe, "");
  }
  let scheme = "";
  let netloc = "";
  const colon = url.indexOf(":");
  if (colon > 0 && isAsciiLetter(url[0] as string)) {
    const candidate = url.slice(0, colon);
    if ([...candidate].every((character) => SCHEME_CHARS.includes(character))) {
      scheme = candidate.toLowerCase();
      url = url.slice(colon + 1);
    }
  }
  if (url.slice(0, 2) === "//") {
    // `_splitnetloc`: the EARLIEST of the three delimiters, found by index.
    // Spelled with `indexOf` rather than by iterating code points, because a
    // code-point position cannot be handed to `slice`, which counts UTF-16 code
    // units -- an astral character before the delimiter would cut the netloc in
    // the wrong place, and in the middle of a surrogate pair at that.
    let end = url.length;
    for (const delimiter of "/?#") {
      const found = url.indexOf(delimiter, 2);
      if (found >= 0) {
        end = Math.min(end, found);
      }
    }
    netloc = url.slice(2, end);
    const open = netloc.includes("[");
    const close = netloc.includes("]");
    if (open !== close) {
      throw new UrlValueError("Invalid IPv6 URL");
    }
    if (open && close) {
      checkBracketedNetloc(netloc);
    }
  }
  checkNetloc(netloc);
  return { scheme, netloc };
}

/** `SplitResult.username` and `.password`, which are read off the netloc. */
export function userinfo(parts: SplitResult): {
  username: string | null;
  password: string | null;
} {
  const at = parts.netloc.lastIndexOf("@");
  if (at === -1) {
    return { username: null, password: null };
  }
  const info = parts.netloc.slice(0, at);
  const colon = info.indexOf(":");
  if (colon === -1) {
    return { username: info, password: null };
  }
  return { username: info.slice(0, colon), password: info.slice(colon + 1) };
}

/** The host and the raw port text, split the way `_hostinfo` splits them. */
function hostinfo(parts: SplitResult): { host: string; port: string | null } {
  const at = parts.netloc.lastIndexOf("@");
  const rest = at === -1 ? parts.netloc : parts.netloc.slice(at + 1);
  let host: string;
  let port: string;
  const open = rest.indexOf("[");
  if (open !== -1) {
    const bracketed = rest.slice(open + 1);
    const close = bracketed.indexOf("]");
    host = close === -1 ? bracketed : bracketed.slice(0, close);
    const after = close === -1 ? "" : bracketed.slice(close + 1);
    const separator = after.indexOf(":");
    port = separator === -1 ? "" : after.slice(separator + 1);
  } else {
    const separator = rest.indexOf(":");
    host = separator === -1 ? rest : rest.slice(0, separator);
    port = separator === -1 ? "" : rest.slice(separator + 1);
  }
  return { host, port: port === "" ? null : port };
}

/** `SplitResult.hostname`: lower-cased, with an IPv6 zone left alone. */
export function hostname(parts: SplitResult): string | null {
  const { host } = hostinfo(parts);
  if (host === "") {
    return null;
  }
  const percent = host.indexOf("%");
  if (percent === -1) {
    return host.toLowerCase();
  }
  return host.slice(0, percent).toLowerCase() + host.slice(percent);
}

/**
 * `SplitResult.port`. **Reading it is what validates it.**
 *
 * CPython guards `port.isdigit()` with `port.isascii()`, because `str.isdigit()`
 * is true for a fullwidth digit that `int()` would then accept -- so the pair
 * means "ASCII digits only", which is what the pattern below says directly.
 */
export function port(parts: SplitResult): number | null {
  const { port: raw } = hostinfo(parts);
  if (raw === null) {
    return null;
  }
  if (!/^[0-9]+$/.test(raw)) {
    throw new UrlValueError(`Port could not be cast to integer value as '${raw}'`);
  }
  const value = Number(raw);
  if (value < 0 || value > 65535) {
    throw new UrlValueError("Port out of range 0-65535");
  }
  return value;
}
