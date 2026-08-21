"""The TOML adapter: files to raw layer documents (design section 5.1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from cadenza.adapters.toml_catalog.loader import (
    LOCAL_FILENAME,
    TRACKED_FILENAME,
    TomlCatalogSource,
)
from cadenza.application.compose import compose_catalog
from cadenza.domain.errors import CatalogError
from cadenza.ports.catalog_source import LayerDocument

TRACKED_TOML = """
schema_version = 1

[project.web]
base_branch = "main"

[project.web.source]
kind = "git_url"
url = "https://example.invalid/org/web.git"
"""

LOCAL_TOML = """
schema_version = 1

[project.web]
base_branch = "develop"
"""


def test_filenames_are_the_documented_ones() -> None:
    assert TRACKED_FILENAME == "projects.toml"
    assert LOCAL_FILENAME == "projects.local.toml"


def test_the_tracked_file_is_required_and_its_absence_names_the_path(tmp_path: Path) -> None:
    with pytest.raises(CatalogError, match="tracked catalog file not found") as caught:
        TomlCatalogSource(tmp_path).load()
    assert caught.value.location == str(tmp_path / TRACKED_FILENAME)


def test_the_local_file_is_optional(tmp_path: Path) -> None:
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    documents = TomlCatalogSource(tmp_path).load()
    assert [document.layer for document in documents] == ["tracked"]


def test_layers_are_returned_lowest_precedence_first(tmp_path: Path) -> None:
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    (tmp_path / LOCAL_FILENAME).write_text(LOCAL_TOML, encoding="utf-8")
    documents = TomlCatalogSource(tmp_path).load()
    assert [document.layer for document in documents] == ["tracked", "local"]


def test_each_document_carries_its_origin_and_base_dir(tmp_path: Path) -> None:
    # base_dir travels with the document because a relative local_path is
    # anchored to the directory of the file that declared it.
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    (tmp_path / LOCAL_FILENAME).write_text(LOCAL_TOML, encoding="utf-8")
    tracked, local = TomlCatalogSource(tmp_path).load()
    assert tracked.origin == str(tmp_path / TRACKED_FILENAME)
    assert local.origin == str(tmp_path / LOCAL_FILENAME)
    assert tracked.base_dir == tmp_path
    assert local.base_dir == tmp_path


def test_the_parsed_data_is_handed_over_unvalidated(tmp_path: Path) -> None:
    # The adapter parses; section 5 validates. Nothing here inspects the keys.
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    (document,) = TomlCatalogSource(tmp_path).load()
    assert document.data["schema_version"] == 1
    assert document.data["project"]["web"]["source"]["kind"] == "git_url"  # type: ignore[index]


@pytest.mark.parametrize("filename", [TRACKED_FILENAME, LOCAL_FILENAME])
def test_a_syntax_error_surfaces_as_a_catalog_error_naming_the_file(
    filename: str, tmp_path: Path
) -> None:
    # A raw decoder error names an offset and no file, which is useless when
    # two layers are in play.
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    (tmp_path / filename).write_text("schema_version = = 1\n", encoding="utf-8")
    with pytest.raises(CatalogError, match="invalid TOML") as caught:
        TomlCatalogSource(tmp_path).load()
    assert caught.value.location == str(tmp_path / filename)
    assert str(tmp_path / filename) in str(caught.value)


def test_a_directory_where_the_tracked_file_should_be_is_not_mistaken_for_one(
    tmp_path: Path,
) -> None:
    (tmp_path / TRACKED_FILENAME).mkdir()
    with pytest.raises(CatalogError, match="tracked catalog file not found"):
        TomlCatalogSource(tmp_path).load()


def test_the_repository_catalog_loads_and_composes() -> None:
    # The one end-to-end case: the file shipped in config/ is valid input.
    directory = Path(__file__).resolve().parent.parent / "config"
    catalog = compose_catalog(TomlCatalogSource(directory).load())
    assert catalog.projects


def test_a_relative_directory_still_yields_an_absolute_anchor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The adapter is the one component allowed to consult the CWD, and only to
    # find the files. What it hands on must already be absolute, so that no
    # local_path anchored to it can be re-anchored later (design section 3.1).
    (tmp_path / TRACKED_FILENAME).write_text(TRACKED_TOML, encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    documents = TomlCatalogSource(Path(".")).load()

    assert documents[0].base_dir.is_absolute()
    assert Path(documents[0].origin).is_absolute()


def test_layer_document_refuses_a_relative_base_dir() -> None:
    with pytest.raises(ValueError, match="base_dir must be absolute"):
        LayerDocument(layer="tracked", origin="projects.toml", base_dir=Path("config"), data={})


def test_the_shipped_tracked_catalog_composes() -> None:
    # The catalog this repository ships is documentation that runs. A README or
    # an example that cannot be loaded teaches the wrong rules confidently.
    catalog_dir = Path(__file__).resolve().parent.parent / "config"
    catalog = compose_catalog(TomlCatalogSource(catalog_dir).load())

    assert catalog.projects, "the tracked catalog defines no projects"
    for project_id, project in catalog.projects.items():
        assert project.base_branch
        assert project_id not in project.aliases, (
            f"{project_id!r} lists its own project_id as an alias, which collides"
        )
