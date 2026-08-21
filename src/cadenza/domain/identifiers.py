"""Project identifiers: immutable project_id and mutable alias share a shape."""

from __future__ import annotations

import re
from typing import Final

from cadenza.domain.errors import InvalidIdentifierError

__all__ = ["IDENTIFIER_PATTERN", "parse_identifier"]

# ``\Z`` rather than ``$``: ``$`` also matches before a trailing newline, which
# would let "web\n" through as a project_id.
IDENTIFIER_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[a-z][a-z0-9_-]{0,63}\Z")


def parse_identifier(value: object, *, field: str, location: str | None = None) -> str:
    """Return ``value`` as a valid identifier, or refuse."""
    if not isinstance(value, str):
        raise InvalidIdentifierError(
            f"{field} must be a string, got {type(value).__name__}",
            location=location,
        )
    if IDENTIFIER_PATTERN.match(value) is None:
        raise InvalidIdentifierError(
            f"{field} {value!r} is not a valid identifier: expected "
            "a lowercase letter followed by up to 63 of [a-z0-9_-]",
            location=location,
        )
    return value
