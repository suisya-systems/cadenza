"""Filesystem preconditions for a local clone source."""

from __future__ import annotations

from typing import Protocol

from cadenza.domain.clone_source import LocalPathSource


class LocalPathVerifier(Protocol):
    """Checks a ``local_path`` source against a real filesystem.

    The domain contains a path lexically, which keeps catalog data checkable in
    CI on a machine that has none of the operator's disks. Lexical containment
    is not safety: a contained path can still be a symlink pointing anywhere, so
    a run must call a verifier before cloning (design section 3.1). No
    implementation ships in this milestone; the port names the obligation.
    """

    def verify(self, source: LocalPathSource) -> None: ...
