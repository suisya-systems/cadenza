"""config_digest: a fingerprint of configuration, not of where it was typed."""

from __future__ import annotations

import hashlib
import json
import re

import pytest

from cadenza.application.compose import compose_catalog
from cadenza.application.resolve import resolve_project
from cadenza.domain.clone_source import GitUrlSource, LocalPathSource, NewRepositorySource
from cadenza.domain.digest import canonical_payload, config_digest
from cadenza.domain.project import Project
from support import absolute, git_url_project, make_layer

BASE = Project(
    project_id="web",
    aliases=("site", "frontend"),
    source=GitUrlSource(url="https://example.invalid/org/web.git"),
    base_branch="main",
)


def test_digest_is_the_sha256_prefix_and_sixty_four_hex_characters() -> None:
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", config_digest(BASE))


def test_digest_matches_the_documented_encoding() -> None:
    # The dict here is written in a deliberately different key order from
    # canonical_payload's, which pins sort_keys rather than insertion order.
    encoded = json.dumps(
        {
            "base_branch": "main",
            "source": {"url": "https://example.invalid/org/web.git", "kind": "git_url"},
            "aliases": ["frontend", "site"],
            "project_id": "web",
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    assert config_digest(BASE) == f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def test_alias_order_does_not_change_the_digest() -> None:
    # Aliases are a display-only list; reordering one is not a configuration change.
    reordered = Project(
        project_id=BASE.project_id,
        aliases=("frontend", "site"),
        source=BASE.source,
        base_branch=BASE.base_branch,
    )
    assert config_digest(reordered) == config_digest(BASE)


def test_payload_excludes_provenance_and_file_paths() -> None:
    # Section 4: moving a catalog file must not change what the digest says.
    assert set(canonical_payload(BASE)) == {"project_id", "aliases", "source", "base_branch"}


@pytest.mark.parametrize(
    "changed",
    [
        Project("web2", BASE.aliases, BASE.source, BASE.base_branch),
        Project("web", ("site",), BASE.source, BASE.base_branch),
        Project("web", (), BASE.source, BASE.base_branch),
        Project("web", BASE.aliases, BASE.source, "develop"),
        Project(
            "web",
            BASE.aliases,
            GitUrlSource(url="https://example.invalid/org/other.git"),
            BASE.base_branch,
        ),
        Project("web", BASE.aliases, LocalPathSource(path="/srv/web"), BASE.base_branch),
        Project("web", BASE.aliases, NewRepositorySource(), BASE.base_branch),
    ],
)
def test_digest_changes_when_any_semantic_field_changes(changed: Project) -> None:
    assert config_digest(changed) != config_digest(BASE)


def test_two_source_kinds_that_share_a_string_value_do_not_share_a_digest() -> None:
    # The tag is part of the payload, so "same string, different kind" is a
    # different configuration rather than a collision.
    shared = "https://example.invalid/org/web.git"
    as_url = Project("web", (), GitUrlSource(url=shared), "main")
    as_path = Project("web", (), LocalPathSource(path=shared), "main")
    assert config_digest(as_url) != config_digest(as_path)


def test_digest_is_deterministic_across_calls() -> None:
    assert config_digest(BASE) == config_digest(BASE)


def test_digest_survives_the_catalog_moving_to_another_file() -> None:
    # Composed from two different files, in two different layers, with two
    # different base directories: same configuration, so same digest.
    data = {"schema_version": 1, "project": {"web": git_url_project()}}
    here = compose_catalog([make_layer(data)])
    elsewhere = compose_catalog(
        [
            make_layer(
                data,
                layer="local",
                origin=str(absolute("elsewhere", "projects.local.toml")),
                base_dir=absolute("elsewhere"),
            )
        ]
    )
    assert (
        resolve_project(here, "web").config_digest
        == resolve_project(elsewhere, "web").config_digest
    )
