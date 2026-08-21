"""Name -> ResolvedProject (design section 6)."""

from __future__ import annotations

import difflib

from cadenza.application.compose import Catalog
from cadenza.domain.digest import config_digest
from cadenza.domain.errors import ProjectNotFoundError
from cadenza.domain.project import ResolvedProject

_MAX_SUGGESTIONS = 5


def resolve_project(catalog: Catalog, name: str) -> ResolvedProject:
    project_id = catalog.names.get(name)
    if project_id is None:
        raise ProjectNotFoundError(_not_found_message(catalog, name))
    project = catalog.projects[project_id]
    return ResolvedProject(
        project_id=project.project_id,
        aliases=project.aliases,
        source=project.source,
        base_branch=project.base_branch,
        # The digest is what lets a later reader tell that the catalog moved
        # under a run that already happened (design section 3.2).
        config_digest=config_digest(project),
        provenance=catalog.provenance[project_id],
    )


def _not_found_message(catalog: Catalog, name: str) -> str:
    known = sorted(catalog.names)
    suggestions = difflib.get_close_matches(name, known, n=_MAX_SUGGESTIONS)
    if not suggestions:
        return f"no project is named '{name}'"
    return f"no project is named '{name}'. Closest known names: {', '.join(suggestions)}"
