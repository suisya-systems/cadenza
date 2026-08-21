"""Project identity and the snapshot handed to a run (design doc section 3.2)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from cadenza.domain.clone_source import CloneSource

__all__ = ["FieldOrigin", "Project", "ResolvedProject"]


@dataclass(frozen=True)
class Project:
    """A project as a composed catalog holds it.

    ``project_id`` is immutable and never reused; ``aliases`` are mutable
    display names, ordered as declared and unique across the whole namespace.
    """

    project_id: str
    aliases: tuple[str, ...]
    source: CloneSource
    base_branch: str


@dataclass(frozen=True)
class FieldOrigin:
    """Which layer, and which file within it, decided one field."""

    layer: str
    file: str


@dataclass(frozen=True)
class ResolvedProject:
    """What a run persists.

    ``config_digest`` is what makes a later audit possible: a run that recorded
    only the typed name cannot tell that the catalog moved underneath it.
    """

    project_id: str
    aliases: tuple[str, ...]
    source: CloneSource
    base_branch: str
    config_digest: str
    provenance: Mapping[str, FieldOrigin]
