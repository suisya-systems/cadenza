"""Reserved seam for a future interlock adapter.

Cadenza does not depend on interlock: not in ``pyproject.toml``, not in an
extra, not in a module under this package. Interlock's control-plane API and
SQLite schema are marked throwaway on its own side, so importing them now would
turn a deliberate spike into a dependency by inertia.

This package exists so that the first real integration is a new file in a place
already agreed on, and so ``tests/test_import_boundaries.py`` has something
concrete to guard. See docs/design/g1-project-registry.md section 9.
"""
