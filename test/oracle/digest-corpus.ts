/**
 * The TypeScript half of the config_digest differential oracle's corpus.
 *
 * Stated **independently** of `scripts/oracle/dump_config_digest.py`, which is
 * the point: the comparison in `test/domain/digest-oracle.test.ts` reads only
 * the *outputs* from the committed vector, never the inputs. A corpus read out
 * of the vector would agree with itself no matter how wrong it was.
 *
 * Every non-ASCII and non-printable character is written as an escape rather
 * than as a literal, so this file is pure ASCII. Two of these cases differ only
 * by Unicode normalisation; spelled as literals they would be a pair no
 * reviewer can tell apart and no editor promises to leave alone. Three more
 * carry control characters, which a literal spelling hides outright.
 *
 * The ids and their order must match the Python half exactly; the test asserts
 * that before it compares a single byte.
 */
import {
  type CloneSource,
  gitUrlSource,
  localPathSource,
  newRepositorySource,
} from "../../src/domain/clone-source.js";
import { type Project, project } from "../../src/domain/project.js";

const WEB_URL = "https://example.invalid/org/web.git";

function gitUrl(): CloneSource {
  return gitUrlSource(WEB_URL);
}

export const DIGEST_CORPUS: readonly (readonly [id: string, value: Project])[] = [
  // -- reachable through a catalog file ------------------------------------
  ["ascii-git-url", project("web", ["site", "frontend"], gitUrl(), "main")],
  ["no-aliases", project("web", [], gitUrl(), "main")],
  ["new-repository", project("web", ["site"], newRepositorySource(), "main")],
  ["local-path", project("web", [], localPathSource("/srv/web"), "main")],
  // U+65E5 U+672C U+8A9E -- "Japanese", three ordinary BMP characters.
  ["non-ascii-path", project("web", [], localPathSource("/srv/\u65e5\u672c\u8a9e"), "main")],
  // MATHEMATICAL DOUBLE-STRUCK CAPITAL U, then GRINNING FACE: both astral, so
  // both are surrogate pairs in UTF-16 and four bytes each in UTF-8.
  ["astral-path", project("web", [], localPathSource("/srv/\u{1d54c}\u{1f600}"), "main")],
  ["idn-host-url", project("web", [], gitUrlSource("https://\u4f8b.invalid/org/web.git"), "main")],
  ["non-ascii-base-branch", project("web", [], gitUrl(), "release/\u30ea\u30ea\u30fc\u30b9")],
  // U+00E9 (NFC "e-acute") against U+0065 U+0301 (NFD "e" + combining acute).
  // Different strings, and they must stay different digests: the digest is over
  // bytes, not over a normalisation nobody applied.
  ["combining-marks-path", project("web", [], localPathSource("/srv/caf\u00e9"), "main")],
  [
    "combining-marks-path-decomposed",
    project("web", [], localPathSource("/srv/cafe\u0301"), "main"),
  ],
  // -- beyond what the validator admits ------------------------------------
  // The whole of Python's ESCAPE_DCT (U+0008, U+0009, U+000A, U+000C, U+000D)
  // plus U+0000 and U+001F as representative other C0 controls, plus the two
  // characters JSON always escapes.
  [
    "escapes-in-path",
    project(
      "web",
      [],
      localPathSource('/srv/\u0008\u0009\u000a\u000c\u000d\u0000\u001f"\\'),
      "main",
    ),
  ],
  // U+007F is NOT escaped by either encoder, and U+0085 is a C1 control that
  // neither treats specially. Both are places a "hardened" encoder is tempted
  // to differ from CPython.
  ["del-and-c1-in-path", project("web", [], localPathSource("/srv/\u007f\u0085"), "main")],
  // U+2028/U+2029 are legal raw in JSON and are left raw by both.
  [
    "line-and-paragraph-separator-in-path",
    project("web", [], localPathSource("/srv/\u2028\u2029"), "main"),
  ],
  // The case UTF-16 ordering gets wrong. By code point, U+FFFD < U+10000; by
  // UTF-16 code unit the astral character begins 0xD800, which sorts BELOW
  // 0xFFFD. Python sorts by code point, and the default `Array.prototype.sort`
  // does not.
  [
    "alias-sort-crosses-the-surrogate-boundary",
    project("web", ["\ufffd", "\u{10000}", "a"], gitUrl(), "main"),
  ],
  // A prefix sorts before the longer string it prefixes, and neither side may
  // shortcut on length.
  ["alias-sort-is-not-length-first", project("web", ["ab", "a", "aa", "b"], gitUrl(), "main")],
];
