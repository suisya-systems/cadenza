"""The Python half of the config_digest differential oracle.

``config_digest`` is a *persisted* value (design doc section 4): a run records
it, and a later audit reads a changed digest as "the catalog moved underneath a
run that already happened". A digest that changed because the implementation
language changed would make every pre-port run look like that.

So the claim this oracle makes is narrower and harder than any ported test's:

    given the same project, the bytes CPython encodes and the bytes Node encodes
    are the same bytes, and therefore the digests are the same string.

A ported test cannot make that claim. ``tests/test_digest.py`` asserts the
encoding for exactly one project, spelled in ASCII; everything Python's
``json.dumps`` does that the TypeScript side had to reimplement -- escaping,
``ensure_ascii=False``, ``sort_keys`` under a non-ASCII collation -- is
unexercised by it, and both suites would go green while the two implementations
disagreed on the first project with a non-ASCII path in it.

The corpus below is built **independently on each side**: this file states it in
Python and ``test/oracle/digest-corpus.ts`` states it in TypeScript, and the
comparison checks that the ids line up before it compares anything else. Reading
the inputs out of the vector instead would let a wrong corpus agree with itself.

Run, from the repository root:

    PYTHONDONTWRITEBYTECODE=1 python3 scripts/oracle/dump_config_digest.py \
        parity/oracle/config-digest-vector.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# The oracle has to be runnable without installing the package: an installed
# copy is exactly the stale-install hazard CLAUDE.md's src-layout rule is about,
# and a vector generated from a stale install would be silently wrong.
sys.path.insert(0, str(ROOT / "src"))

from cadenza.domain.clone_source import (  # noqa: E402
    GitUrlSource,
    LocalPathSource,
    NewRepositorySource,
)
from cadenza.domain.digest import canonical_payload, config_digest  # noqa: E402
from cadenza.domain.project import Project  # noqa: E402

WEB_URL = "https://example.invalid/org/web.git"


def corpus() -> list[tuple[str, Project]]:
    """The vector's inputs, in a fixed order.

    Two groups, and the split is deliberate.

    **Reachable through a catalog file.** Every string here can arrive from a
    validated ``config/projects.toml``: identifiers are ``[a-z0-9_-]``, but a
    path, a URL host and a base branch may all hold non-ASCII, including astral
    characters. These are the cases where a divergence would corrupt real data.

    Every non-ASCII character below is written as an escape rather than as a
    literal, so this file is pure ASCII. Two of these cases differ only by
    Unicode normalisation, and a literal NFC "cafe" beside a literal NFD one is
    a pair no reviewer can tell apart and no editor promises to leave alone.
    ``test/oracle/digest-corpus.ts`` is written the same way for the same
    reason.

    **Beyond what the validator admits.** Control characters in a path, and
    aliases outside the identifier shape. ``parse_clone_source`` and
    ``parse_identifier`` refuse both today, so nothing in this group can reach
    ``config_digest`` through a file. They are here anyway, because
    ``config_digest`` is a plain function over a ``Project`` and the validator is
    not part of it: a later belt that widens an input, or a caller that builds a
    ``Project`` directly, meets the encoder without meeting the validator. And
    the cost of finding an encoder divergence *then* is not one bad run -- it is
    that every digest already written is suspect.
    """
    return [
        # -- reachable through a catalog file --------------------------------
        ("ascii-git-url", Project("web", ("site", "frontend"), GitUrlSource(url=WEB_URL), "main")),
        ("no-aliases", Project("web", (), GitUrlSource(url=WEB_URL), "main")),
        ("new-repository", Project("web", ("site",), NewRepositorySource(), "main")),
        ("local-path", Project("web", (), LocalPathSource(path="/srv/web"), "main")),
        (
            "non-ascii-path",
            Project("web", (), LocalPathSource(path="/srv/\u65e5\u672c\u8a9e"), "main"),
        ),
        (
            "astral-path",
            Project("web", (), LocalPathSource(path="/srv/\U0001d54c\U0001f600"), "main"),
        ),
        (
            "idn-host-url",
            Project("web", (), GitUrlSource(url="https://\u4f8b.invalid/org/web.git"), "main"),
        ),
        (
            "non-ascii-base-branch",
            Project("web", (), GitUrlSource(url=WEB_URL), "release/\u30ea\u30ea\u30fc\u30b9"),
        ),
        (
            "combining-marks-path",
            # NFC "e-acute" and NFD "e + combining acute" are different strings
            # and must stay different digests: the digest is over bytes, not
            # over a normalisation nobody applied.
            Project("web", (), LocalPathSource(path="/srv/caf\u00e9"), "main"),
        ),
        (
            "combining-marks-path-decomposed",
            Project("web", (), LocalPathSource(path="/srv/cafe\u0301"), "main"),
        ),
        # -- beyond what the validator admits --------------------------------
        (
            "escapes-in-path",
            # The whole of Python's ESCAPE_DCT plus a representative other C0
            # control, plus the two characters JSON always escapes.
            Project(
                "web",
                (),
                LocalPathSource(path='/srv/\b\t\n\f\r\x00\x1f"\\'),
                "main",
            ),
        ),
        (
            "del-and-c1-in-path",
            # U+007F is NOT escaped by either encoder, and U+0085 is a C1
            # control that neither treats specially. Both are places a
            # "hardened" encoder is tempted to differ from CPython.
            Project("web", (), LocalPathSource(path="/srv/\x7f\x85"), "main"),
        ),
        (
            "line-and-paragraph-separator-in-path",
            # U+2028/U+2029 are legal raw in JSON and are left raw by both.
            Project("web", (), LocalPathSource(path="/srv/\u2028\u2029"), "main"),
        ),
        (
            "alias-sort-crosses-the-surrogate-boundary",
            # The case UTF-16 ordering gets wrong. By code point,
            # U+FFFD < U+10000; by UTF-16 code unit the astral character begins
            # 0xD800, which sorts BELOW 0xFFFD. Python sorts by code point, and
            # JavaScript's default `Array.prototype.sort` does not.
            Project(
                "web",
                ("\ufffd", "\U00010000", "a"),
                GitUrlSource(url=WEB_URL),
                "main",
            ),
        ),
        (
            "alias-sort-is-not-length-first",
            # A prefix sorts before the longer string it prefixes, and neither
            # side may shortcut on length.
            Project("web", ("ab", "a", "aa", "b"), GitUrlSource(url=WEB_URL), "main"),
        ),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Dump the CPython side of the config_digest differential oracle. "
            "Writes a JSON vector the TypeScript suite compares against."
        )
    )
    parser.add_argument("output", type=Path, help="path of the JSON vector to write")
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "do not write; regenerate and exit non-zero if the committed vector's cases "
            "differ. This is the CI form: a vector that no longer matches what CPython "
            "says is a vector the TypeScript suite is comparing against a fossil."
        ),
    )
    arguments = parser.parse_args()

    cases = []
    for case_id, project in corpus():
        encoded = json.dumps(
            canonical_payload(project),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        cases.append(
            {
                "id": case_id,
                "canonical_json": encoded.decode("utf-8"),
                "canonical_bytes_hex": encoded.hex(),
                "digest": config_digest(project),
            }
        )

    if arguments.check:
        # `cases` only, deliberately. `python_version` records the interpreter
        # that generated the committed vector and is expected to differ from
        # whichever interpreter CI happens to run; comparing the whole document
        # would turn a Python upgrade into a red gate with no divergence behind
        # it. What must not drift is what CPython SAYS, which is `cases`.
        committed = json.loads(arguments.output.read_text(encoding="utf-8"))
        if committed.get("cases") == cases and committed.get("case_count") == len(cases):
            print(f"vector is current ({len(cases)} cases)")
            return 0
        print(
            f"vector is stale: {arguments.output} does not match what this interpreter "
            f"produces. Regenerate it with the same command without --check.",
            file=sys.stderr,
        )
        committed_ids = [case.get("id") for case in committed.get("cases", [])]
        current_ids = [case["id"] for case in cases]
        if committed_ids != current_ids:
            print(f"  committed ids: {committed_ids}", file=sys.stderr)
            print(f"  current ids:   {current_ids}", file=sys.stderr)
        else:
            for committed_case, current_case in zip(committed["cases"], cases, strict=True):
                if committed_case != current_case:
                    print(f"  first differing case: {current_case['id']}", file=sys.stderr)
                    break
        return 1

    document = {
        "generated_by": "scripts/oracle/dump_config_digest.py",
        "source_revision": "the working tree at generation time; see docs/porting.md section 4",
        "python_version": ".".join(str(part) for part in sys.version_info[:3]),
        "case_count": len(cases),
        "cases": cases,
    }
    # ensure_ascii=True for the VECTOR FILE itself, which is a different
    # question from the encoding under test: the file has to survive a cp932
    # console, a diff viewer and a Windows checkout unchanged, and every
    # non-ASCII character it carries is recoverable from its escape.
    arguments.output.write_text(
        json.dumps(document, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(cases)} cases to {arguments.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
