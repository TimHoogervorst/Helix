"""Build the deterministic, build-time Mod Catalog.

Discovery deliberately reads package metadata and manifests only.  It never
imports a Mod registration module, so catalog generation cannot execute Mod
code or depend on registration order.
"""

from __future__ import annotations

import ast
import hashlib
import importlib.metadata
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

from .manifest import ModManifest
from .imports import scan_forbidden_imports

_CATALOG_VERSION = 1


def build_catalog(
    *,
    bundled_paths: Iterable[str],
    external_entry_points: Iterable[Any] | None = None,
) -> dict[str, Any]:
    """Return a deterministic catalog for bundled and installed Mods.

    ``bundled_paths`` is the closed, repository-owned set.  External Mods are
    discovered from the installed ``helix.mods`` entry-point group.  The
    optional entry-point argument is a test seam and is also useful to build
    tooling that has already queried package metadata.
    """
    records: list[dict[str, Any]] = []
    seen: set[str] = set()

    for dotted_path in sorted(bundled_paths):
        record = _record_from_package(
            package_name=dotted_path,
            locator=dotted_path,
            tier="Bundled",
            distribution=None,
        )
        _add_record(records, seen, record)

    if external_entry_points is None:
        external_entry_points = importlib.metadata.entry_points(group="helix.mods")
    for entry_point in sorted(external_entry_points, key=lambda item: item.name):
        package_name = entry_point.value.split(":", 1)[0]
        record = _record_from_package(
            package_name=package_name,
            locator=entry_point.value,
            tier="External",
            distribution=getattr(entry_point, "dist", None),
            expected_id=entry_point.name,
        )
        _add_record(records, seen, record)

    payload = {"catalogVersion": _CATALOG_VERSION, "mods": records}
    payload["installationFingerprint"] = _fingerprint(payload)
    return payload


def write_catalog(path: str | Path, catalog: dict[str, Any]) -> None:
    """Replace *path* atomically after serializing a validated catalog."""
    validate_catalog(catalog)
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    document = json.dumps(catalog, indent=2, sort_keys=True) + "\n"
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(document)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def validate_catalog(
    catalog: dict[str, Any], *, expected_fingerprint: str | None = None
) -> None:
    """Validate catalog structure and reject a stale installation fingerprint.

    The catalog's own fingerprint detects tampering.  ``expected_fingerprint``
    is supplied by a discovery pass at application/build startup and detects a
    catalog generated for a different installed package set.
    """
    if not isinstance(catalog, dict) or catalog.get("catalogVersion") != _CATALOG_VERSION:
        raise ValueError("Unsupported Mod Catalog version.")
    fingerprint = catalog.get("installationFingerprint")
    if not isinstance(fingerprint, str):
        raise ValueError("Mod Catalog is missing its installation fingerprint.")
    payload = {
        "catalogVersion": catalog["catalogVersion"],
        "mods": catalog.get("mods"),
    }
    if fingerprint != _fingerprint(payload):
        raise ValueError("Mod Catalog installation fingerprint is stale.")
    if expected_fingerprint is not None and fingerprint != expected_fingerprint:
        raise ValueError("Mod Catalog installation fingerprint is stale.")
    records = catalog.get("mods")
    if not isinstance(records, list):
        raise ValueError("Mod Catalog is missing its mods list.")
    ids = [
        record.get("manifest", {}).get("id")
        if isinstance(record, dict)
        else None
        for record in records
    ]
    if any(not isinstance(mod_id, str) for mod_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("Mod Catalog contains duplicate or invalid Mod IDs.")
    known_ids = set(ids)
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("manifest"), dict):
            raise ValueError("Mod Catalog contains an invalid Mod record.")
        manifest = record["manifest"]
        if record.get("tier") not in {"Bundled", "External"}:
            raise ValueError(f"Mod '{manifest['id']}' has an invalid tier.")
        if not isinstance(record.get("artifacts"), dict):
            raise ValueError(f"Mod '{manifest['id']}' has no artifact catalog.")
        if record["tier"] == "Bundled" and manifest.get("dependsOn"):
            raise ValueError(f"Bundled Mod '{manifest['id']}' has dependencies.")
        for dependency in manifest.get("dependsOn", []):
            if dependency["id"] not in known_ids:
                raise ValueError(
                    f"Mod '{manifest['id']}' depends on missing '{dependency['id']}'."
                )


def read_catalog(
    path: str | Path, *, expected_fingerprint: str | None = None
) -> dict[str, Any]:
    """Read and fingerprint-check a generated catalog."""
    catalog_path = Path(path)
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Mod Catalog at '{catalog_path}' is not valid JSON.") from exc
    validate_catalog(catalog, expected_fingerprint=expected_fingerprint)
    return catalog


def generate_catalog(path: str | Path, *, bundled_paths: Iterable[str]) -> dict[str, Any]:
    """Build and atomically publish a deployment catalog."""
    catalog = build_catalog(bundled_paths=bundled_paths)
    write_catalog(path, catalog)
    return catalog


def _record_from_package(
    *,
    package_name: str,
    locator: str,
    tier: str,
    distribution: Any | None,
    expected_id: str | None = None,
) -> dict[str, Any]:
    package_dir = _package_directory(package_name, distribution)
    manifest_path = package_dir / "modManifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"Mod package '{package_name}' has no modManifest.json.")
    try:
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid manifest in '{manifest_path}': {exc}") from exc
    manifest = ModManifest.from_dict(raw_manifest)
    if expected_id is not None and manifest.id != expected_id:
        raise ValueError(
            f"Entry point '{expected_id}' declares manifest id '{manifest.id}'."
        )

    package_metadata = _package_metadata(package_dir)
    distribution_name = getattr(distribution, "name", None) or package_metadata.get("name")
    distribution_version = (
        getattr(distribution, "version", None)
        or package_metadata.get("version")
        or manifest.version
    )
    artifact_hash = _package_hash(package_dir)
    artifacts: dict[str, dict[str, Any]] = {}
    for artifact in sorted(manifest.artifacts):
        artifact_record: dict[str, Any] = {
            "locator": locator if artifact == "backend" else _frontend_locator(package_metadata, package_name),
            "hash": artifact_hash,
            "distribution": distribution_name,
            "distributionVersion": distribution_version,
        }
        if artifact == "backend":
            label = _django_label(package_dir)
            if label is not None:
                artifact_record["djangoLabel"] = label
        else:
            artifact_record["frontendImportSpecifier"] = _frontend_locator(
                package_metadata, package_name
            )
        artifacts[artifact] = artifact_record

    return {
        "manifest": _normalized_manifest(raw_manifest, tier=tier),
        "tier": tier,
        "importViolations": [
            finding.to_dict()
            for finding in scan_forbidden_imports(package_dir, package_name=package_name)
        ],
        "artifacts": artifacts,
    }


def _package_directory(package_name: str, distribution: Any | None) -> Path:
    """Resolve a package without importing it."""
    module_parts = package_name.split(".")
    for root in sys.path:
        if not root:
            continue
        for end in range(len(module_parts), 0, -1):
            candidate = Path(root).joinpath(*module_parts[:end])
            if candidate.is_dir():
                return candidate
    if distribution is not None:
        locate_file = getattr(distribution, "locate_file", None)
        if locate_file is not None:
            for end in range(len(module_parts), 0, -1):
                candidate = Path(locate_file(Path(*module_parts[:end])))
                if candidate.is_dir():
                    return candidate
    raise ImportError(f"Could not locate installed Mod package '{package_name}'.")


def _package_metadata(package_dir: Path) -> dict[str, Any]:
    package_json = package_dir / "package.json"
    if not package_json.is_file():
        return {}
    data = json.loads(package_json.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _frontend_locator(metadata: dict[str, Any], package_name: str) -> str:
    helix = metadata.get("helix")
    if isinstance(helix, dict) and isinstance(helix.get("importSpecifier"), str):
        return helix["importSpecifier"]
    return str(metadata.get("name") or package_name)


def _django_label(package_dir: Path) -> str | None:
    apps_path = package_dir / "apps.py"
    if not apps_path.is_file():
        return None
    tree = ast.parse(apps_path.read_text(encoding="utf-8"), filename=str(apps_path))
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for statement in node.body:
            if isinstance(statement, ast.Assign):
                for target in statement.targets:
                    if isinstance(target, ast.Name) and target.id == "label":
                        if isinstance(statement.value, ast.Constant) and isinstance(statement.value.value, str):
                            return statement.value.value
    for line in apps_path.read_text(encoding="utf-8").splitlines():
        if "name" in line and "=" in line:
            value = line.split("=", 1)[1].strip().strip("\"'")
            if value:
                return value.rsplit(".", 1)[-1]
    return None


def _package_hash(package_dir: Path) -> str:
    digest = hashlib.sha256()
    files = [
        path
        for path in package_dir.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    ]
    for path in sorted(files, key=lambda item: item.relative_to(package_dir).as_posix()):
        relative = path.relative_to(package_dir).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def _normalized_manifest(data: dict[str, Any], *, tier: str) -> dict[str, Any]:
    normalized = dict(data)
    normalized["artifacts"] = sorted(data["artifacts"])
    # Bundled membership is deployment truth.  Bundled Mods are already part
    # of the platform graph and therefore never advertise Mod dependencies in
    # the catalog, including stale author-era dependencies on External Mods.
    normalized["dependsOn"] = [] if tier == "Bundled" else sorted(
        (dict(dependency) for dependency in data["dependsOn"]),
        key=lambda dependency: (dependency["id"], dependency["version"]),
    )
    return normalized


def _fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _add_record(records: list[dict[str, Any]], seen: set[str], record: dict[str, Any]) -> None:
    mod_id = record["manifest"]["id"]
    if mod_id in seen:
        raise ValueError(f"Duplicate Mod ID '{mod_id}' in installation.")
    seen.add(mod_id)
    records.append(record)
    records.sort(key=lambda item: item["manifest"]["id"])
