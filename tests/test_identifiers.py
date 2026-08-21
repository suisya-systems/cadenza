"""Identifier shape (design doc section 2): one rule for project_id and alias."""

from __future__ import annotations

import pytest

from cadenza.domain.errors import CatalogError, InvalidIdentifierError
from cadenza.domain.identifiers import IDENTIFIER_PATTERN, parse_identifier


@pytest.mark.parametrize(
    "value",
    [
        "a",
        "web",
        "web-app",
        "web_app",
        "web2",
        "a" + "b" * 63,  # 64 characters: the documented maximum
    ],
)
def test_accepts_lowercase_identifier_shapes(value: str) -> None:
    assert parse_identifier(value, field="project_id") == value


@pytest.mark.parametrize(
    "value",
    [
        "",
        "Web",  # uppercase
        "1web",  # leading digit
        "-web",  # leading hyphen
        "_web",  # leading underscore
        "web app",
        "web.app",
        "web/app",
        "web:app",
        "web\u00e9",  # non-ascii
        "a" + "b" * 64,  # 65 characters
    ],
)
def test_refuses_identifiers_outside_the_shape(value: str) -> None:
    with pytest.raises(InvalidIdentifierError, match="is not a valid identifier"):
        parse_identifier(value, field="project_id")


def test_refuses_a_trailing_newline() -> None:
    # The pattern ends in \Z rather than $, which would match before a newline
    # and let "web\n" become a project_id that no operator can type.
    with pytest.raises(InvalidIdentifierError):
        parse_identifier("web\n", field="project_id")
    assert IDENTIFIER_PATTERN.match("web\n") is None


@pytest.mark.parametrize("value", [123, None, True, ["web"], {"web": 1}])
def test_refuses_non_string_values_naming_the_type(value: object) -> None:
    with pytest.raises(InvalidIdentifierError, match="must be a string, got"):
        parse_identifier(value, field="alias")


def test_error_names_the_field_and_the_location() -> None:
    with pytest.raises(InvalidIdentifierError) as caught:
        parse_identifier("Web", field="alias", location="config/projects.toml: project.web")
    assert caught.value.location == "config/projects.toml: project.web"
    assert "alias" in str(caught.value)
    assert str(caught.value).endswith("(at config/projects.toml: project.web)")


def test_identifier_error_is_a_catalog_error() -> None:
    # Section 7: every refusal is typed and reachable through one base class.
    assert issubclass(InvalidIdentifierError, CatalogError)
