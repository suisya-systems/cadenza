"""Compose ordered layer documents into one catalog (design section 5)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from types import MappingProxyType

from cadenza.domain.clone_source import CloneSource, parse_clone_source
from cadenza.domain.errors import (
    CatalogError,
    MissingFieldError,
    NameCollisionError,
    SchemaVersionError,
    TombstoneError,
    UnknownFieldError,
)
from cadenza.domain.identifiers import parse_identifier
from cadenza.domain.project import FieldOrigin, Project
from cadenza.domain.refs import parse_base_branch
from cadenza.ports.catalog_source import LayerDocument

SUPPORTED_SCHEMA_VERSIONS: frozenset[int] = frozenset({1})

_TOP_LEVEL_KEYS = frozenset({"schema_version", "catalog", "project"})
_CATALOG_KEYS = frozenset({"allowed_local_roots"})
_PROJECT_KEYS = frozenset({"aliases", "source", "base_branch", "tombstone"})


@dataclass(frozen=True)
class Catalog:
    projects: Mapping[str, Project]
    provenance: Mapping[str, Mapping[str, FieldOrigin]]
    names: Mapping[str, str]


@dataclass
class _Accumulator:
    """A project under construction, plus where each of its fields came from."""

    project_id: str
    aliases: tuple[str, ...] = ()
    source: CloneSource | None = None
    base_branch: str | None = None
    origins: dict[str, FieldOrigin] = field(default_factory=dict)


def compose_catalog(documents: Sequence[LayerDocument]) -> Catalog:
    accumulated: dict[str, _Accumulator] = {}
    for document in documents:
        _apply_document(document, accumulated)
    return _finish(accumulated)


def _apply_document(document: LayerDocument, accumulated: dict[str, _Accumulator]) -> None:
    data = document.data
    _refuse_unknown_keys(data, _TOP_LEVEL_KEYS, location=document.origin)
    _check_schema_version(data, location=document.origin)
    allowed_local_roots = _read_allowed_local_roots(data, location=document.origin)

    projects = data.get("project", {})
    if not isinstance(projects, Mapping):
        raise CatalogError("'project' must be a table", location=document.origin)

    for raw_id, table in projects.items():
        location = f"{document.origin}: project.{raw_id}"
        project_id = parse_identifier(raw_id, field="project_id", location=location)
        if not isinstance(table, Mapping):
            raise CatalogError(f"project '{project_id}' must be a table", location=location)
        _refuse_unknown_keys(table, _PROJECT_KEYS, location=location)
        if "tombstone" in table:
            _apply_tombstone(table, project_id, accumulated, location=location)
            continue
        _apply_project(
            table,
            project_id,
            accumulated,
            document=document,
            allowed_local_roots=allowed_local_roots,
            location=location,
        )


def _apply_tombstone(
    table: Mapping[str, object],
    project_id: str,
    accumulated: dict[str, _Accumulator],
    *,
    location: str,
) -> None:
    value = table["tombstone"]
    if not isinstance(value, bool):
        raise TombstoneError("'tombstone' must be a boolean", location=location)
    if not value:
        # "tombstone = false" reads as an instruction and carries none; only the
        # absence of the key means "keep this project".
        raise TombstoneError("'tombstone' is only meaningful as true", location=location)
    if len(table) != 1:
        raise TombstoneError("a tombstoned project must carry no other field", location=location)
    if project_id not in accumulated:
        # A stale or typo'd tombstone accepted silently makes the next typo
        # silent too (design section 5.5).
        raise TombstoneError(
            f"tombstone names project '{project_id}', which no earlier layer defines",
            location=location,
        )
    del accumulated[project_id]


def _apply_project(
    table: Mapping[str, object],
    project_id: str,
    accumulated: dict[str, _Accumulator],
    *,
    document: LayerDocument,
    allowed_local_roots: tuple[str, ...],
    location: str,
) -> None:
    entry = accumulated.get(project_id)
    if entry is None:
        entry = _Accumulator(project_id=project_id)
        accumulated[project_id] = entry
        entry.origins["project_id"] = _origin(document)

    if "aliases" in table:
        # Replaces whole: appending would leave no way to remove an alias.
        entry.aliases = _parse_aliases(table["aliases"], location=location)
        entry.origins["aliases"] = _origin(document)

    if "source" in table:
        source_table = table["source"]
        if not isinstance(source_table, Mapping):
            raise CatalogError("'source' must be a table", location=f"{location}.source")
        # Replaces whole: a field-wise merge of a tagged union can produce a
        # shape nobody wrote (design section 5.3). allowed_local_roots is taken
        # from the document that states the source, never merged across layers.
        entry.source = parse_clone_source(
            source_table,
            base_dir=document.base_dir,
            allowed_local_roots=allowed_local_roots,
            location=f"{location}.source",
        )
        entry.origins["source"] = _origin(document)

    if "base_branch" in table:
        entry.base_branch = parse_base_branch(
            table["base_branch"], location=f"{location}.base_branch"
        )
        entry.origins["base_branch"] = _origin(document)


def _finish(accumulated: Mapping[str, _Accumulator]) -> Catalog:
    projects: dict[str, Project] = {}
    provenance: dict[str, Mapping[str, FieldOrigin]] = {}
    names: dict[str, str] = {}
    claims: dict[str, tuple[str, FieldOrigin]] = {}

    for project_id, entry in accumulated.items():
        defined_at = entry.origins["project_id"]
        if entry.source is None:
            raise MissingFieldError(
                f"project '{project_id}' has no source", location=defined_at.file
            )
        if entry.base_branch is None:
            raise MissingFieldError(
                f"project '{project_id}' has no base_branch", location=defined_at.file
            )
        projects[project_id] = Project(
            project_id=project_id,
            aliases=entry.aliases,
            source=entry.source,
            base_branch=entry.base_branch,
        )
        provenance[project_id] = MappingProxyType(dict(entry.origins))

        for name, origin in _claimed_names(entry, defined_at):
            previous = claims.get(name)
            if previous is not None:
                owner, owner_origin = previous
                raise NameCollisionError(
                    f"name '{name}' is claimed by project '{owner}' "
                    f"({owner_origin.layer}, {owner_origin.file}) and by project "
                    f"'{project_id}' ({origin.layer}, {origin.file})",
                    location=origin.file,
                )
            claims[name] = (project_id, origin)
            names[name] = project_id

    return Catalog(
        projects=MappingProxyType(projects),
        provenance=MappingProxyType(provenance),
        names=MappingProxyType(names),
    )


def _claimed_names(entry: _Accumulator, defined_at: FieldOrigin) -> list[tuple[str, FieldOrigin]]:
    alias_origin = entry.origins.get("aliases", defined_at)
    claimed = [(entry.project_id, defined_at)]
    claimed.extend((alias, alias_origin) for alias in entry.aliases)
    return claimed


def _origin(document: LayerDocument) -> FieldOrigin:
    return FieldOrigin(layer=document.layer, file=document.origin)


def _parse_aliases(value: object, *, location: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise CatalogError("'aliases' must be a list", location=location)
    aliases: list[str] = []
    for item in value:
        alias = parse_identifier(item, field="alias", location=location)
        if alias in aliases:
            raise NameCollisionError(f"alias '{alias}' is listed twice", location=location)
        aliases.append(alias)
    return tuple(aliases)


def _check_schema_version(data: Mapping[str, object], *, location: str) -> None:
    if "schema_version" not in data:
        # SchemaVersionError rather than MissingFieldError: absence is the most
        # common spelling of "this file predates the version field", which is a
        # statement about the file's schema. MissingFieldError is reserved for a
        # project table missing one of its own required keys.
        raise SchemaVersionError("'schema_version' is required", location=location)
    version = data["schema_version"]
    # bool is an int in Python; "schema_version = true" is not version 1.
    if isinstance(version, bool) or not isinstance(version, int):
        raise SchemaVersionError("'schema_version' must be an integer", location=location)
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        supported = ", ".join(str(v) for v in sorted(SUPPORTED_SCHEMA_VERSIONS))
        raise SchemaVersionError(
            f"schema_version {version} is not supported by this build (supported: {supported})",
            location=location,
        )


def _read_allowed_local_roots(data: Mapping[str, object], *, location: str) -> tuple[str, ...]:
    catalog = data.get("catalog", {})
    if not isinstance(catalog, Mapping):
        raise CatalogError("'catalog' must be a table", location=location)
    _refuse_unknown_keys(catalog, _CATALOG_KEYS, location=f"{location}: catalog")
    roots = catalog.get("allowed_local_roots", [])
    if not isinstance(roots, list) or not all(isinstance(root, str) for root in roots):
        raise CatalogError(
            "'allowed_local_roots' must be a list of strings",
            location=f"{location}: catalog.allowed_local_roots",
        )
    return tuple(str(root) for root in roots)


def _refuse_unknown_keys(
    table: Mapping[str, object], allowed: frozenset[str], *, location: str
) -> None:
    for key in table:
        if key not in allowed:
            permitted = ", ".join(sorted(allowed))
            raise UnknownFieldError(
                f"unknown key '{key}' (permitted: {permitted})", location=location
            )
