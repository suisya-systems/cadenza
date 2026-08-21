"""CloneSource: the tagged union and its per-kind rules (design doc section 3.1)."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from cadenza.domain.clone_source import (
    ALLOWED_URL_SCHEMES,
    GitUrlSource,
    LocalPathSource,
    NewRepositorySource,
    parse_clone_source,
)
from cadenza.domain.errors import (
    InvalidCloneSourceError,
    MissingFieldError,
    UnknownFieldError,
)

LOCATION = "config/projects.toml: project.web.source"


def parse(table: dict[str, object], **kwargs: object) -> object:
    defaults: dict[str, object] = {
        "base_dir": Path("/srv/catalog"),
        "allowed_local_roots": (),
        "location": LOCATION,
    }
    defaults.update(kwargs)
    return parse_clone_source(table, **defaults)  # type: ignore[arg-type]


# --- the tag itself -------------------------------------------------------


def test_kind_is_required() -> None:
    with pytest.raises(MissingFieldError, match="requires the key 'kind'"):
        parse({"url": "https://example.invalid/o/r.git"})


def test_unknown_kind_is_refused_and_lists_the_known_ones() -> None:
    with pytest.raises(InvalidCloneSourceError, match="unknown clone source kind 'svn'"):
        parse({"kind": "svn"})


@pytest.mark.parametrize("kind", [1, True, None, ["git_url"]])
def test_non_string_kind_is_refused(kind: object) -> None:
    with pytest.raises(InvalidCloneSourceError, match="kind must be a string"):
        parse({"kind": kind})


# --- git_url --------------------------------------------------------------


def test_allowed_schemes_are_exactly_https_and_ssh() -> None:
    assert frozenset({"https", "ssh"}) == ALLOWED_URL_SCHEMES


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/org/repo.git",
        "ssh://git@github.com/org/repo.git",
        "ssh://github.com/org/repo.git",
        "HTTPS://github.com/org/repo.git",  # scheme comparison is case-insensitive
    ],
)
def test_accepts_authenticated_transports(url: str) -> None:
    assert parse({"kind": "git_url", "url": url}) == GitUrlSource(url=url)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("http://github.com/org/repo.git", "plaintext"),
        ("git://github.com/org/repo.git", "unauthenticated"),
        ("file:///srv/repos/repo.git", "local_path"),
    ],
)
def test_refuses_each_documented_scheme_with_its_reason(url: str, expected: str) -> None:
    with pytest.raises(InvalidCloneSourceError, match=expected):
        parse({"kind": "git_url", "url": url})


def test_refuses_a_scheme_that_is_merely_unknown() -> None:
    with pytest.raises(InvalidCloneSourceError, match="scheme 'ftp' is not allowed"):
        parse({"kind": "git_url", "url": "ftp://example.invalid/repo.git"})


def test_refuses_scp_style_shorthand_rather_than_rewriting_it() -> None:
    # Accepting both spellings of one remote would give one source two digests.
    with pytest.raises(InvalidCloneSourceError, match="has no scheme"):
        parse({"kind": "git_url", "url": "git@github.com:org/repo.git"})


def test_bare_git_userinfo_is_the_one_accepted_credential_shape() -> None:
    url = "ssh://git@github.com/org/repo.git"
    assert parse({"kind": "git_url", "url": url}) == GitUrlSource(url=url)


@pytest.mark.parametrize(
    "url",
    [
        "ssh://alice@github.com/org/repo.git",
        "https://git@github.com/org/repo.git",  # 'git@' is a user only over ssh
        "https://token@github.com/org/repo.git",
    ],
)
def test_refuses_other_userinfo(url: str) -> None:
    with pytest.raises(InvalidCloneSourceError, match="must not embed credentials"):
        parse({"kind": "git_url", "url": url})


@pytest.mark.parametrize(
    "url",
    [
        "https://alice:s3cret@github.com/org/repo.git",
        "ssh://git:s3cret@github.com/org/repo.git",
    ],
)
def test_refuses_an_embedded_password(url: str) -> None:
    with pytest.raises(InvalidCloneSourceError, match="must not embed a password"):
        parse({"kind": "git_url", "url": url})


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/org/ repo.git",
        "https://github.com/org/repo.git\n",
        "https://g\x01.com/r",
    ],
)
def test_refuses_whitespace_and_control_characters_in_a_url(url: str) -> None:
    with pytest.raises(InvalidCloneSourceError, match="whitespace or control characters"):
        parse({"kind": "git_url", "url": url})


def test_refuses_a_url_with_no_host() -> None:
    with pytest.raises(InvalidCloneSourceError, match="has no host"):
        parse({"kind": "git_url", "url": "https:///org/repo.git"})


def test_url_is_required_and_must_be_a_string() -> None:
    with pytest.raises(MissingFieldError, match="requires the key 'url'"):
        parse({"kind": "git_url"})
    with pytest.raises(InvalidCloneSourceError, match="url must be a string"):
        parse({"kind": "git_url", "url": 7})


def test_git_url_rejects_an_unknown_field() -> None:
    with pytest.raises(UnknownFieldError, match="'branch'"):
        parse({"kind": "git_url", "url": "https://github.com/o/r.git", "branch": "main"})


# --- local_path -----------------------------------------------------------


def test_relative_path_is_anchored_to_the_declaring_layers_directory(tmp_path: Path) -> None:
    # Never the process CWD: the same catalog must mean the same thing whatever
    # directory cadenza is invoked from.
    (tmp_path / "repos").mkdir()
    source = parse(
        {"kind": "local_path", "path": "repos/web"},
        base_dir=tmp_path,
        allowed_local_roots=(str(tmp_path),),
    )
    assert source == LocalPathSource(path=str(tmp_path / "repos" / "web"))


def test_absolute_path_is_kept_as_is(tmp_path: Path) -> None:
    target = tmp_path / "web"
    source = parse(
        {"kind": "local_path", "path": str(target)},
        base_dir=Path("/somewhere/else"),
        allowed_local_roots=(str(tmp_path),),
    )
    assert source == LocalPathSource(path=str(target))


def test_tilde_is_expanded_against_the_home_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    source = parse(
        {"kind": "local_path", "path": "~/work/web"},
        base_dir=Path("/srv/catalog"),
        allowed_local_roots=("~/work",),
    )
    assert source == LocalPathSource(path=str(tmp_path / "work" / "web"))


def test_interior_dot_dot_is_collapsed_and_kept_when_it_stays_inside(tmp_path: Path) -> None:
    source = parse(
        {"kind": "local_path", "path": "sub/../web"},
        base_dir=tmp_path,
        allowed_local_roots=(str(tmp_path),),
    )
    assert source == LocalPathSource(path=str(tmp_path / "web"))


def test_dot_dot_that_climbs_out_of_every_root_is_refused_naming_the_roots(
    tmp_path: Path,
) -> None:
    root = tmp_path / "work"
    root.mkdir()
    with pytest.raises(InvalidCloneSourceError, match="outside the allowed local roots") as caught:
        parse(
            {"kind": "local_path", "path": "../../etc/shadow"},
            base_dir=root,
            allowed_local_roots=(str(root),),
        )
    assert str(root) in str(caught.value)


def test_a_layer_with_no_roots_may_not_declare_a_local_path(tmp_path: Path) -> None:
    # Absence of roots is a refusal, not an implicit "anything goes" (section 3.3).
    with pytest.raises(InvalidCloneSourceError, match="allowed_local_roots"):
        parse(
            {"kind": "local_path", "path": str(tmp_path / "web")},
            base_dir=tmp_path,
            allowed_local_roots=(),
        )


def test_a_sibling_of_a_root_does_not_count_as_contained(tmp_path: Path) -> None:
    # "/srv/work-other" must not pass because it shares a prefix with "/srv/work".
    root = tmp_path / "work"
    with pytest.raises(InvalidCloneSourceError, match="outside the allowed local roots"):
        parse(
            {"kind": "local_path", "path": str(tmp_path / "work-other" / "web")},
            base_dir=tmp_path,
            allowed_local_roots=(str(root),),
        )


def test_any_of_several_roots_may_contain_the_path(tmp_path: Path) -> None:
    source = parse(
        {"kind": "local_path", "path": str(tmp_path / "b" / "web")},
        base_dir=tmp_path,
        allowed_local_roots=(str(tmp_path / "a"), str(tmp_path / "b")),
    )
    assert source == LocalPathSource(path=str(tmp_path / "b" / "web"))


def test_empty_path_is_refused(tmp_path: Path) -> None:
    with pytest.raises(InvalidCloneSourceError, match="path must not be empty"):
        parse(
            {"kind": "local_path", "path": ""},
            base_dir=tmp_path,
            allowed_local_roots=(str(tmp_path),),
        )


@pytest.mark.parametrize("path", ["web\x00repo", "web\x01", "web\x7f"])
def test_nul_and_control_characters_in_a_path_are_refused(path: str, tmp_path: Path) -> None:
    with pytest.raises(InvalidCloneSourceError, match="NUL bytes or control characters"):
        parse(
            {"kind": "local_path", "path": path},
            base_dir=tmp_path,
            allowed_local_roots=(str(tmp_path),),
        )


def test_path_is_required_and_must_be_a_string(tmp_path: Path) -> None:
    with pytest.raises(MissingFieldError, match="requires the key 'path'"):
        parse({"kind": "local_path"}, base_dir=tmp_path, allowed_local_roots=(str(tmp_path),))
    with pytest.raises(InvalidCloneSourceError, match="path must be a string"):
        parse(
            {"kind": "local_path", "path": 7},
            base_dir=tmp_path,
            allowed_local_roots=(str(tmp_path),),
        )


def test_local_path_rejects_an_unknown_field(tmp_path: Path) -> None:
    with pytest.raises(UnknownFieldError, match="'url'"):
        parse(
            {"kind": "local_path", "path": str(tmp_path), "url": "https://x.invalid/r.git"},
            base_dir=tmp_path,
            allowed_local_roots=(str(tmp_path),),
        )


# --- new ------------------------------------------------------------------


def test_new_takes_no_fields() -> None:
    assert parse({"kind": "new"}) == NewRepositorySource()


@pytest.mark.parametrize(
    "extra", [{"url": "https://x.invalid/r.git"}, {"path": "/srv/web"}, {"template": "blank"}]
)
def test_new_refuses_any_field_beyond_kind(extra: dict[str, object]) -> None:
    with pytest.raises(UnknownFieldError, match="does not accept"):
        parse({"kind": "new", **extra})


# --- canonical form -------------------------------------------------------


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            GitUrlSource(url="https://x.invalid/r.git"),
            {"kind": "git_url", "url": "https://x.invalid/r.git"},
        ),
        (LocalPathSource(path="/srv/web"), {"kind": "local_path", "path": "/srv/web"}),
        (NewRepositorySource(), {"kind": "new"}),
    ],
)
def test_canonical_form_always_carries_the_tag(source: object, expected: dict[str, str]) -> None:
    assert source.to_canonical() == expected  # type: ignore[attr-defined]


def test_sources_are_frozen() -> None:
    source = GitUrlSource(url="https://x.invalid/r.git")
    with pytest.raises(FrozenInstanceError):
        source.url = "https://other.invalid/r.git"  # type: ignore[misc]


# --- regressions: refusals that used to escape as untyped errors ----------


@pytest.mark.parametrize(
    "url",
    [
        # urlsplit itself raises ValueError on these, and neither carries
        # whitespace or a control character, so the character scan lets them
        # through to the parser.
        "https://[::1/repo.git",
        "https://exa℀mple.com/r.git",
    ],
)
def test_a_url_that_urlsplit_itself_rejects_is_a_typed_refusal(url: str) -> None:
    # Design section 7: nothing is refused via a bare ValueError, and every
    # refusal names the file and key. A traceback out of urlsplit would name
    # neither, and would take down a whole catalog load from one line of TOML.
    with pytest.raises(InvalidCloneSourceError, match="is not parseable") as caught:
        parse({"kind": "git_url", "url": url})
    assert caught.value.location == LOCATION


def test_a_relative_base_dir_cannot_anchor_a_local_path() -> None:
    # A relative anchor leaves the anchored path relative, so whoever clones it
    # would re-anchor against its own CWD -- section 3.1's rule defeated one
    # level up -- and config_digest would depend on the invocation directory.
    with pytest.raises(InvalidCloneSourceError, match="base_dir must be absolute"):
        parse(
            {"kind": "local_path", "path": "repo"},
            base_dir=Path("config"),
            allowed_local_roots=(".",),
        )


@pytest.mark.parametrize(
    "url",
    [
        "https://example.invalid:abc/o/r.git",
        "https://example.invalid:99999/o/r.git",
    ],
)
def test_a_malformed_port_is_refused_at_composition(url: str) -> None:
    # urlsplit carries a nonsense port until something reads it, so an unvalidated
    # port would let the catalog compose and the clone fail later -- the ordering
    # this validator exists to fix (Codex review round 2).
    with pytest.raises(InvalidCloneSourceError, match="is not parseable"):
        parse({"kind": "git_url", "url": url})


@pytest.mark.parametrize(
    "url",
    ["https://example.invalid:443/o/r.git", "ssh://git@example.invalid:22/o/r.git"],
)
def test_a_well_formed_port_is_accepted(url: str) -> None:
    assert parse({"kind": "git_url", "url": url}) == GitUrlSource(url=url)
