"""Composition of ordered layer documents (design doc section 5)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from cadenza.application.compose import SUPPORTED_SCHEMA_VERSIONS, compose_catalog
from cadenza.domain.clone_source import GitUrlSource, LocalPathSource, NewRepositorySource
from cadenza.domain.errors import (
    CatalogError,
    InvalidCloneSourceError,
    InvalidIdentifierError,
    MissingFieldError,
    NameCollisionError,
    SchemaVersionError,
    TombstoneError,
    UnknownFieldError,
)
from cadenza.domain.project import FieldOrigin
from support import LOCAL_ORIGIN, TRACKED_ORIGIN, git_url_project, make_layer


def tracked(projects: dict[str, Any], **top: Any) -> Any:
    return make_layer({"schema_version": 1, "project": projects, **top})


def local(projects: dict[str, Any], **top: Any) -> Any:
    return make_layer({"schema_version": 1, "project": projects, **top}, layer="local")


# --- the happy path -------------------------------------------------------


def test_single_layer_yields_a_project_keyed_by_its_id() -> None:
    catalog = compose_catalog([tracked({"web": git_url_project(base_branch="trunk")})])
    project = catalog.projects["web"]
    assert project.project_id == "web"
    assert project.base_branch == "trunk"
    assert project.source == GitUrlSource(url="https://example.invalid/org/repo.git")
    assert catalog.names == {"web": "web"}


def test_aliases_and_id_share_one_flat_namespace() -> None:
    catalog = compose_catalog([tracked({"web": git_url_project(aliases=["site", "frontend"])})])
    assert catalog.names == {"web": "web", "site": "web", "frontend": "web"}
    assert catalog.projects["web"].aliases == ("site", "frontend")


def test_empty_document_set_yields_an_empty_catalog() -> None:
    catalog = compose_catalog([])
    assert catalog.projects == {}
    assert catalog.names == {}


def test_supported_schema_versions_is_exactly_one() -> None:
    assert frozenset({1}) == SUPPORTED_SCHEMA_VERSIONS


# --- section 5.3: field-level merge --------------------------------------


def test_local_layer_replaces_only_the_fields_it_states() -> None:
    catalog = compose_catalog(
        [
            tracked({"web": git_url_project(aliases=["site"])}),
            local({"web": {"base_branch": "develop"}}),
        ]
    )
    project = catalog.projects["web"]
    assert project.base_branch == "develop"
    assert project.source == GitUrlSource(url="https://example.invalid/org/repo.git")
    assert project.aliases == ("site",)


def test_provenance_names_the_layer_and_file_of_each_field() -> None:
    catalog = compose_catalog(
        [
            tracked({"web": git_url_project(aliases=["site"])}),
            local({"web": {"base_branch": "develop"}}),
        ]
    )
    provenance = catalog.provenance["web"]
    assert provenance["source"] == FieldOrigin(layer="tracked", file=TRACKED_ORIGIN)
    assert provenance["aliases"] == FieldOrigin(layer="tracked", file=TRACKED_ORIGIN)
    assert provenance["base_branch"] == FieldOrigin(layer="local", file=LOCAL_ORIGIN)
    assert provenance["project_id"] == FieldOrigin(layer="tracked", file=TRACKED_ORIGIN)


def test_source_replaces_whole_rather_than_field_wise() -> None:
    catalog = compose_catalog(
        [tracked({"web": git_url_project()}), local({"web": {"source": {"kind": "new"}}})]
    )
    assert catalog.projects["web"].source == NewRepositorySource()


def test_a_partial_source_override_is_refused_instead_of_inheriting_a_kind() -> None:
    # Field-wise merge of a tagged union would produce a shape nobody wrote:
    # a tracked kind = "git_url" wearing a local 'path'.
    with pytest.raises(MissingFieldError, match="requires the key 'kind'"):
        compose_catalog(
            [tracked({"web": git_url_project()}), local({"web": {"source": {"path": "/srv/web"}}})]
        )


def test_aliases_replace_whole_so_an_alias_can_be_removed() -> None:
    catalog = compose_catalog(
        [
            tracked({"web": git_url_project(aliases=["site", "frontend"])}),
            local({"web": {"aliases": ["site"]}}),
        ]
    )
    assert catalog.projects["web"].aliases == ("site",)
    assert "frontend" not in catalog.names


def test_local_layer_may_introduce_a_project_the_tracked_layer_does_not_have() -> None:
    catalog = compose_catalog(
        [tracked({"web": git_url_project()}), local({"scratch": git_url_project()})]
    )
    assert set(catalog.projects) == {"web", "scratch"}
    assert catalog.provenance["scratch"]["project_id"].layer == "local"


def test_aliases_must_be_a_list_of_identifiers() -> None:
    with pytest.raises(CatalogError, match="'aliases' must be a list"):
        compose_catalog([tracked({"web": git_url_project(aliases="site")})])


def test_the_same_alias_listed_twice_is_refused() -> None:
    with pytest.raises(NameCollisionError, match="listed twice"):
        compose_catalog([tracked({"web": git_url_project(aliases=["site", "site"])})])


# --- section 5.2: schema version ------------------------------------------


def test_missing_schema_version_is_refused_naming_the_file() -> None:
    with pytest.raises(SchemaVersionError, match="'schema_version' is required") as caught:
        compose_catalog([make_layer({"project": {"web": git_url_project()}})])
    assert caught.value.location == TRACKED_ORIGIN


@pytest.mark.parametrize("version", ["1", 1.0, None, [1]])
def test_non_integer_schema_version_is_refused(version: object) -> None:
    with pytest.raises(SchemaVersionError, match="must be an integer"):
        compose_catalog([make_layer({"schema_version": version, "project": {}})])


def test_boolean_schema_version_is_refused_although_bool_is_an_int() -> None:
    with pytest.raises(SchemaVersionError, match="must be an integer"):
        compose_catalog([make_layer({"schema_version": True, "project": {}})])


def test_unsupported_schema_version_is_refused_naming_the_file() -> None:
    # Refusing beats guessing: a newer file read by an older cadenza would
    # otherwise resolve to something plausible and wrong.
    with pytest.raises(SchemaVersionError, match="schema_version 2 is not supported") as caught:
        compose_catalog([make_layer({"schema_version": 2, "project": {}}, layer="local")])
    assert caught.value.location == LOCAL_ORIGIN


def test_each_layer_carries_its_own_schema_version() -> None:
    with pytest.raises(SchemaVersionError, match="'schema_version' is required") as caught:
        compose_catalog([tracked({"web": git_url_project()}), make_layer({}, layer="local")])
    assert caught.value.location == LOCAL_ORIGIN


# --- section 5.6: closed tables -------------------------------------------


def test_unknown_top_level_key_is_refused() -> None:
    with pytest.raises(UnknownFieldError, match="unknown key 'projects'") as caught:
        compose_catalog([make_layer({"schema_version": 1, "projects": {}})])
    assert caught.value.location == TRACKED_ORIGIN


def test_unknown_catalog_key_is_refused() -> None:
    with pytest.raises(UnknownFieldError, match="unknown key 'allowed_roots'") as caught:
        compose_catalog(
            [make_layer({"schema_version": 1, "catalog": {"allowed_roots": ["~/work"]}})]
        )
    assert caught.value.location == f"{TRACKED_ORIGIN}: catalog"


def test_unknown_project_key_is_refused_naming_the_key_and_the_project() -> None:
    # The typo this catalog exists to prevent.
    table = git_url_project()
    table["base_brnach"] = "main"
    with pytest.raises(UnknownFieldError, match="unknown key 'base_brnach'") as caught:
        compose_catalog([tracked({"web": table})])
    assert caught.value.location == f"{TRACKED_ORIGIN}: project.web"


def test_unknown_source_key_is_refused_naming_the_source_table() -> None:
    table = git_url_project()
    table["source"]["depth"] = 1
    with pytest.raises(UnknownFieldError, match="'depth'") as caught:
        compose_catalog([tracked({"web": table})])
    assert caught.value.location == f"{TRACKED_ORIGIN}: project.web.source"


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ({"schema_version": 1, "project": []}, "'project' must be a table"),
        ({"schema_version": 1, "catalog": []}, "'catalog' must be a table"),
        ({"schema_version": 1, "project": {"web": []}}, "must be a table"),
        (
            {"schema_version": 1, "project": {"web": {"source": []}}},
            "'source' must be a table",
        ),
        (
            {"schema_version": 1, "catalog": {"allowed_local_roots": "~/work"}},
            "must be a list of strings",
        ),
    ],
)
def test_wrongly_shaped_tables_are_refused(data: dict[str, Any], expected: str) -> None:
    with pytest.raises(CatalogError, match=expected):
        compose_catalog([make_layer(data)])


# --- required fields ------------------------------------------------------


@pytest.mark.parametrize(
    ("table", "expected"),
    [
        ({"base_branch": "main"}, "has no source"),
        ({"source": {"kind": "new"}}, "has no base_branch"),
        ({}, "has no source"),
    ],
)
def test_a_project_missing_a_required_field_is_refused(
    table: dict[str, Any], expected: str
) -> None:
    with pytest.raises(MissingFieldError, match=expected) as caught:
        compose_catalog([tracked({"web": table})])
    assert caught.value.location == TRACKED_ORIGIN


def test_a_field_may_be_supplied_by_either_layer() -> None:
    catalog = compose_catalog(
        [tracked({"web": {"source": {"kind": "new"}}}), local({"web": {"base_branch": "main"}})]
    )
    assert catalog.projects["web"].base_branch == "main"


# --- section 5.5: tombstones ---------------------------------------------


def test_tombstone_removes_a_tracked_project_and_its_names() -> None:
    catalog = compose_catalog(
        [
            tracked({"web": git_url_project(aliases=["site"]), "api": git_url_project()}),
            local({"web": {"tombstone": True}}),
        ]
    )
    assert set(catalog.projects) == {"api"}
    assert "site" not in catalog.names


def test_a_tombstone_carrying_a_sibling_field_is_refused() -> None:
    # It reads as both "delete this" and "and configure it".
    with pytest.raises(TombstoneError, match="must carry no other field") as caught:
        compose_catalog(
            [
                tracked({"web": git_url_project()}),
                local({"web": {"tombstone": True, "base_branch": "develop"}}),
            ]
        )
    assert caught.value.location == f"{LOCAL_ORIGIN}: project.web"


def test_a_tombstone_naming_an_unknown_project_is_refused() -> None:
    # A stale or typo'd tombstone accepted silently makes the next typo silent too.
    with pytest.raises(TombstoneError, match="which no earlier layer defines"):
        compose_catalog([tracked({"web": git_url_project()}), local({"wbe": {"tombstone": True}})])


@pytest.mark.parametrize("value", ["true", 1, None])
def test_a_non_boolean_tombstone_is_refused(value: object) -> None:
    with pytest.raises(TombstoneError, match="must be a boolean"):
        compose_catalog([tracked({"web": git_url_project()}), local({"web": {"tombstone": value}})])


def test_tombstone_false_is_refused_rather_than_read_as_keep() -> None:
    with pytest.raises(TombstoneError, match="only meaningful as true"):
        compose_catalog([tracked({"web": git_url_project()}), local({"web": {"tombstone": False}})])


# --- section 3.3: allowed_local_roots does not merge ----------------------


def test_a_local_path_is_checked_against_its_own_layers_roots(tmp_path: Path) -> None:
    document = make_layer(
        {
            "schema_version": 1,
            "catalog": {"allowed_local_roots": [str(tmp_path)]},
            "project": {
                "web": {
                    "source": {"kind": "local_path", "path": "web"},
                    "base_branch": "main",
                }
            },
        },
        base_dir=tmp_path,
    )
    catalog = compose_catalog([document])
    assert catalog.projects["web"].source == LocalPathSource(path=str(tmp_path / "web"))


def test_a_tracked_layers_roots_do_not_authorise_a_local_layers_path(tmp_path: Path) -> None:
    # A file shared by everyone must not authorise a directory on one operator's
    # machine, so the local layer gets no benefit from the tracked roots.
    tracked_document = make_layer(
        {
            "schema_version": 1,
            "catalog": {"allowed_local_roots": [str(tmp_path)]},
            "project": {"web": git_url_project()},
        },
        base_dir=tmp_path,
    )
    local_document = make_layer(
        {
            "schema_version": 1,
            "project": {"web": {"source": {"kind": "local_path", "path": str(tmp_path / "web")}}},
        },
        layer="local",
        base_dir=tmp_path,
    )
    with pytest.raises(InvalidCloneSourceError, match="allowed_local_roots"):
        compose_catalog([tracked_document, local_document])


def test_a_local_layers_roots_do_not_authorise_a_tracked_layers_path(tmp_path: Path) -> None:
    tracked_document = make_layer(
        {
            "schema_version": 1,
            "project": {"web": {"source": {"kind": "local_path", "path": str(tmp_path / "web")}}},
        },
        base_dir=tmp_path,
    )
    local_document = make_layer(
        {"schema_version": 1, "catalog": {"allowed_local_roots": [str(tmp_path)]}, "project": {}},
        layer="local",
        base_dir=tmp_path,
    )
    with pytest.raises(InvalidCloneSourceError, match="allowed_local_roots"):
        compose_catalog([tracked_document, local_document])


# --- section 5.4: names collide -> refuse ---------------------------------


def test_an_alias_colliding_with_another_projects_id_is_refused() -> None:
    with pytest.raises(NameCollisionError, match="name 'web' is claimed by project"):
        compose_catalog(
            [tracked({"web": git_url_project(), "api": git_url_project(aliases=["web"])})]
        )


def test_two_projects_claiming_the_same_alias_are_refused_naming_both() -> None:
    with pytest.raises(NameCollisionError) as caught:
        compose_catalog(
            [
                tracked(
                    {
                        "web": git_url_project(aliases=["site"]),
                        "api": git_url_project(aliases=["site"]),
                    }
                )
            ]
        )
    message = str(caught.value)
    assert "'web'" in message and "'api'" in message and "'site'" in message


def test_a_collision_across_layers_is_refused_naming_the_layers() -> None:
    with pytest.raises(NameCollisionError, match="local") as caught:
        compose_catalog(
            [tracked({"web": git_url_project()}), local({"api": git_url_project(aliases=["web"])})]
        )
    assert "tracked" in str(caught.value)


def test_the_same_project_id_in_two_layers_merges_rather_than_colliding() -> None:
    # Two *distinct* ids cannot collide: a project_id is a table key, unique per
    # file by construction. Restating one across layers is the merge of 5.3, and
    # is the case that must not be mistaken for a collision.
    catalog = compose_catalog(
        [tracked({"web": git_url_project()}), local({"web": {"base_branch": "develop"}})]
    )
    assert set(catalog.projects) == {"web"}


def test_a_tombstoned_projects_name_is_free_for_another_project() -> None:
    catalog = compose_catalog(
        [
            tracked({"web": git_url_project(aliases=["site"])}),
            local({"web": {"tombstone": True}, "api": git_url_project(aliases=["site"])}),
        ]
    )
    assert catalog.names["site"] == "api"


def test_a_project_id_that_is_not_an_identifier_is_refused() -> None:
    with pytest.raises(InvalidIdentifierError, match="project_id"):
        compose_catalog([tracked({"Web": git_url_project()})])


# --- the composed catalog is not a mutable view ---------------------------


def test_the_composed_mappings_cannot_be_mutated_by_a_caller() -> None:
    catalog = compose_catalog([tracked({"web": git_url_project()})])
    with pytest.raises(TypeError):
        catalog.projects["api"] = catalog.projects["web"]  # type: ignore[index]
    with pytest.raises(TypeError):
        catalog.names["api"] = "web"  # type: ignore[index]
