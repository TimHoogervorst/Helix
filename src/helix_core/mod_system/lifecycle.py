"""Persistence and atomic administration of Mod lifecycle state."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from helix_core.models import ModInstallation, ModLifecycleAction
from helix_core.mod_system.manifest import ModManifest


ModLifecycleState = ModInstallation.State


class ModLifecycleError(ValueError):
    """Raised when a requested lifecycle graph cannot be made valid."""


def sync_mod_installations(
    manifests: dict[str, Any],
    paths: dict[str, str],
    *,
    bundled_ids: set[str] | None = None,
) -> None:
    """Reconcile discovered manifests without activating new External Mods."""
    bundled_ids = bundled_ids or set()
    with transaction.atomic():
        discovered = set(manifests)
        for mod_id, raw_manifest in manifests.items():
            manifest = (
                ModManifest.from_dict(raw_manifest)
                if isinstance(raw_manifest, dict)
                else raw_manifest
            )
            bundled = mod_id in bundled_ids
            defaults = {
                "display_name": manifest.display_name,
                "version": manifest.version,
                "requires_helix": manifest.requires_helix,
                "artifacts": list(manifest.artifacts),
                "dependencies": [
                    {"id": dependency.id, "version": dependency.version}
                    for dependency in manifest.depends_on
                ],
                "tier": "Bundled" if bundled else "External",
                "locator": paths.get(mod_id, ""),
                "manifest": {
                    "id": manifest.id,
                    "displayName": manifest.display_name,
                    "version": manifest.version,
                    "requiresHelix": manifest.requires_helix,
                    "artifacts": list(manifest.artifacts),
                    "dependsOn": [
                        {"id": dependency.id, "version": dependency.version}
                        for dependency in manifest.depends_on
                    ],
                },
            }
            installation, created = ModInstallation.objects.get_or_create(
                mod_id=mod_id,
                defaults={
                    **defaults,
                    "state": (
                        ModLifecycleState.ACTIVE
                        if bundled
                        else ModLifecycleState.INACTIVE
                    ),
                    "desired_state": (
                        ModLifecycleState.ACTIVE
                        if bundled
                        else ModLifecycleState.INACTIVE
                    ),
                },
            )
            if not created:
                for field, value in defaults.items():
                    setattr(installation, field, value)
                if installation.state == ModLifecycleState.REMOVED:
                    installation.state = ModLifecycleState.INACTIVE
                    installation.desired_state = ModLifecycleState.INACTIVE
                installation.save()

        ModInstallation.objects.exclude(mod_id__in=discovered).filter(
            state__in=[
                ModLifecycleState.INSTALLED,
                ModLifecycleState.INACTIVE,
                ModLifecycleState.ACTIVE,
            ]
        ).update(
            state=ModLifecycleState.REMOVED,
            desired_state=ModLifecycleState.INACTIVE,
        )


def activate_mod(mod_id: str, performed_by, *, activate_dependencies: bool = True) -> set[str]:
    """Set a Mod and its dependency closure active, pending restart."""
    with transaction.atomic():
        installations = _locked_installations()
        target = _require_available(installations, mod_id)
        changed = {mod_id}
        if activate_dependencies:
            changed.update(_dependency_closure(installations, mod_id))
        _validate_active_graph(installations, changed)
        _set_desired(installations, changed, ModLifecycleState.ACTIVE)
        _log_change(target, performed_by, "activated", changed)
        return changed


def deactivate_mod(mod_id: str, performed_by, *, cascade: bool = False) -> set[str]:
    """Set a Mod inactive, optionally cascading through active dependents."""
    with transaction.atomic():
        installations = _locked_installations()
        target = _require_available(installations, mod_id)
        dependents = _dependent_closure(installations, mod_id)
        if dependents and not cascade:
            names = ", ".join(sorted(dependents))
            raise ModLifecycleError(f"Active dependents require a cascade: {names}")
        changed = {mod_id, *dependents} if cascade else {mod_id}
        _set_desired(installations, changed, ModLifecycleState.INACTIVE)
        _log_change(target, performed_by, "deactivated", changed)
        return changed


def validate_persisted_activation(installations: dict[str, ModInstallation]) -> None:
    """Fail fast when persisted desired activation is no longer a valid graph."""
    active = {
        mod_id
        for mod_id, installation in installations.items()
        if installation.desired_state == ModLifecycleState.ACTIVE
    }
    _validate_active_graph(installations, active)


def apply_persisted_activation() -> None:
    """Apply desired state at process startup after the graph is validated."""
    installations = _locked_installations()
    validate_persisted_activation(installations)
    for installation in installations.values():
        if installation.state != ModLifecycleState.REMOVED:
            installation.state = installation.desired_state
            installation.save(update_fields=["state", "updated_at"])


def _locked_installations() -> dict[str, ModInstallation]:
    return {
        installation.mod_id: installation
        for installation in ModInstallation.objects.select_for_update().all()
    }


def _require_available(installations, mod_id):
    installation = installations.get(mod_id)
    if installation is None or installation.state == ModLifecycleState.REMOVED:
        raise ModLifecycleError(f"Mod '{mod_id}' is not installed.")
    return installation


def _dependency_closure(installations, mod_id):
    closure: set[str] = set()
    pending = list(installations[mod_id].dependencies)
    while pending:
        dependency_id = pending.pop()["id"]
        if dependency_id in closure:
            continue
        dependency = _require_available(installations, dependency_id)
        closure.add(dependency_id)
        pending.extend(dependency.dependencies)
    return closure


def _dependent_closure(installations, mod_id):
    dependents: set[str] = set()
    pending = [mod_id]
    while pending:
        current = pending.pop()
        for installation in installations.values():
            if (
                installation.mod_id not in dependents
                and current in {item["id"] for item in installation.dependencies}
                and installation.desired_state == ModLifecycleState.ACTIVE
            ):
                dependents.add(installation.mod_id)
                pending.append(installation.mod_id)
    return dependents


def _validate_active_graph(installations, activating):
    active = {
        mod_id
        for mod_id, installation in installations.items()
        if installation.desired_state == ModLifecycleState.ACTIVE
    } | activating
    for mod_id in active:
        installation = _require_available(installations, mod_id)
        missing = [
            dependency["id"]
            for dependency in installation.dependencies
            if dependency["id"] not in active
        ]
        if missing:
            raise ModLifecycleError(
                f"Activating '{mod_id}' requires inactive dependencies: {', '.join(missing)}"
            )


def _set_desired(installations, mod_ids, desired_state):
    for mod_id in mod_ids:
        _require_available(installations, mod_id).desired_state = desired_state
    for mod_id in mod_ids:
        installations[mod_id].save(update_fields=["desired_state", "updated_at"])


def _log_change(target, performed_by, verb, changed):
    ModLifecycleAction.objects.create(
        performed_by=performed_by,
        action=f"helix.platform.mod.{verb}",
        action_type="edited",
        target_type="helix.mod",
        target_id=target.pk,
        metadata={"modIds": sorted(changed), "restartRequired": True},
    )
