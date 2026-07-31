"""Mod loader — auto-discovery, topological sort, dependency validation.

The loader function ``get_helix_mods()`` is the entry point called from
``settings.py`` to build the ``INSTALLED_APPS`` list dynamically.  It discovers
mod manifests, validates the dependency graph, topologically sorts mods
(Kahn's algorithm), and returns dotted-path strings.

External mods can be declared via a ``helix.mods.json`` file at the project
root.  The JSON format is::

    {
      "mods": [
        { "path": "./external_mods/my-plugin/mod.py" }
      ]
    }

Each ``path`` is relative to the project root and must point to a ``mod.py``
file whose parent directory is a Python package (contains ``__init__.py``).
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

from helix_core.mod_system.manifest import ModManifest


def get_helix_mods(
    base_dir: str | Path | None = None,
    helix_mods_override: list[str] | None = None,
) -> list[str]:
    """Discover, validate, and topologically sort mod manifests.

    Returns dotted-path strings suitable for ``INSTALLED_APPS``
    (e.g. ``["mods.tags", "mods.eln"]``).

    If *helix_mods_override* is provided, only those dotted paths are loaded
    and auto-discovery is skipped.  When it is ``None`` (the default),
    all ``mods/*/mod.py`` files under *base_dir* are auto-discovered.

    Parameters:
        base_dir: The project root directory (e.g. ``settings.BASE_DIR``).
            Auto-discovery looks in ``base_dir.parent / "mods"``.
        helix_mods_override: Explicit list of dotted mod paths (e.g.
            ``["mods.eln", "mods.lims"]``).  When set, only
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
    manifests, id_to_path = _get_all_manifests(base_dir, helix_mods_override)

    _validate_manifest_set(manifests)
    sorted_ids = _topological_sort(manifests)

    return [id_to_path[mod_id] for mod_id in sorted_ids]


def _get_all_manifests(
    base_dir: str | Path | None = None,
    helix_mods_override: list[str] | None = None,
) -> tuple[dict[str, ModManifest], dict[str, str]]:
    """Discover all mod manifests (core + external) and build path mappings.

    Returns a tuple ``(manifests, id_to_path)`` where *manifests* maps
    mod IDs to their ``ModManifest`` and *id_to_path* maps each mod ID
    to its dotted path for ``INSTALLED_APPS``.

    This is the single call site for manifest discovery — used by both
    ``get_helix_mods()`` and ``HelixCoreConfig.ready()`` to avoid
    redundant JSON I/O and duplicate validation.
    """
    if helix_mods_override is not None:
        manifests = _load_manifests_from_paths(helix_mods_override)
    else:
        manifests = _auto_discover(base_dir)

    # Build dotted-path mapping for core mods.
    id_to_path: dict[str, str] = {
        mod_id: f"mods.{mod_id}" for mod_id in manifests
    }

    # ── external mods (helix.mods.json) ──────────────────────────────────
    external_mods = _load_external_mods_from_json(base_dir)

    # Detect duplicate IDs between core and external mods.
    for ext_id, (ext_manifest, ext_path) in external_mods.items():
        if ext_id in manifests:
            raise ValueError(
                f"Duplicate mod ID '{ext_id}': declared in "
                f"helix.mods.json but a mod with that id already "
                f"exists in mods/."
            )
        manifests[ext_id] = ext_manifest
        id_to_path[ext_id] = ext_path

    return manifests, id_to_path


# ── discovery ────────────────────────────────────────────────────────────────


def _load_manifest_from_dir(mod_dir: Path, mod_id: str) -> ModManifest | None:
    """Load a manifest from a mod directory, preferring ``modManifest.json``.

    Checks for ``modManifest.json`` first; if that file exists its contents
    are parsed via ``_read_json_manifest``.  Otherwise falls back to
    ``mod.py`` via ``_import_manifest``.  Returns ``None`` when neither
    manifest source exists in the directory.

    This is the single implementation of the JSON-first resolution policy.
    Every discovery path routes through this helper so the preference rule
    lives in exactly one place.

    Args:
        mod_dir: Absolute path to the mod directory.
        mod_id: Expected mod ID (directory name).

    Returns:
        The parsed ``ModManifest``, or ``None`` if neither source exists.
    """
    json_path = mod_dir / "modManifest.json"
    if json_path.is_file():
        return _read_json_manifest(mod_dir, mod_id)
    mod_py = mod_dir / "mod.py"
    if mod_py.is_file():
        return _import_manifest(mod_py, mod_id)
    return None


def _auto_discover(
    base_dir: str | Path | None,
) -> dict[str, ModManifest]:
    """Find all ``mods/*/mod.py`` files and load their manifests.

    Args:
        base_dir: The project root directory (e.g. ``settings.BASE_DIR``).
            Auto-discovery looks in ``base_dir.parent / "mods"``.

    Returns:
        Dict mapping mod IDs to their manifests.  Returns an empty dict
        if the ``mods/`` directory does not exist.

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

    mod_dir = Path(base_dir).parent / "mods"

    manifests: dict[str, ModManifest] = {}

    if not mod_dir.is_dir():
        return manifests

    # Ensure the mods package is importable by adding its parent directory
    # to sys.path.  Mirrors the same insertion in
    # _load_external_mods_from_json so that core mods and external mods
    # follow the same import-resolution rule.  Resolved paths are compared
    # to avoid duplicate entries that would confuse Django's app loader.
    mods_parent = str(mod_dir.parent.resolve())
    existing_resolved = {str(Path(p).resolve()) for p in sys.path if p}
    if mods_parent not in existing_resolved:
        sys.path.insert(0, mods_parent)

    for entry in sorted(mod_dir.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name.startswith("_"):
            continue
        manifest = _load_manifest_from_dir(entry, entry.name)
        if manifest is None:
            continue
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
        paths: Dotted module paths (e.g. ``["mods.eln"]``).

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

        manifest = _load_manifest_from_dir(mod_dir, mod_id)
        if manifest is None:
            raise ImportError(
                f"HELIX_MODS references '{dotted_path}', but "
                f"neither 'modManifest.json' nor 'mod.py' "
                f"exist in '{mod_dir}'."
            )
        manifests[mod_id] = manifest

    return manifests


def _load_external_mods_from_json(
    base_dir: str | Path | None,
) -> dict[str, tuple[ModManifest, str]]:
    """Load external mods declared in ``helix.mods.json``.

    Reads ``<base_dir>/helix.mods.json`` and processes each entry.  Each entry
    must have a ``"path"`` key pointing to a ``mod.py`` file relative to
    *base_dir*.  The mod's parent directory is added to ``sys.path`` so that
    Django can import it via ``INSTALLED_APPS``.

    Args:
        base_dir: The project root directory where ``helix.mods.json`` lives.

    Returns:
        A dict mapping mod IDs to ``(ModManifest, dotted_path)`` tuples.
        Returns an empty dict if the JSON file does not exist or has no mods.

    Raises:
        FileNotFoundError: If a declared ``mod.py`` path does not exist.
        ImportError: If a ``mod.py`` cannot be imported or has no ``manifest``.
        TypeError: If a ``manifest`` is not a ``ModManifest`` instance.
        ValueError: If a ``manifest.id`` does not match the directory name,
            or if the JSON is malformed.
    """
    if base_dir is None:
        return {}

    json_path = Path(base_dir) / "helix.mods.json"
    if not json_path.is_file():
        return {}

    with open(json_path, "r", encoding="utf-8") as fh:
        try:
            data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"helix.mods.json at {json_path} is not valid JSON: {exc}"
            ) from exc

    if not isinstance(data, dict) or "mods" not in data:
        raise ValueError(
            f"helix.mods.json at {json_path} must be a JSON object "
            f"with a 'mods' key."
        )

    entries = data["mods"]
    if not isinstance(entries, list):
        raise ValueError(
            f"helix.mods.json 'mods' must be a list, "
            f"got {type(entries).__name__}."
        )

    result: dict[str, tuple[ModManifest, str]] = {}

    for i, entry in enumerate(entries):
        if not isinstance(entry, dict) or "path" not in entry:
            raise ValueError(
                f"helix.mods.json mods[{i}] must be an object "
                f"with a 'path' key."
            )

        raw_path = entry["path"]
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError(
                f"helix.mods.json mods[{i}].path must be a "
                f"non-empty string."
            )

        # Resolve the path relative to the project root.
        mod_py_path = (Path(base_dir) / raw_path).resolve()

        if not mod_py_path.is_file():
            raise FileNotFoundError(
                f"helix.mods.json mods[{i}] references "
                f"'{raw_path}' — resolved to '{mod_py_path}' which "
                f"does not exist."
            )

        # The mod package is the directory containing mod.py.
        mod_dir = mod_py_path.parent

        # Ensure the mod package is importable as a Python module.
        if not (mod_dir / "__init__.py").is_file():
            raise ImportError(
                f"External mod at '{mod_dir}' must be a Python "
                f"package — it needs an __init__.py file."
            )

        mod_id = mod_dir.name
        # Sanitize for Python identifier (hyphens → underscores).
        dotted_path = _sanitize_module_name(mod_id)

        # Add the parent to sys.path so Django can import the package.
        parent = str(mod_dir.parent)
        if parent not in sys.path:
            sys.path.insert(0, parent)

        # Load the manifest — prefer modManifest.json when present.
        manifest = _load_manifest_from_dir(mod_dir, mod_id)
        if manifest is None:
            raise ImportError(
                f"External mod at '{mod_dir}' has neither "
                f"modManifest.json nor mod.py."
            )
        result[mod_id] = (manifest, dotted_path)

    return result


def _sanitize_module_name(name: str) -> str:
    """Convert a directory name to a valid Python module name.

    Replaces hyphens and other non-identifier characters with underscores,
    then strips leading/trailing underscores.  If the result starts with
    a digit, a leading underscore is prepended.
    """
    sanitized = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    sanitized = sanitized.strip("_")
    if not sanitized:
        raise ValueError(
            f"Cannot derive a valid Python module name from '{name}'."
        )
    if sanitized[0].isdigit():
        sanitized = "_" + sanitized
    return sanitized


def _read_json_manifest(mod_dir: Path, mod_id: str) -> ModManifest:
    """Read a ``modManifest.json`` file from a mod directory.

    Parses the JSON and constructs a ``ModManifest`` instance.  This is the
    JSON counterpart to ``_import_manifest`` — use it when a mod directory
    contains a ``modManifest.json`` file instead of (or in addition to) a
    ``mod.py`` with a ``manifest`` variable.

    The JSON format uses camelCase keys matching the frontend schema::

        {
          "id": "eln",
          "displayName": "Electronic Lab Notebook",
          "version": "0.1.0",
          "dependsOn": ["lims", "tags"]
        }

    Object-form dependencies are also supported::

        {
          "dependsOn": [
            "lims",
            {"id": "tags", "version": ">=2.0"}
          ]
        }

    Args:
        mod_dir: Absolute path to the mod directory.
        mod_id: Expected mod ID (directory name).

    Returns:
        The parsed ``ModManifest`` instance.

    Raises:
        FileNotFoundError: If ``modManifest.json`` does not exist in *mod_dir*.
        ValueError: If the JSON is malformed, missing required fields, or
            the ``id`` does not match *mod_id*.
        TypeError: If any field has the wrong type (delegates to
            ``ModManifest.__post_init__``).
    """
    json_path = mod_dir / "modManifest.json"
    if not json_path.is_file():
        raise FileNotFoundError(
            f"modManifest.json not found at {json_path}"
        )

    with open(json_path, "r", encoding="utf-8") as fh:
        try:
            data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"modManifest.json at {json_path} is not valid JSON: {exc}"
            ) from exc

    if not isinstance(data, dict):
        raise ValueError(
            f"modManifest.json at {json_path} must be a JSON object, "
            f"got {type(data).__name__}"
        )

    # Validate required fields before constructing ModManifest.
    # The frontend manifest format uses "vendor" + "name" (e.g.
    # "helix.eln") instead of a single "id" field.  When "id" is
    # missing, use "name" as the id (the short directory-scoped name).
    if "id" not in data:
        if "name" in data:
            data["id"] = data["name"]
        else:
            raise ValueError(
                f"modManifest.json at {json_path} is missing required "
                f"field 'id' (or 'name')"
            )
    if "displayName" not in data:
        raise ValueError(
            f"modManifest.json at {json_path} is missing required "
            f"field 'displayName'"
        )

    # Normalize dependsOn entries: the frontend format uses fully-qualified
    # "vendor.name" strings (e.g. "helix.lims"), but the backend resolves
    # dependencies by the short mod ID (the directory name).  Strip the
    # vendor prefix so validation passes against the mod directory keys.
    raw_depends_on = data.get("dependsOn", [])
    if isinstance(raw_depends_on, list):
        normalized_depends_on: list[str | dict[str, str]] = []
        for dep in raw_depends_on:
            if isinstance(dep, str):
                # "helix.lims" → "lims"
                normalized_depends_on.append(dep.rsplit(".", 1)[-1])
            elif isinstance(dep, dict):
                dep_copy = dict(dep)
                if "id" in dep_copy:
                    dep_copy["id"] = dep_copy["id"].rsplit(".", 1)[-1]
                normalized_depends_on.append(dep_copy)
            else:
                normalized_depends_on.append(dep)
    else:
        normalized_depends_on = raw_depends_on

    # Map camelCase JSON keys to snake_case ModManifest kwargs.
    manifest = ModManifest(
        id=data["id"],
        display_name=data["displayName"],
        version=data.get("version"),
        depends_on=normalized_depends_on,
        core_version=data.get("coreVersion"),
        icon=data.get("icon"),
        description=data.get("description"),
    )

    if manifest.id != mod_id:
        raise ValueError(
            f"modManifest.json at '{json_path}' declares id "
            f"'{manifest.id}' but expected id '{mod_id}' "
            f"(must match directory name)."
        )

    return manifest


def _import_manifest(mod_py_path: Path, mod_id: str) -> ModManifest:
    """Import a ``mod.py`` file from disk and return its ``manifest``.

    Uses ``importlib.util`` to load the module without polluting
    ``sys.modules`` with the canonical ``mods.<id>.mod`` name.
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
    # without colliding with real mods.
    module_name = f"_helix_loader.mods.{mod_id}.mod"
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
        for dep in manifest.dependency_ids:
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
        for dep in manifest.dependency_ids:
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
