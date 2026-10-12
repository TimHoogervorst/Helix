"""Discover and order Helix Mods through the package contract."""

from __future__ import annotations

import json
import importlib
from importlib import metadata
from pathlib import Path

from helix_core.mod_system.bundled import BUNDLED_MODS
from helix_core.mod_system.manifest import ModManifest
from helix_core.public import load_entry_point_manifest


def _sanitize_module_name(mod_id: str) -> str:
    """Return the import-safe package name used by an External Mod."""
    return mod_id.replace("-", "_").replace(".", "_")


def discover_python_mod_entry_points() -> dict[str, str]:
    """Return ``helix.mods`` entry points without importing registration code."""
    entries = metadata.entry_points()
    selected = (
        entries.select(group="helix.mods")
        if hasattr(entries, "select")
        else entries.get("helix.mods", [])
        if isinstance(entries, dict)
        else entries
    )
    result: dict[str, str] = {}
    for entry in selected:
        if entry.name in result:
            package = entry.value.split(":", 1)[0]
            if result[entry.name] == package:
                continue
            raise ValueError(f"Duplicate helix.mods entry point '{entry.name}'")
        result[entry.name] = entry.value.split(":", 1)[0]
    return result


def get_helix_mods(
    base_dir: str | Path | None = None,
    helix_mods_override: list[str] | None = None,
) -> list[str]:
    """Discover, validate, and topologically sort package-backed Mods.

    ``base_dir`` is retained as a settings compatibility parameter. External
    discovery is intentionally independent of the repository filesystem.
    ``helix_mods_override`` is a package-name test/deployment seam, not a file
    path loader.
    """
    manifests, id_to_path = _get_all_manifests(
        base_dir=base_dir, helix_mods_override=helix_mods_override
    )
    _validate_manifest_set(manifests)
    return [id_to_path[mod_id] for mod_id in _topological_sort(manifests)]


def _get_all_manifests(
    base_dir: str | Path | None = None,
    helix_mods_override: list[str] | None = None,
) -> tuple[dict[str, ModManifest], dict[str, str]]:
    """Return manifests and import roots for the active package set."""
    del base_dir
    if helix_mods_override is not None:
        return _load_manifests_from_packages(helix_mods_override)

    manifests, id_to_path = _load_manifests_from_packages(BUNDLED_MODS)
    for mod_id, package in discover_python_mod_entry_points().items():
        manifest = load_entry_point_manifest(mod_id, package)
        if manifest.id in manifests:
            if id_to_path[manifest.id] == package:
                continue
            raise ValueError(f"Duplicate mod ID '{manifest.id}' in Python entry points.")
        manifests[manifest.id] = manifest
        id_to_path[manifest.id] = package
    return manifests, id_to_path


def _load_manifests_from_packages(
    packages: list[str],
) -> tuple[dict[str, ModManifest], dict[str, str]]:
    """Read package manifests without importing package registration code."""
    manifests: dict[str, ModManifest] = {}
    paths: dict[str, str] = {}
    for package in packages:
        manifest = _load_package_manifest(package)
        if manifest.id in manifests:
            raise ValueError(f"Duplicate mod ID '{manifest.id}' in package set.")
        manifests[manifest.id] = manifest
        paths[manifest.id] = package
    return manifests, paths


def _load_package_manifest(package: str) -> ModManifest:
    """Read a package-root manifest using import metadata only."""
    # The entry-point helper performs the same side-effect-free package lookup,
    # while an explicit package path has no entry-point name to validate.
    from importlib.util import find_spec
    spec = find_spec(package)
    locations = spec.submodule_search_locations if spec is not None else None
    if not locations:
        raise ImportError(f"Mod package '{package}' could not be found.")
    manifest_path = Path(next(iter(locations))) / "modManifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"Mod package '{package}' is missing modManifest.json")
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid manifest for package '{package}'") from exc
    return ModManifest.from_dict(data)


def _read_json_manifest(mod_dir: Path, mod_id: str) -> ModManifest:
    """Read a manifest file for focused manifest-parser tests."""
    manifest_path = mod_dir / "modManifest.json"
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid manifest at '{manifest_path}'") from exc
    manifest = ModManifest.from_dict(data)
    if manifest.id.rsplit(".", 1)[-1] != mod_id:
        raise ValueError(
            f"Manifest '{manifest.id}' does not match local package name '{mod_id}'."
        )
    return manifest


def _auto_discover(base_dir: str | Path | None) -> dict[str, ModManifest]:
    """Return manifests from installed ``helix.mods`` entry points."""
    del base_dir
    manifests, _ = _auto_discover_with_paths()
    return manifests


def _auto_discover_with_paths() -> tuple[dict[str, ModManifest], dict[str, str]]:
    """Return entry-point manifests and their importable package roots."""
    manifests: dict[str, ModManifest] = {}
    paths: dict[str, str] = {}
    for mod_id, package in sorted(discover_python_mod_entry_points().items()):
        manifest = load_entry_point_manifest(mod_id, package)
        if manifest.id in manifests:
            raise ValueError(f"Duplicate mod ID '{manifest.id}' in entry points.")
        manifests[manifest.id] = manifest
        paths[manifest.id] = package
    return manifests, paths


def _validate_manifest_set(manifests: dict[str, ModManifest]) -> None:
    """Ensure every declared dependency is present."""
    for mod_id, manifest in manifests.items():
        for dependency in manifest.dependency_ids:
            if dependency not in manifests:
                raise ValueError(
                    f"Mod '{mod_id}' depends on '{dependency}', but no mod "
                    "with that id was found."
                )


def _topological_sort(manifests: dict[str, ModManifest]) -> list[str]:
    """Return Mod IDs in deterministic dependency order."""
    in_degree = {mod_id: 0 for mod_id in manifests}
    dependents = {mod_id: [] for mod_id in manifests}
    for mod_id, manifest in manifests.items():
        for dependency in manifest.dependency_ids:
            in_degree[mod_id] += 1
            dependents[dependency].append(mod_id)

    queue = sorted(mod_id for mod_id, degree in in_degree.items() if degree == 0)
    ordered: list[str] = []
    while queue:
        current = queue.pop(0)
        ordered.append(current)
        for dependent in dependents[current]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)
                queue.sort()

    if len(ordered) != len(manifests):
        remaining = sorted(mod_id for mod_id, degree in in_degree.items() if degree > 0)
        raise ValueError(f"Circular dependency detected among mods: {', '.join(remaining)}")
    return ordered
