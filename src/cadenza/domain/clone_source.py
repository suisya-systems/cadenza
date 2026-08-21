"""``CloneSource`` - the tagged union of where a project's code comes from.

Design doc section 3.1. URL, local path and "create it fresh" carry different
validation, different reproducibility and different trust boundaries, so ``kind``
is always present and always checked; nothing here touches a filesystem or a
network.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import ClassVar, Final
from urllib.parse import urlsplit

from cadenza.domain.errors import (
    InvalidCloneSourceError,
    MissingFieldError,
    UnknownFieldError,
)

__all__ = [
    "ALLOWED_URL_SCHEMES",
    "CloneSource",
    "GitUrlSource",
    "LocalPathSource",
    "NewRepositorySource",
    "parse_clone_source",
]

ALLOWED_URL_SCHEMES: Final[frozenset[str]] = frozenset({"https", "ssh"})

# Refused with the reason, not a generic "bad scheme": the operator needs to
# know why the transport is unacceptable, since each of these has a fix.
_REFUSED_SCHEMES: Final[Mapping[str, str]] = {
    "http": ("'http' is plaintext and a clone is code execution; use 'https' or 'ssh'"),
    "git": (
        "the 'git' protocol is unauthenticated and a clone is code execution; use 'https' or 'ssh'"
    ),
    "file": (
        "'file' is a filesystem path wearing a URL; use kind = \"local_path\", "
        "which carries the containment rules"
    ),
}


@dataclass(frozen=True)
class GitUrlSource:
    """Clone from a remote over an authenticated transport."""

    url: str

    kind: ClassVar[str] = "git_url"

    def to_canonical(self) -> dict[str, str]:
        return {"kind": self.kind, "url": self.url}


@dataclass(frozen=True)
class LocalPathSource:
    """Clone from a path on the operator's machine.

    ``path`` is the lexically normalised absolute path. Whether it exists, is
    readable, or crosses a symlink is a run-side precondition
    (``cadenza.ports.LocalPathVerifier``), not a fact the domain may check.
    """

    path: str

    kind: ClassVar[str] = "local_path"

    def to_canonical(self) -> dict[str, str]:
        return {"kind": self.kind, "path": self.path}


@dataclass(frozen=True)
class NewRepositorySource:
    """No source exists; the run-side adapter initialises one."""

    kind: ClassVar[str] = "new"

    def to_canonical(self) -> dict[str, str]:
        return {"kind": self.kind}


CloneSource = GitUrlSource | LocalPathSource | NewRepositorySource

_FIELDS_BY_KIND: Final[Mapping[str, frozenset[str]]] = {
    GitUrlSource.kind: frozenset({"kind", "url"}),
    LocalPathSource.kind: frozenset({"kind", "path"}),
    NewRepositorySource.kind: frozenset({"kind"}),
}


def _is_control(character: str) -> bool:
    return ord(character) < 0x20 or ord(character) == 0x7F


def _require_string(table: Mapping[str, object], key: str, kind: str, location: str) -> str:
    if key not in table:
        raise MissingFieldError(
            f"clone source of kind {kind!r} requires the key {key!r}",
            location=location,
        )
    value = table[key]
    if not isinstance(value, str):
        raise InvalidCloneSourceError(
            f"{key} must be a string, got {type(value).__name__}",
            location=location,
        )
    return value


def _reject_unknown_fields(table: Mapping[str, object], kind: str, location: str) -> None:
    allowed = _FIELDS_BY_KIND[kind]
    unknown = sorted(key for key in table if key not in allowed)
    if unknown:
        raise UnknownFieldError(
            f"clone source of kind {kind!r} does not accept "
            f"{', '.join(repr(key) for key in unknown)}; "
            f"accepted keys are {', '.join(sorted(allowed))}",
            location=location,
        )


def _parse_git_url(table: Mapping[str, object], location: str) -> GitUrlSource:
    url = _require_string(table, "url", GitUrlSource.kind, location)
    for character in url:
        if character.isspace() or _is_control(character):
            raise InvalidCloneSourceError(
                "url must not contain whitespace or control characters",
                location=location,
            )
    try:
        # urlsplit itself raises ValueError on inputs a hostile catalog can
        # reach without any whitespace or control character -- an unbalanced
        # IPv6 bracket, or a netloc that changes under NFKC normalisation. A
        # bare ValueError here would escape as an untyped traceback naming
        # neither the file nor the key, which section 7 forbids.
        parts = urlsplit(url)
        scheme = parts.scheme.lower()
        username = parts.username
        password = parts.password
        host = parts.hostname
    except ValueError as error:
        raise InvalidCloneSourceError(
            f"url {url!r} is not parseable: {error}", location=location
        ) from error
    if not scheme:
        # scp-style "git@host:org/repo.git" is refused rather than rewritten:
        # accepting both spellings would mean one source with two digests.
        raise InvalidCloneSourceError(
            f"url {url!r} has no scheme; write it as ssh://git@host/org/repo.git",
            location=location,
        )
    if scheme in _REFUSED_SCHEMES:
        raise InvalidCloneSourceError(f"url refused: {_REFUSED_SCHEMES[scheme]}", location=location)
    if scheme not in ALLOWED_URL_SCHEMES:
        raise InvalidCloneSourceError(
            f"url scheme {scheme!r} is not allowed; expected one of "
            f"{', '.join(sorted(ALLOWED_URL_SCHEMES))}",
            location=location,
        )
    if password is not None:
        raise InvalidCloneSourceError(
            "url must not embed a password; a password in a catalog file is a leaked password",
            location=location,
        )
    if username is not None and not (scheme == "ssh" and username == "git"):
        raise InvalidCloneSourceError(
            f"url must not embed credentials; the only accepted userinfo is "
            f"the bare 'git@' of an ssh url, got {username!r}",
            location=location,
        )
    if not host:
        raise InvalidCloneSourceError(f"url {url!r} has no host", location=location)
    return GitUrlSource(url=url)


def _normalise_path(raw: str, base_dir: Path) -> str:
    # expanduser is the one place the domain reads outside its arguments: it
    # consults the home directory. It resolves no symlink and stats nothing.
    expanded = os.path.expanduser(raw)
    if not os.path.isabs(expanded):
        expanded = os.path.join(str(base_dir), expanded)
    # normpath, never resolve(): resolve() would touch the filesystem, and a
    # catalog has to stay checkable in CI on a machine that has none of these
    # directories.
    return os.path.normpath(expanded)


def _parse_local_path(
    table: Mapping[str, object],
    base_dir: Path,
    allowed_local_roots: Sequence[str],
    location: str,
) -> LocalPathSource:
    raw = _require_string(table, "path", LocalPathSource.kind, location)
    if not raw:
        raise InvalidCloneSourceError("path must not be empty", location=location)
    if any(_is_control(character) for character in raw):
        raise InvalidCloneSourceError(
            "path must not contain NUL bytes or control characters",
            location=location,
        )
    if not base_dir.is_absolute():
        # Anchoring to a relative base_dir would leave the anchored path
        # relative, so a run-side consumer would finish the job against its own
        # CWD -- section 3.1's rule, defeated one level up. LayerDocument
        # enforces the same invariant; this repeats it because parse_clone_source
        # is callable on its own.
        raise InvalidCloneSourceError(
            f"base_dir must be absolute to anchor a local_path, got {str(base_dir)!r}",
            location=location,
        )
    if not allowed_local_roots:
        raise InvalidCloneSourceError(
            "a clone source of kind 'local_path' requires the layer that "
            "declares it to declare its own catalog.allowed_local_roots",
            location=location,
        )
    normalised = _normalise_path(raw, base_dir)
    candidate = PurePath(normalised)
    roots = [_normalise_path(root, base_dir) for root in allowed_local_roots]
    for root in roots:
        if candidate.is_relative_to(PurePath(root)):
            return LocalPathSource(path=normalised)
    raise InvalidCloneSourceError(
        f"path {normalised} is outside the allowed local roots of this layer: {', '.join(roots)}",
        location=location,
    )


def parse_clone_source(
    table: Mapping[str, object],
    *,
    base_dir: Path,
    allowed_local_roots: Sequence[str],
    location: str,
) -> CloneSource:
    """Parse one ``[...source]`` table into a ``CloneSource``, or refuse.

    ``base_dir`` is the directory of the layer file that stated this source, and
    ``allowed_local_roots`` are that same layer's roots: both are layer-local so
    that a shared tracked file cannot authorise a directory on somebody else's
    machine.
    """
    if "kind" not in table:
        raise MissingFieldError("clone source table requires the key 'kind'", location=location)
    kind = table["kind"]
    if not isinstance(kind, str):
        raise InvalidCloneSourceError(
            f"kind must be a string, got {type(kind).__name__}",
            location=location,
        )
    if kind not in _FIELDS_BY_KIND:
        raise InvalidCloneSourceError(
            f"unknown clone source kind {kind!r}; expected one of "
            f"{', '.join(sorted(_FIELDS_BY_KIND))}",
            location=location,
        )
    _reject_unknown_fields(table, kind, location)
    if kind == GitUrlSource.kind:
        return _parse_git_url(table, location)
    if kind == LocalPathSource.kind:
        return _parse_local_path(table, base_dir, allowed_local_roots, location)
    return NewRepositorySource()
