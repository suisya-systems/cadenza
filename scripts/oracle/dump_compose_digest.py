"""The Python half of the composition differential oracle.

The first face of the oracle (``dump_config_digest.py``) questions the encoder:
given the same ``Project``, do CPython and Node produce the same bytes? This
second face questions everything **upstream** of it. A ``Project`` does not
arrive from nowhere -- it is composed from ordered layer documents, merged field
by field, tombstoned, aliased, and finally resolved -- and every one of those
steps feeds the value the encoder then hashes.

The claim:

    given the same layer documents, the ``config_digest`` CPython's
    ``resolve_project`` produces and the one Node's ``resolveProject`` produces
    are the same string.

A ported test cannot make it. ``tests/test_compose.py`` asserts *which* project
comes out and *which* refusals fire; it asserts almost nothing about the exact
strings that reach the digest, because in Python those are right by
construction. The port had to rebuild that construction -- alias ordering, the
merge order across layers, `sorted()` under a non-ASCII collation -- in a
language whose defaults differ, and `config_digest` is **persisted**: a
divergence here does not surface as a red test. It surfaces as an audit
reporting that a catalog moved when it did not, on every run recorded before the
port.

**What is deliberately not in the corpus.** Refusal *messages*, the closest-name
suggestions ``difflib`` produces, and ``local_path`` sources. The first two are
displayed, not persisted, so a divergence in them costs a confusing sentence
rather than a suspect digest -- and the ledger's brief for this face is the
persisted value. ``local_path`` is excluded for a harder reason: its normalised
form is **platform-dependent** (``os.path`` is ``ntpath`` on Windows), so a
committed vector would be a statement about the machine that generated it and
would fail the Windows cell for being right. The port's ``os.path``/``pathlib``
reimplementation is pinned instead by ``test/domain/python-path.test.ts``, which
checks *both* flavours on every platform -- stronger coverage than a
single-platform vector could give.

The corpus is built **independently on each side**: this file states it in
Python and ``test/oracle/compose-corpus.ts`` states it in TypeScript, and the
comparison checks that the ids line up before it compares anything else.

Run, from the repository root:

    PYTHONDONTWRITEBYTECODE=1 python3 scripts/oracle/dump_compose_digest.py \
        parity/oracle/compose-digest-vector.json

``--check`` regenerates without writing and fails if the committed vector's cases
have drifted. That is the form CI runs, and it is what stops the vector becoming
a fossil the TypeScript suite happily agrees with.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
# The oracle has to be runnable without installing the package: an installed
# copy is exactly the stale-install hazard CLAUDE.md's src-layout rule is about,
# and a vector generated from a stale install would be silently wrong.
sys.path.insert(0, str(ROOT / "src"))

from cadenza.application.compose import compose_catalog  # noqa: E402
from cadenza.application.resolve import resolve_project  # noqa: E402
from cadenza.ports.catalog_source import LayerDocument  # noqa: E402

WEB_URL = "https://example.invalid/org/web.git"

# Absolute because LayerDocument refuses a relative anchor, and POSIX-shaped
# because no case in this corpus states a local_path -- so the anchor is never
# read, and the vector stays the same artefact whichever platform generated it.
# The moment a local_path case is added, this stops being true; the module
# docstring says why one is not.
BASE_DIR = "/srv/catalog"
TRACKED_ORIGIN = "/srv/catalog/projects.toml"
LOCAL_ORIGIN = "/srv/catalog/projects.local.toml"


def git_url_project(url: str = WEB_URL, **extra: Any) -> dict[str, Any]:
    table: dict[str, Any] = {"source": {"kind": "git_url", "url": url}, "base_branch": "main"}
    table.update(extra)
    return table


def layer(data: dict[str, Any], layer_name: str = "tracked") -> LayerDocument:
    origin = TRACKED_ORIGIN if layer_name == "tracked" else LOCAL_ORIGIN
    return LayerDocument(layer=layer_name, origin=origin, base_dir=Path(BASE_DIR), data=data)


def tracked(projects: dict[str, Any]) -> LayerDocument:
    return layer({"schema_version": 1, "project": projects})


def local(projects: dict[str, Any]) -> LayerDocument:
    return layer({"schema_version": 1, "project": projects}, "local")


def corpus() -> list[tuple[str, list[LayerDocument], str]]:
    """The vector's inputs, in a fixed order: (id, documents, name to resolve).

    Each case is chosen for a step of composition that the digest can see, and
    that a ported test does not pin to an exact string.
    """
    return [
        # The baseline: nothing merged, nothing sorted, all ASCII.
        ("single-layer", [tracked({"web": git_url_project()})], "web"),
        # Aliases are SORTED into the payload, so their declared order must not
        # reach it. The port sorts with an explicit code-point comparator
        # because Array.prototype.sort does not.
        (
            "aliases-sorted-into-the-payload",
            [tracked({"web": git_url_project(aliases=["site", "frontend"])})],
            "web",
        ),
        # Sorting across ASCII punctuation, which the identifier shape does
        # admit: '-' (U+002D) < digits (U+0030..) < '_' (U+005F) < letters.
        # A sort that ordered these any other way would change the payload.
        (
            "aliases-sorted-across-punctuation",
            [tracked({"web": git_url_project(aliases=["z", "a_b", "a-b", "a0b"])})],
            "web",
        ),
        # NOTE on what is absent here. The first face of this oracle has a case
        # named `alias-sort-crosses-the-surrogate-boundary`, and there is no
        # counterpart below, because an alias like that CANNOT be composed:
        # `parse_identifier` admits `^[a-z][a-z0-9_-]{0,63}$` and nothing else,
        # so no astral character reaches an alias through a catalog file. That
        # is the same split the first face's corpus documents -- reachable
        # through a file, against beyond what the validator admits -- and it is
        # why the two faces are not redundant: this one runs the validator, and
        # that one deliberately runs past it.
        # A field-wise merge across layers: the digest must see the LOCAL branch.
        (
            "local-layer-overrides-base-branch",
            [
                tracked({"web": git_url_project(aliases=["site"])}),
                local({"web": {"base_branch": "develop"}}),
            ],
            "web",
        ),
        # source replaces whole, so the digest sees a different union member --
        # and a different payload SHAPE, not merely a different value.
        (
            "local-layer-replaces-the-source-whole",
            [
                tracked({"web": git_url_project()}),
                local({"web": {"source": {"kind": "new"}}}),
            ],
            "web",
        ),
        # aliases replace whole, so a removed alias must leave the payload.
        (
            "local-layer-removes-an-alias",
            [
                tracked({"web": git_url_project(aliases=["site", "frontend"])}),
                local({"web": {"aliases": ["site"]}}),
            ],
            "web",
        ),
        # Resolution by alias must produce the identical snapshot, digest
        # included: the alias is a way in, not a different project.
        (
            "resolved-by-alias",
            [tracked({"web": git_url_project(aliases=["site"])})],
            "site",
        ),
        # A non-ASCII base branch, which the ref validator admits and the
        # encoder must carry through unescaped (ensure_ascii=False).
        (
            "non-ascii-base-branch",
            [tracked({"web": git_url_project(base_branch="\u4e3b\u7dda")})],
            "web",
        ),
        # NFC against NFD: two spellings of one branch name are two different
        # configurations, because nothing normalises and nothing should.
        # Written as escapes, like every non-ASCII string in this corpus: spelled
        # as literals these two are a pair no reviewer can tell apart and no
        # editor promises to leave alone.
        (
            "base-branch-nfc",
            [tracked({"web": git_url_project(base_branch="caf\u00e9")})],
            "web",
        ),
        (
            "base-branch-nfd",
            [tracked({"web": git_url_project(base_branch="cafe\u0301")})],
            "web",
        ),
        # A tombstone in the local layer, with a SECOND project surviving: the
        # digest of the survivor must be untouched by the removal.
        (
            "survivor-of-a-tombstone",
            [
                tracked({"web": git_url_project(aliases=["site"]), "api": git_url_project()}),
                local({"web": {"tombstone": True}}),
            ],
            "api",
        ),
        # An IDN host, reachable through a catalog and stored verbatim: the URL
        # is hashed as written, never as a URL parser would rewrite it.
        (
            "idn-host",
            [tracked({"web": git_url_project(url="https://b\u00fccher.example/org/web.git")})],
            "web",
        ),
        # Two layers, one project, every field restated: provenance differs
        # between this case and "single-layer" and the digest must not.
        (
            "restated-in-both-layers",
            [
                tracked({"web": git_url_project()}),
                local({"web": git_url_project()}),
            ],
            "web",
        ),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Dump the CPython side of the composition differential oracle. "
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
    for case_id, documents, name in corpus():
        resolved = resolve_project(compose_catalog(documents), name)
        cases.append(
            {
                "id": case_id,
                "resolved_project_id": resolved.project_id,
                "aliases": list(resolved.aliases),
                "base_branch": resolved.base_branch,
                "source": resolved.source.to_canonical(),
                "digest": resolved.config_digest,
            }
        )

    if arguments.check:
        # `cases` only, deliberately, for the reason `dump_config_digest.py`
        # records: `python_version` names the interpreter that generated the
        # committed vector and is expected to differ from whichever one CI runs,
        # so comparing the whole document would turn a Python upgrade into a red
        # gate with no divergence behind it. What must not drift is what CPython
        # SAYS, which is `cases`.
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

    vector = {
        "generated_by": "scripts/oracle/dump_compose_digest.py",
        "python_version": platform.python_version(),
        "case_count": len(cases),
        "cases": cases,
    }
    text = json.dumps(vector, indent=2, ensure_ascii=False, allow_nan=False)
    arguments.output.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {len(cases)} cases to {arguments.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
