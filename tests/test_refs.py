"""base_branch ref rules (design doc section 3.2), one case per stated refusal."""

from __future__ import annotations

import pytest

from cadenza.domain.errors import InvalidBaseBranchError
from cadenza.domain.refs import parse_base_branch


@pytest.mark.parametrize(
    "value",
    [
        "main",
        "develop",
        "feature/g1-registry",
        "release-1.2.0",
        "v1.0",
        "a.b",  # a dot is fine as long as no component starts with one
    ],
)
def test_accepts_ordinary_branch_names(value: str) -> None:
    assert parse_base_branch(value) == value


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("", "must not be empty"),
        ("main branch", "whitespace or control characters"),
        ("main\tbranch", "whitespace or control characters"),
        ("main\nbranch", "whitespace or control characters"),
        ("main\x01", "whitespace or control characters"),
        ("main\x7f", "whitespace or control characters"),
        ("main~1", "must not contain any of"),
        ("main^", "must not contain any of"),
        ("refs:main", "must not contain any of"),
        ("main?", "must not contain any of"),
        ("main*", "must not contain any of"),
        ("main[0]", "must not contain any of"),
        ("main\\branch", "must not contain any of"),
        ("main..dev", r"must not contain '\.\.'"),
        ("main@{1}", "must not contain '@"),
        ("/main", "must not start or end with '/'"),
        ("main/", "must not start or end with '/'"),
        ("feature//x", "must not contain '//'"),
        ("-main", "would be read as an option"),
        (".main", "component beginning with"),
        ("feature/.hidden", "component beginning with"),
        ("main.lock", r"must not end with '\.lock'"),
        ("feature/x.lock", r"must not end with '\.lock'"),
    ],
)
def test_refuses_each_documented_ref_violation(value: str, expected: str) -> None:
    with pytest.raises(InvalidBaseBranchError, match=expected):
        parse_base_branch(value)


@pytest.mark.parametrize("value", [1, None, True, ["main"]])
def test_refuses_non_string_values_naming_the_type(value: object) -> None:
    with pytest.raises(InvalidBaseBranchError, match="must be a string, got"):
        parse_base_branch(value)


def test_error_carries_the_location_it_was_given() -> None:
    location = "config/projects.toml: project.web.base_branch"
    with pytest.raises(InvalidBaseBranchError) as caught:
        parse_base_branch("main..dev", location=location)
    assert caught.value.location == location
    assert str(caught.value).endswith(f"(at {location})")
