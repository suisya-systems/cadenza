"""base_branch ref rules (design doc section 3.2), one case per stated refusal."""

from __future__ import annotations

import shutil
import subprocess

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


# --- parity with git itself -----------------------------------------------

GIT = shutil.which("git")

# Every shape the validator makes a decision about, plus the two Codex found.
# The point of the corpus is that git, not this file, says what the answer is.
PARITY_CORPUS = [
    "main",
    "feat/cadenza-bootstrap",
    "release-1.2",
    "a.b",
    "release.",
    "a.",
    "feat/x.",
    "x.lock",
    "feat/x.lock",
    ".hidden",
    "feat/.hidden",
    "a..b",
    "a b",
    "a~b",
    "a^b",
    "a:b",
    "a?b",
    "a*b",
    "a[b",
    "a\\b",
    "a@{b",
    "a//b",
    "/leading",
    "trailing/",
]


@pytest.mark.skipif(GIT is None, reason="git is not installed")
@pytest.mark.parametrize("name", PARITY_CORPUS)
def test_the_validator_refuses_everything_git_refuses(name: str) -> None:
    # The validator's whole job is to move a git-level refusal earlier, so being
    # *more* permissive than git is the one direction that is a defect: the
    # catalog would compose and the clone would fail. Being stricter is allowed
    # and is checked case by case above, not here.
    git_accepts = (
        subprocess.run(
            [str(GIT), "check-ref-format", f"refs/heads/{name}"],
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )
    if git_accepts:
        return
    with pytest.raises(InvalidBaseBranchError):
        parse_base_branch(name)


@pytest.mark.parametrize("name", ["release.", "a.", "feat/x.", "@"])
def test_the_shapes_codex_review_found(name: str) -> None:
    # Regression pins for the round-1 review finding: a trailing dot is refused
    # by git, and a bare '@' collides with git's shorthand for HEAD.
    with pytest.raises(InvalidBaseBranchError):
        parse_base_branch(name)
