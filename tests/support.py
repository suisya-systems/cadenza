"""Test helper: build ``LayerDocument``s without a filesystem.

Composition takes layer documents, not files, so most tests never need TOML.
Only ``tests/test_toml_loader.py`` goes through the adapter.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from cadenza.ports.catalog_source import LayerDocument

# Absolute, because LayerDocument refuses a relative base_dir: a relative anchor
# would leave an anchored local_path relative too, and the run-side consumer
# would finish anchoring it against its own CWD.
CATALOG_DIR = Path("/srv/catalog") if os.name != "nt" else Path("C:/srv/catalog")
TRACKED_ORIGIN = str(CATALOG_DIR / "projects.toml")
LOCAL_ORIGIN = str(CATALOG_DIR / "projects.local.toml")


def make_layer(
    data: dict[str, Any],
    *,
    layer: str = "tracked",
    origin: str | None = None,
    base_dir: Path | str = CATALOG_DIR,
) -> LayerDocument:
    if origin is None:
        origin = TRACKED_ORIGIN if layer == "tracked" else LOCAL_ORIGIN
    return LayerDocument(layer=layer, origin=origin, base_dir=Path(base_dir), data=data)


def git_url_project(
    url: str = "https://example.invalid/org/repo.git",
    *,
    base_branch: str = "main",
    **extra: Any,
) -> dict[str, Any]:
    """A minimal complete project table."""
    table: dict[str, Any] = {
        "source": {"kind": "git_url", "url": url},
        "base_branch": base_branch,
    }
    table.update(extra)
    return table
