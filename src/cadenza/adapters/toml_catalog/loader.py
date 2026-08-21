"""Read the tracked and operator-local TOML layer files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:  # tomllib is stdlib from 3.11; tomli is the pinned fallback on 3.10.
    import tomllib  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - depends on the interpreter version
    import tomli as tomllib

from cadenza.domain.errors import CatalogError
from cadenza.ports.catalog_source import LayerDocument

TRACKED_FILENAME = "projects.toml"
LOCAL_FILENAME = "projects.local.toml"


@dataclass(frozen=True)
class TomlCatalogSource:
    """Loads the layers of a catalog directory, lowest precedence first."""

    directory: Path

    def load(self) -> tuple[LayerDocument, ...]:
        # Absolute from here on. This adapter is the one component that knows
        # where the files were found, so it is where the CWD is allowed to be
        # consulted -- once, to locate the layer files, and never again to
        # anchor a path a catalog stated (design section 3.1).
        directory = Path(os.path.abspath(self.directory))
        tracked_path = directory / TRACKED_FILENAME
        if not tracked_path.is_file():
            raise CatalogError("tracked catalog file not found", location=str(tracked_path))
        documents = [_read(tracked_path, layer="tracked")]

        # The local layer is operator-owned and gitignored, so its absence is
        # the normal case rather than an error.
        local_path = directory / LOCAL_FILENAME
        if local_path.is_file():
            documents.append(_read(local_path, layer="local"))
        return tuple(documents)


def _read(path: Path, *, layer: str) -> LayerDocument:
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except tomllib.TOMLDecodeError as exc:
        # A raw decoder error names an offset and no file, which is useless when
        # two layers are in play.
        raise CatalogError(f"invalid TOML: {exc}", location=str(path)) from exc
    except OSError as exc:
        raise CatalogError(f"cannot read catalog file: {exc}", location=str(path)) from exc
    return LayerDocument(layer=layer, origin=str(path), base_dir=path.parent, data=data)
