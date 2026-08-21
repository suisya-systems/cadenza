"""Validation of git ref names used as a base branch.

The rules mirror the subset of ``git check-ref-format`` that matters for a
branch name (design doc section 3.2). They are applied lexically here so that a
catalog stays checkable without a repository present.
"""

from __future__ import annotations

from typing import Final

from cadenza.domain.errors import InvalidBaseBranchError

__all__ = ["parse_base_branch"]

_FORBIDDEN_CHARACTERS: Final[str] = "~^:?*[\\"


def _refuse(reason: str, location: str | None) -> InvalidBaseBranchError:
    return InvalidBaseBranchError(f"base_branch {reason}", location=location)


def parse_base_branch(value: object, *, location: str | None = None) -> str:
    """Return ``value`` as a valid branch name, or refuse."""
    if not isinstance(value, str):
        raise InvalidBaseBranchError(
            f"base_branch must be a string, got {type(value).__name__}",
            location=location,
        )
    if not value:
        raise _refuse("must not be empty", location)
    for character in value:
        if character.isspace() or ord(character) < 0x20 or ord(character) == 0x7F:
            raise _refuse(
                f"{value!r} must not contain whitespace or control characters",
                location,
            )
        if character in _FORBIDDEN_CHARACTERS:
            raise _refuse(
                f"{value!r} must not contain any of {_FORBIDDEN_CHARACTERS!r}",
                location,
            )
    if ".." in value:
        raise _refuse(f"{value!r} must not contain '..'", location)
    if "@{" in value:
        raise _refuse(f"{value!r} must not contain '@{{'", location)
    if "//" in value:
        raise _refuse(f"{value!r} must not contain '//'", location)
    if value.startswith("/") or value.endswith("/"):
        raise _refuse(f"{value!r} must not start or end with '/'", location)
    if value.startswith("-"):
        raise _refuse(
            f"{value!r} must not start with '-': it would be read as an option",
            location,
        )
    for component in value.split("/"):
        if component.startswith("."):
            raise _refuse(
                f"{value!r} must not contain a component beginning with '.'",
                location,
            )
        if component.endswith(".lock"):
            raise _refuse(f"{value!r} must not end with '.lock'", location)
    if value.endswith("."):
        # git check-ref-format rejects a trailing dot outright. Accepting it
        # here would let a catalog compose cleanly and then fail at the clone,
        # which is the failure this validator exists to move earlier.
        raise _refuse(f"{value!r} must not end with '.'", location)
    if value == "@":
        # A bare '@' is git's shorthand for HEAD in revision syntax, so a
        # base_branch of '@' means one thing to the catalog and another to
        # whatever resolves it. Refusing beats picking a reading.
        raise _refuse("must not be the single character '@'", location)
    return value
