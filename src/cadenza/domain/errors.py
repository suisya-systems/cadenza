"""Typed refusals.

Design doc section 7: no refusal is a bare ``ValueError`` and none is silent.
Every catalog-level failure carries where it happened, because the operator
fixing it is editing a file, not reading a traceback.
"""

from __future__ import annotations

__all__ = [
    "CadenzaError",
    "CatalogError",
    "InvalidBaseBranchError",
    "InvalidCloneSourceError",
    "InvalidIdentifierError",
    "MissingFieldError",
    "NameCollisionError",
    "ProjectNotFoundError",
    "SchemaVersionError",
    "TombstoneError",
    "UnknownFieldError",
]


class CadenzaError(Exception):
    """Base class for every error cadenza raises deliberately."""


class CatalogError(CadenzaError):
    """A catalog input was refused.

    ``location`` is either a file ("config/projects.toml") or a file and the
    key at fault ("config/projects.toml: project.web.source.url").
    """

    def __init__(self, message: str, *, location: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.location = location

    def __str__(self) -> str:
        if self.location is None:
            return self.message
        return f"{self.message} (at {self.location})"


class SchemaVersionError(CatalogError):
    """``schema_version`` is missing, not an integer, or unknown to this build."""


class UnknownFieldError(CatalogError):
    """A key no table accepts. Tables are closed (design doc section 5.6)."""


class MissingFieldError(CatalogError):
    """A required key is absent."""


class InvalidIdentifierError(CatalogError):
    """A project_id or alias does not match the identifier shape."""


class InvalidCloneSourceError(CatalogError):
    """A ``[...source]`` table is not a valid tagged union member."""


class InvalidBaseBranchError(CatalogError):
    """``base_branch`` is not a usable git ref name."""


class NameCollisionError(CatalogError):
    """One name in the flat namespace maps to more than one project."""


class TombstoneError(CatalogError):
    """A tombstone carries extra fields or names a project no layer defines."""


class ProjectNotFoundError(CadenzaError):
    """Resolution found no project for the given name.

    Not a ``CatalogError``: the catalog is fine, the typed name is not.
    """
