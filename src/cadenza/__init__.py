"""cadenza - an operations layer over a durable control plane.

The top level stays empty of logic on purpose: importing ``cadenza`` must not
drag in an adapter, so that the import-boundary test can assert direction
(adapters -> application -> domain) without fighting side effects.
"""

from __future__ import annotations

from cadenza.__about__ import __version__

__all__ = ["__version__"]
