"""``config_digest`` - a stable fingerprint of a project's configuration."""

from __future__ import annotations

import hashlib
import json

from cadenza.domain.project import Project

__all__ = ["canonical_payload", "config_digest"]


def canonical_payload(project: Project) -> dict[str, object]:
    """Return the semantics the digest covers.

    Provenance and file paths are deliberately absent: moving a catalog file, or
    restating a field in a different layer, must not change what the digest says
    about the project. The digest is a statement about configuration, not about
    where it was typed.

    Aliases are sorted, so that reordering a display-only list does not read as
    a configuration change.
    """
    return {
        "project_id": project.project_id,
        "aliases": sorted(project.aliases),
        "source": project.source.to_canonical(),
        "base_branch": project.base_branch,
    }


def config_digest(project: Project) -> str:
    """Return ``sha256:<hex>`` over the canonical JSON encoding of the payload."""
    encoded = json.dumps(
        canonical_payload(project),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"
