"""Make ``cadenza`` importable from a plain checkout.

CI installs the package before running pytest; a developer running ``pytest``
in a fresh clone has not. Prepending ``src`` only when the import fails keeps an
installed cadenza the one under test whenever there is one.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:  # pragma: no cover - depends on whether the package is installed
    import cadenza  # noqa: F401
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
