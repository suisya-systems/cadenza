"""Composition and resolution. Pure functions over layer documents; no I/O."""

from cadenza.application.compose import (
    SUPPORTED_SCHEMA_VERSIONS,
    Catalog,
    compose_catalog,
)
from cadenza.application.resolve import resolve_project

__all__ = [
    "SUPPORTED_SCHEMA_VERSIONS",
    "Catalog",
    "compose_catalog",
    "resolve_project",
]
