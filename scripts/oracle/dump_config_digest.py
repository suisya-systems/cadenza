"""The CPython half of the config_digest differential oracle.

``config_digest`` is a *persisted* value (design doc section 4): a run records
it, and a later audit reads a changed digest as "the catalog moved underneath a
run that already happened". A digest that changed because the implementation
language changed would make every pre-port run look like that.

So the claim this oracle makes is narrower and harder than any ported test's:

    given the same project, the bytes CPython encodes and the bytes Node encodes
    are the same bytes, and therefore the digests are the same string.

**Why this file outlived the implementation it was written beside.** Until
``DECISIONS.md`` D-0032 it imported ``cadenza.domain.digest`` from ``src/``, and
retiring the Python G1 would ordinarily have retired it too. It did not, because
what this oracle actually questions is not cadenza's Python -- it is
**CPython's**. ``json.dumps`` under ``sort_keys=True`` and
``ensure_ascii=False``, Python's code-point collation, and ``hashlib.sha256``
are the three things ``src/domain/canonical-json.ts`` had to reimplement by
hand, and all three are still here, still maintained by someone else, and still
able to move under a Python upgrade. That is a live difference worth re-deriving
on every CI run, so the generator was rewritten to stand alone instead: it
imports nothing but the standard library, and the forty lines below restate the
payload shape and the digest rule directly.

That rewrite has a cost, stated plainly: the payload shape below is now a
*transcription* of what ``canonical_payload`` used to compute, not a call into
it, so a change to the TypeScript payload shape would have to be mirrored here
by hand or the oracle would compare the wrong thing. The corpus's id list is
what catches that -- see below -- and ``test/domain/digest.test.ts`` pins the
shape on the TypeScript side.

The corpus is built **independently on each side**: this file states it in
Python and ``test/oracle/digest-corpus.ts`` states it in TypeScript, and the
comparison checks that the ids line up before it compares anything else. Reading
the inputs out of the vector instead would let a wrong corpus agree with itself.

Run, from the repository root:

    PYTHONDONTWRITEBYTECODE=1 python3 scripts/oracle/dump_config_digest.py \
        parity/oracle/config-digest-vector.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

WEB_URL = "https://example.invalid/org/web.git"


# -- the three source shapes, restated ------------------------------------
#
# These were `GitUrlSource`, `LocalPathSource` and `NewRepositorySource`, and
# each function returns exactly what that class's `to_canonical()` returned.
# The tagged union is the whole of the shape: `kind` names the member, and the
# member's one field follows it. `new` carries no field, which is why the
# payload can differ in its KEYS and not merely in its values -- the case
# `new-repository` below is in the corpus for that.


def git_url(url: str) -> dict[str, str]:
    return {"kind": "git_url", "url": url}


def local_path(path: str) -> dict[str, str]:
    return {"kind": "local_path", "path": path}


def new_repository() -> dict[str, str]:
    return {"kind": "new"}


def canonical_payload(
    project_id: str,
    aliases: tuple[str, ...],
    source: dict[str, str],
    base_branch: str,
) -> dict[str, object]:
    """The semantics the digest covers, as ``cadenza.domain.digest`` computed it.

    Provenance and file paths are deliberately absent: moving a catalog file, or
    restating a field in a different layer, must not change what the digest says
    about the project.

    ``sorted(aliases)`` is load-bearing and is one of the two reasons the corpus
    below carries alias-ordering cases: Python sorts strings by code point, and
    JavaScript's default ``Array.prototype.sort`` sorts by UTF-16 code unit,
    which disagree above U+FFFF.
    """
    return {
        "project_id": project_id,
        "aliases": sorted(aliases),
        "source": source,
        "base_branch": base_branch,
    }


def config_digest(payload: dict[str, object]) -> tuple[bytes, str]:
    """Return the canonical bytes and the ``sha256:<hex>`` digest over them.

    Every keyword below is part of the claim, not a default worth trusting to
    stay put:

    * ``sort_keys=True``   -- keys are emitted in code-point order, not
      insertion order, so the payload's key order above is not load-bearing.
    * ``separators``       -- no whitespace anywhere; a pretty-printed encoding
      would hash differently.
    * ``ensure_ascii=False`` -- non-ASCII goes out as itself in UTF-8, NOT as a
      ``\\uXXXX`` escape. This is the single largest source of divergence
      between a hand-written encoder and CPython's, and most of the corpus
      exists to pin it.
    * ``allow_nan=False``  -- there are no floats in the payload; this refuses
      rather than emits the non-JSON ``NaN``/``Infinity`` tokens if one ever
      arrives.
    """
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return encoded, f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def corpus() -> list[tuple[str, dict[str, object]]]:
    """The vector's inputs, in a fixed order: ``(id, payload)``.

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
    aliases outside the identifier shape. The validators refuse both, so nothing
    in this group can reach the digest through a file. They are here anyway,
    because the digest is a plain function over a project and the validator is
    not part of it: a later belt that widens an input, or a caller that builds a
    project value directly, meets the encoder without meeting the validator. And
    the cost of finding an encoder divergence *then* is not one bad run -- it is
    that every digest already written is suspect.
    """
    return [
        # -- reachable through a catalog file --------------------------------
        ("ascii-git-url", canonical_payload("web", ("site", "frontend"), git_url(WEB_URL), "main")),
        ("no-aliases", canonical_payload("web", (), git_url(WEB_URL), "main")),
        ("new-repository", canonical_payload("web", ("site",), new_repository(), "main")),
        ("local-path", canonical_payload("web", (), local_path("/srv/web"), "main")),
        (
            "non-ascii-path",
            canonical_payload("web", (), local_path("/srv/\u65e5\u672c\u8a9e"), "main"),
        ),
        (
            "astral-path",
            canonical_payload("web", (), local_path("/srv/\U0001d54c\U0001f600"), "main"),
        ),
        (
            "idn-host-url",
            canonical_payload(
                "web", (), git_url("https://\u4f8b.invalid/org/web.git"), "main"
            ),
        ),
        (
            "non-ascii-base-branch",
            canonical_payload(
                "web", (), git_url(WEB_URL), "release/\u30ea\u30ea\u30fc\u30b9"
            ),
        ),
        (
            "combining-marks-path",
            # NFC "e-acute" and NFD "e + combining acute" are different strings
            # and must stay different digests: the digest is over bytes, not
            # over a normalisation nobody applied.
            canonical_payload("web", (), local_path("/srv/caf\u00e9"), "main"),
        ),
        (
            "combining-marks-path-decomposed",
            canonical_payload("web", (), local_path("/srv/cafe\u0301"), "main"),
        ),
        # -- beyond what the validator admits --------------------------------
        (
            "escapes-in-path",
            # The whole of Python's ESCAPE_DCT plus a representative other C0
            # control, plus the two characters JSON always escapes.
            canonical_payload("web", (), local_path('/srv/\b\t\n\f\r\x00\x1f"\\'), "main"),
        ),
        (
            "del-and-c1-in-path",
            # U+007F is NOT escaped by either encoder, and U+0085 is a C1
            # control that neither treats specially. Both are places a
            # "hardened" encoder is tempted to differ from CPython.
            canonical_payload("web", (), local_path("/srv/\x7f\x85"), "main"),
        ),
        (
            "line-and-paragraph-separator-in-path",
            # U+2028/U+2029 are legal raw in JSON and are left raw by both.
            canonical_payload("web", (), local_path("/srv/\u2028\u2029"), "main"),
        ),
        (
            "alias-sort-crosses-the-surrogate-boundary",
            # The case UTF-16 ordering gets wrong. By code point,
            # U+FFFD < U+10000; by UTF-16 code unit the astral character begins
            # 0xD800, which sorts BELOW 0xFFFD. Python sorts by code point, and
            # JavaScript's default `Array.prototype.sort` does not.
            canonical_payload(
                "web", ("\ufffd", "\U00010000", "a"), git_url(WEB_URL), "main"
            ),
        ),
        (
            "alias-sort-is-not-length-first",
            # A prefix sorts before the longer string it prefixes, and neither
            # side may shortcut on length.
            canonical_payload("web", ("ab", "a", "aa", "b"), git_url(WEB_URL), "main"),
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
    for case_id, payload in corpus():
        encoded, digest = config_digest(payload)
        cases.append(
            {
                "id": case_id,
                "canonical_json": encoded.decode("utf-8"),
                "canonical_bytes_hex": encoded.hex(),
                "digest": digest,
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
