"""Where raw layer documents come from."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class LayerDocument:
    """One layer file, parsed but not yet validated.

    ``base_dir`` travels with the document because a relative ``local_path`` is
    anchored to the directory of the file that declared it, never to the process
    CWD (design section 3.1).

    That anchor must itself be absolute, and this class refuses a relative one
    rather than trusting its callers. A relative anchor would make the anchored
    path relative too, so the run-side consumer would re-anchor it against
    whatever CWD it happened to have -- the exact behaviour section 3.1 forbids,
    reached one level up. It would also make ``config_digest`` depend on the
    directory cadenza was invoked from, which section 4 says it must not.
    Resolving the anchor is the job of whoever knows where the file was found.
    """

    layer: str
    origin: str
    base_dir: Path
    data: Mapping[str, object]

    def __post_init__(self) -> None:
        if not self.base_dir.is_absolute():
            raise ValueError(
                f"base_dir must be absolute, got {str(self.base_dir)!r}; "
                f"a relative anchor would be re-anchored to the process CWD"
            )


class CatalogSource(Protocol):
    """Yields layer documents in precedence order, lowest first."""

    def load(self) -> Sequence[LayerDocument]: ...
