"""The G1 domain: identities, clone sources, projects, digests, refusals.

Pure data and pure rules. Nothing here performs I/O, and nothing names an
executor: the domain is provider-agnostic by construction.
"""

from __future__ import annotations

from cadenza.domain.clone_source import (
    ALLOWED_URL_SCHEMES,
    CloneSource,
    GitUrlSource,
    LocalPathSource,
    NewRepositorySource,
    parse_clone_source,
)
from cadenza.domain.digest import canonical_payload, config_digest
from cadenza.domain.errors import (
    CadenzaError,
    CatalogError,
    InvalidBaseBranchError,
    InvalidCloneSourceError,
    InvalidIdentifierError,
    MissingFieldError,
    NameCollisionError,
    ProjectNotFoundError,
    SchemaVersionError,
    TombstoneError,
    UnknownFieldError,
)
from cadenza.domain.identifiers import IDENTIFIER_PATTERN, parse_identifier
from cadenza.domain.project import FieldOrigin, Project, ResolvedProject
from cadenza.domain.refs import parse_base_branch

__all__ = [
    "ALLOWED_URL_SCHEMES",
    "IDENTIFIER_PATTERN",
    "CadenzaError",
    "CatalogError",
    "CloneSource",
    "FieldOrigin",
    "GitUrlSource",
    "InvalidBaseBranchError",
    "InvalidCloneSourceError",
    "InvalidIdentifierError",
    "LocalPathSource",
    "MissingFieldError",
    "NameCollisionError",
    "NewRepositorySource",
    "Project",
    "ProjectNotFoundError",
    "ResolvedProject",
    "SchemaVersionError",
    "TombstoneError",
    "UnknownFieldError",
    "canonical_payload",
    "config_digest",
    "parse_base_branch",
    "parse_clone_source",
    "parse_identifier",
]
