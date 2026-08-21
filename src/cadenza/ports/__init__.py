"""Protocols the outside world implements.

Ports are depended on and depend on nothing but the domain, so an adapter can
be swapped without touching composition or resolution. See
docs/design/g1-project-registry.md section 8.
"""

from cadenza.ports.catalog_source import CatalogSource, LayerDocument
from cadenza.ports.path_verifier import LocalPathVerifier

__all__ = ["CatalogSource", "LayerDocument", "LocalPathVerifier"]
