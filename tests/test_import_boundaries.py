"""The dependency direction of design section 8, enforced here rather than in review.

Modules are parsed, never imported. An import that only happens inside a
function body or under ``if TYPE_CHECKING`` is still an import for the purpose
of this boundary, and importing the tree would not see either.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parent.parent / "src" / "cadenza"

# Section 9: cadenza does not depend on interlock yet, in any spelling. The
# day something under cadenza imports one of these, the build fails here.
FORBIDDEN_TOP_LEVEL = ("claude_org_runtime", "interlock")

# Inward only: adapters -> application -> domain, and ports is depended on.
FORBIDDEN_BY_LAYER = {
    "cadenza.domain": ("cadenza.application", "cadenza.ports", "cadenza.adapters"),
    "cadenza.ports": ("cadenza.application", "cadenza.adapters"),
    "cadenza.application": ("cadenza.adapters",),
}

MINIMUM_MODULES = 10


def module_name(path: Path) -> str:
    relative = path.relative_to(PACKAGE_ROOT.parent).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def imported_modules(path: Path) -> set[str]:
    """Every module name this file imports, with relative imports resolved."""
    package = module_name(path)
    if path.name != "__init__.py":
        package = package.rpartition(".")[0]
    return imports_in_source(path.read_text(encoding="utf-8"), package=package)


def imports_in_source(source: str, *, package: str) -> set[str]:
    tree = ast.parse(source)
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                anchor = package.split(".")
                # level 1 is the containing package, level 2 its parent, and so on.
                anchor = anchor[: len(anchor) - (node.level - 1)] if node.level > 1 else anchor
                base = ".".join([*anchor, base]) if base else ".".join(anchor)
            found.add(base)
            found.update(f"{base}.{alias.name}" for alias in node.names)
    return {name for name in found if name}


def python_files() -> list[Path]:
    return sorted(PACKAGE_ROOT.rglob("*.py"))


MODULES = python_files()


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("import interlock", "interlock"),
        ("import claude_org_runtime.control_plane as cp", "claude_org_runtime.control_plane"),
        ("from cadenza.adapters.toml_catalog import loader", "cadenza.adapters.toml_catalog"),
        ("from ..adapters import toml_catalog", "cadenza.adapters"),
        ("from . import digest", "cadenza.domain.digest"),
        ("def f():\n    import interlock\n", "interlock"),
        (
            "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    import interlock\n",
            "interlock",
        ),
    ],
)
def test_the_detector_sees_imports_wherever_they_hide(source: str, expected: str) -> None:
    # The assertions below are only worth their runtime if this holds: an import
    # nested in a function or in a TYPE_CHECKING block is still an import.
    assert expected in imports_in_source(source, package="cadenza.domain")


def test_the_walk_found_the_package_it_is_supposed_to_guard() -> None:
    # Without this, a renamed src layout would turn every assertion below into
    # a test that vacuously passes over an empty list.
    assert PACKAGE_ROOT.is_dir(), f"package root not found: {PACKAGE_ROOT}"
    assert len(MODULES) >= MINIMUM_MODULES, f"only {len(MODULES)} modules under {PACKAGE_ROOT}"
    assert any(path.name == "clone_source.py" for path in MODULES)


@pytest.mark.parametrize("path", MODULES, ids=module_name)
def test_no_module_imports_interlock(path: Path) -> None:
    offenders = sorted(
        name for name in imported_modules(path) if name.split(".")[0] in FORBIDDEN_TOP_LEVEL
    )
    assert not offenders, f"{module_name(path)} imports {', '.join(offenders)}"


@pytest.mark.parametrize("path", MODULES, ids=module_name)
def test_each_layer_imports_only_inward(path: Path) -> None:
    name = module_name(path)
    for layer, forbidden in FORBIDDEN_BY_LAYER.items():
        if name != layer and not name.startswith(f"{layer}."):
            continue
        offenders = sorted(
            imported
            for imported in imported_modules(path)
            if any(imported == bad or imported.startswith(f"{bad}.") for bad in forbidden)
        )
        assert not offenders, f"{name} may not import {', '.join(offenders)}"


def test_the_reserved_interlock_adapter_seam_exists_and_is_empty() -> None:
    # Section 9: the seam is reserved so the first real integration is a new
    # file in a place already agreed.
    seam = PACKAGE_ROOT / "adapters" / "interlock"
    assert (seam / "__init__.py").is_file()
    assert [path.name for path in sorted(seam.glob("*.py"))] == ["__init__.py"]


@pytest.mark.parametrize("path", MODULES, ids=module_name)
def test_no_module_is_named_core_or_runtime(path: Path) -> None:
    # Those names belong to interlock's vocabulary; reusing them makes a
    # boundary review harder than it needs to be (section 8).
    assert path.stem not in {"core", "runtime"}
    assert path.parent.name not in {"core", "runtime"}


@pytest.mark.parametrize("path", MODULES, ids=module_name)
def test_no_module_says_provider_neutral(path: Path) -> None:
    # One word, so that a boundary reviewer greps for one word (section 1).
    assert "provider-neutral" not in path.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    "path", [p for p in MODULES if module_name(p).startswith("cadenza.domain")], ids=module_name
)
def test_the_domain_performs_no_io(path: Path) -> None:
    # G1 never clones, never touches a network and never reads a working tree.
    # expanduser is the one deliberate exception (it consults $HOME and stats
    # nothing), so os is allowed while these are not.
    forbidden = {"socket", "urllib.request", "subprocess", "shutil", "sqlite3", "http.client"}
    imported = imported_modules(path)
    assert not (imported & forbidden)


def test_no_test_anchors_a_layer_on_a_posix_only_literal() -> None:
    # A drive-less literal like "/srv/catalog" is absolute on POSIX and
    # drive-RELATIVE on Windows, so a test using one passes everywhere except
    # the windows-latest rows -- which is a slow and expensive way to find out.
    # Anchors come from tests/support.absolute() instead. This check exists
    # because reviewing for it by eye missed one twice.
    offenders: list[str] = []
    for path in sorted(Path(__file__).parent.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            for keyword in node.keywords:
                if keyword.arg != "base_dir":
                    continue
                literal = _posix_only_literal(keyword.value)
                if literal is not None:
                    offenders.append(f"{path.name}:{keyword.value.lineno}: {literal!r}")
    assert not offenders, (
        "these anchors are absolute on POSIX only; build them with "
        f"support.absolute() instead: {offenders}"
    )


def _posix_only_literal(node: ast.expr) -> str | None:
    """The string of a `base_dir="/x"` or `base_dir=Path("/x")` literal, if any."""
    if isinstance(node, ast.Call) and _callee_name(node.func) == "Path" and node.args:
        node = node.args[0]
    if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
        return None
    # A relative literal is fine: one test asserts a relative anchor is refused,
    # and that assertion means the same thing on every platform.
    return node.value if node.value.startswith("/") else None


def _callee_name(func: ast.expr) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None
