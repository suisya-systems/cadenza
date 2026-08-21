"""Resolution: a typed name to the snapshot a run persists (design section 6)."""

from __future__ import annotations

import pytest

from cadenza.application.compose import Catalog, compose_catalog
from cadenza.application.resolve import resolve_project
from cadenza.domain.clone_source import GitUrlSource
from cadenza.domain.digest import config_digest
from cadenza.domain.errors import CadenzaError, CatalogError, ProjectNotFoundError
from cadenza.domain.project import FieldOrigin
from support import LOCAL_ORIGIN, TRACKED_ORIGIN, git_url_project, make_layer


def catalog_of(*, aliases: list[str] | None = None) -> Catalog:
    tracked = make_layer(
        {
            "schema_version": 1,
            "project": {
                "web": git_url_project(aliases=aliases if aliases is not None else ["site"]),
                "api": git_url_project(url="https://example.invalid/org/api.git"),
            },
        }
    )
    return compose_catalog([tracked])


def test_resolves_by_project_id() -> None:
    resolved = resolve_project(catalog_of(), "web")
    assert resolved.project_id == "web"
    assert resolved.source == GitUrlSource(url="https://example.invalid/org/repo.git")
    assert resolved.base_branch == "main"


def test_resolves_by_alias_to_the_same_immutable_identity() -> None:
    catalog = catalog_of(aliases=["site", "frontend"])
    assert resolve_project(catalog, "site") == resolve_project(catalog, "web")
    assert resolve_project(catalog, "frontend").project_id == "web"


def test_aliases_travel_with_the_snapshot_as_information() -> None:
    resolved = resolve_project(catalog_of(aliases=["site", "frontend"]), "site")
    assert resolved.aliases == ("site", "frontend")


def test_snapshot_carries_the_config_digest() -> None:
    catalog = catalog_of()
    resolved = resolve_project(catalog, "web")
    assert resolved.config_digest == config_digest(catalog.projects["web"])
    assert resolved.config_digest.startswith("sha256:")


def test_snapshot_carries_per_field_provenance() -> None:
    catalog = compose_catalog(
        [
            make_layer({"schema_version": 1, "project": {"web": git_url_project()}}),
            make_layer(
                {"schema_version": 1, "project": {"web": {"base_branch": "develop"}}},
                layer="local",
            ),
        ]
    )
    resolved = resolve_project(catalog, "web")
    assert resolved.provenance["base_branch"] == FieldOrigin(layer="local", file=LOCAL_ORIGIN)
    assert resolved.provenance["source"] == FieldOrigin(layer="tracked", file=TRACKED_ORIGIN)


def test_an_unknown_name_is_refused_with_the_closest_candidates() -> None:
    with pytest.raises(ProjectNotFoundError, match="no project is named 'wbe'") as caught:
        resolve_project(catalog_of(), "wbe")
    assert "web" in str(caught.value)


def test_an_unrelated_name_is_refused_without_inventing_a_candidate() -> None:
    with pytest.raises(ProjectNotFoundError) as caught:
        resolve_project(catalog_of(), "zzzzzzzz")
    assert "Closest known names" not in str(caught.value)


def test_a_tombstoned_project_no_longer_resolves() -> None:
    catalog = compose_catalog(
        [
            make_layer({"schema_version": 1, "project": {"web": git_url_project()}}),
            make_layer(
                {"schema_version": 1, "project": {"web": {"tombstone": True}}}, layer="local"
            ),
        ]
    )
    with pytest.raises(ProjectNotFoundError):
        resolve_project(catalog, "web")


def test_not_found_is_not_a_catalog_error() -> None:
    # The catalog is fine; the typed name is not. A caller distinguishing "your
    # catalog is broken" from "no such project" needs these apart.
    assert issubclass(ProjectNotFoundError, CadenzaError)
    assert not issubclass(ProjectNotFoundError, CatalogError)
