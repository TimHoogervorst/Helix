"""Mod loader — auto-discovery, topological sort, dependency validation.

The loader function ``get_helix_mods()`` is the entry point called from
``settings.py`` to build the ``INSTALLED_APPS`` list dynamically.  It discovers
mod manifests, validates the dependency graph, topologically sorts mods
(Kahn's algorithm), and returns dotted-path strings.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from helix_core.mod_system.manifest import ModManifest


def get_helix_mods(
    base_dir: str | Path | None = None,
    helix_mods_override: list[str] | None = None,
) -> list[str]:
    """Discover, validate, and topologically sort mod manifests.

    Returns dotted-path strings suitable for ``INSTALLED_APPS``
    (e.g. ``["core_mods.tags", "core_mods.eln"]``).

    If *helix_mods_override* is provided, only those dotted paths are loaded
    and auto-discovery is skipped.  When it is ``None`` (the default),
    all ``core_mods/*/mod.py`` files under *base_dir* are auto-discovered.

    Parameters:
        base_dir: The project root directory that contains ``core_mods/``.
            Pass ``settings.BASE_DIR``.  Required for auto-discovery.
        helix_mods_override: Explicit list of dotted mod paths (e.g.
            ``["core_mods.eln", "core_mods.lims"]``).  When set, only
            these mods are loaded — auto-discovery is bypassed.

    Returns:
        Dotted-path strings in topological order (dependencies before
        dependents).

    Raises:
        ImportError: A mod path referenced in *helix_mods_override* cannot
            be imported or has no valid manifest.
        TypeError: A ``mod.py`` has a ``manifest`` that is not a
            ``ModManifest`` instance.
        ValueError: The dependency graph has a cycle, a missing dependency,
            a duplicated mod ID, or a mod ``id`` that doesn't match its
            directory name.
    """
    if helix_mods_override is not None:
        manifests = _load_manifests_from_paths(helix_mods_override)
    else:
        manifests = _auto_discover(base_dir)

    _validate_manifest_set(manifests)
    sorted_ids = _topological_sort(manifests)

    return [f"core_mods.{mod_id}" for mod_id in sorted_ids]


# ── discovery ────────────────────────────────────────────────────────────────


def _auto_discover(
    base_dir: str | Path | None,
) -> dict[str, ModManifest]:
    """Find all ``core_mods/*/mod.py`` files and load their manifests.

    Args:
        base_dir: The project root directory containing ``core_mods/``.

    Returns:
        Dict mapping mod IDs to their manifests.  Returns an empty dict
        if the ``core_mods/`` directory does not exist.

    Raises:
        ImportError: If a ``mod.py`` cannot be imported.
        TypeError: If a ``mod.py`` has a ``manifest`` that is not a
            ``ModManifest`` instance.
        ValueError: If a manifest's ``id`` does not match its directory name.
    """
    if base_dir is None:
        raise ValueError(
            "base_dir is required for auto-discovery. "
            "Pass settings.BASE_DIR."
        )

    core_mods_dir = Path(base_dir) / "core_mods"

    manifests: dict[str, ModManifest] = {}

    if not core_mods_dir.is_dir():
        return manifests

    for entry in sorted(core_mods_dir.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name.startswith("_"):
            continue
        mod_py = entry / "mod.py"
        if not mod_py.is_file():
            continue
        manifest = _import_manifest(mod_py, entry.name)
        manifests[entry.name] = manifest

    return manifests


def _load_manifests_from_paths(
    paths: list[str],
) -> dict[str, ModManifest]:
    """Load manifests from an explicit list of mod dotted paths.

    Each dotted path is resolved against ``sys.path`` entries to find the
    package directory, then the ``mod.py`` inside it is loaded via
    ``importlib.util`` (the same mechanism as ``_import_manifest``).
    This avoids ``importlib.import_module`` so that the real ``sys.modules``
    cache does not interfere — important for testing with temp directories.

    Args:
        paths: Dotted module paths (e.g. ``["core_mods.eln"]``).

    Returns:
        Dict mapping mod IDs to their manifests.

    Raises:
        ImportError: If a dotted path cannot be resolved to a filesystem
            directory, or the ``mod.py`` inside it cannot be loaded or
            has no valid ``manifest``.
        TypeError: If a ``mod.py`` has a ``manifest`` that is not a
            ``ModManifest`` instance.
        ValueError: If a manifest's ``id`` does not match its directory name.
    """
    manifests: dict[str, ModManifest] = {}

    for dotted_path in paths:
        mod_id = dotted_path.split(".")[-1]

        if mod_id in manifests:
            raise ValueError(
                f"Duplicate mod ID '{mod_id}' in HELIX_MODS. "
                f"Each mod may only appear once."
            )

        path_parts = dotted_path.split(".")

        # Resolve the dotted path to a filesystem directory by searching
        # sys.path entries.
        mod_dir: Path | None = None
        for sys_path_entry in sys.path:
            if not sys_path_entry:
                continue
            candidate = Path(sys_path_entry).joinpath(*path_parts)
            if candidate.is_dir():
                mod_dir = candidate
                break

        if mod_dir is None:
            raise ImportError(
                f"HELIX_MODS references '{dotted_path}', but the package "
                f"directory could not be found on sys.path."
            )

        mod_py = mod_dir / "mod.py"
        if not mod_py.is_file():
            raise ImportError(
                f"HELIX_MODS references '{dotted_path}', but "
                f"'{mod_py}' does not exist."
            )

        manifest = _import_manifest(mod_py, mod_id)
        manifests[mod_id] = manifest

    return manifests


def _import_manifest(mod_py_path: Path, mod_id: str) -> ModManifest:
    """Import a ``mod.py`` file from disk and return its ``manifest``.

    Uses ``importlib.util`` to load the module without polluting
    ``sys.modules`` with the canonical ``core_mods.<id>.mod`` name.
    Instead it uses a unique, test-safe module name.

    Args:
        mod_py_path: Absolute path to the ``mod.py`` file.
        mod_id: Expected mod ID (directory name).

    Returns:
        The parsed ``ModManifest`` instance.

    Raises:
        ImportError: If the file cannot be loaded or has no ``manifest``.
        TypeError: If ``manifest`` is not a ``ModManifest`` instance.
        ValueError: If the manifest's ``id`` does not match *mod_id*.
    """
    # Use a namespaced module name so tests can create mods in temp dirs
    # without colliding with real core_mods.
    module_name = f"_helix_loader.core_mods.{mod_id}.mod"
    spec = importlib.util.spec_from_file_location(module_name, str(mod_py_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load spec for {mod_py_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    manifest = getattr(module, "manifest", None)
    if manifest is None:
        raise ImportError(f"{mod_py_path} does not define a 'manifest'.")
    if not isinstance(manifest, ModManifest):
        raise TypeError(
            f"{mod_py_path} has a 'manifest' that is not a ModManifest "
            f"instance (got {type(manifest).__name__})."
        )
    if manifest.id != mod_id:
        raise ValueError(
            f"Mod at '{mod_py_path}' declares id '{manifest.id}' but "
            f"expected id '{mod_id}' (must match directory name)."
        )

    return manifest


# ── validation ───────────────────────────────────────────────────────────────


def _validate_manifest_set(manifests: dict[str, ModManifest]) -> None:
    """Validate a complete set of manifests.

    Checks that every ``depends_on`` entry resolves to a known mod ID.

    Args:
        manifests: Dict mapping mod IDs to their manifests.

    Raises:
        ValueError: If a dependency references a non-existent mod.
    """
    for mod_id, manifest in manifests.items():
        for dep in manifest.depends_on:
            if dep not in manifests:
                raise ValueError(
                    f"Mod '{mod_id}' depends on '{dep}', but no mod "
                    f"with that id was found."
                )


# ── topological sort ─────────────────────────────────────────────────────────


def _topological_sort(manifests: dict[str, ModManifest]) -> list[str]:
    """Topologically sort mods using Kahn's algorithm.

    Returns mod IDs in dependency order (dependencies before dependents).
    Sorting of nodes at equal depth is deterministic (alphabetical).

    Args:
        manifests: Dict mapping mod IDs to their manifests.

    Returns:
        Mod IDs sorted in topological order.

    Raises:
        ValueError: If a circular dependency is detected.  The message
            lists the mod IDs that participate in the cycle.
    """
    # Build in-degree and adjacency maps.
    in_degree: dict[str, int] = {mod_id: 0 for mod_id in manifests}
    dependents: dict[str, list[str]] = {mod_id: [] for mod_id in manifests}

    for mod_id, manifest in manifests.items():
        for dep in manifest.depends_on:
            in_degree[mod_id] += 1
            dependents[dep].append(mod_id)

    # Start with all nodes that have zero in-degree (no dependencies).
    queue = [mod_id for mod_id, deg in in_degree.items() if deg == 0]
    queue.sort()  # deterministic ordering at equal depth

    sorted_ids: list[str] = []

    while queue:
        current = queue.pop(0)
        sorted_ids.append(current)

        for dependent in dependents[current]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)
                queue.sort()

    if len(sorted_ids) != len(manifests):
        # Nodes still with in-degree > 0 are in a cycle.
        remaining = sorted(
            mod_id for mod_id, deg in in_degree.items() if deg > 0
        )
        raise ValueError(
            f"Circular dependency detected among mods: "
            f"{', '.join(remaining)}"
        )

    return sorted_ids
