"""Atomic persistence for package-declared scientific contracts."""

from __future__ import annotations

from importlib.util import find_spec
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import transaction

from helix_core.mod_system.contracts import (
    ContractError,
    authorize_publisher,
    canonical_json,
    contract_fingerprint,
    contract_identity,
    resolve_artifacts,
    validate_dependency_closure,
)


def _package_root(package: str) -> Path:
    spec = find_spec(package)
    locations = spec.submodule_search_locations if spec is not None else None
    if not locations:
        raise ContractError(f"Mod package {package!r} has no installed package directory")
    return Path(next(iter(locations))).resolve()


def collect_contract_batch(
    manifests: dict[str, Any], id_to_path: dict[str, str]
) -> tuple[list[dict[str, Any]], list[tuple[str, str, str]]]:
    """Read and authorize artifacts for every included package, regardless of activation."""
    publishers = getattr(settings, "HELIX_CONTRACT_PUBLISHERS", {})
    delegated_publishers = getattr(settings, "HELIX_CONTRACT_PUBLISHER_PACKAGES", {})
    batch: list[dict[str, Any]] = []
    required: list[tuple[str, str, str]] = []
    for mod_id, manifest in manifests.items():
        package = id_to_path[mod_id]
        artifacts = resolve_artifacts(_package_root(package), manifest.contracts)
        if artifacts:
            authorize_publisher(mod_id, publishers, delegated_publishers)
        for envelope in artifacts:
            if envelope["id"].split(".", 1)[0] != mod_id.split(".", 1)[0]:
                raise ContractError(
                    f"Package {mod_id!r} cannot publish contract namespace {envelope['id']!r}"
                )
            batch.append(envelope)
        required.extend(
            (reference["kind"], reference["id"], reference["version"])
            for reference in manifest.requires_contracts
        )
    identities: dict[tuple[str, str, str], str] = {}
    for envelope in batch:
        identity = contract_identity(envelope)
        fingerprint = contract_fingerprint(envelope)
        if identity in identities and identities[identity] != fingerprint:
            raise ContractError(f"Conflicting contract definitions in package batch: {identity!r}")
        identities[identity] = fingerprint
    return batch, required


def retain_contract_batch(manifests: dict[str, Any], id_to_path: dict[str, str]) -> int:
    """Validate the whole package set, then insert all new contracts atomically."""
    from helix_core.models import ContractRetentionLock, RetainedContract

    batch, required = collect_contract_batch(manifests, id_to_path)
    with transaction.atomic():
        ContractRetentionLock.objects.get_or_create(pk=1)
        ContractRetentionLock.objects.select_for_update().get(pk=1)
        retained = list(RetainedContract.objects.select_for_update().all())
        known = {
            (item.kind, item.contract_id, item.version): item.fingerprint
            for item in retained
        }
        available = set(known)
        available.update(contract_identity(item) for item in batch)
        for dependency in required:
            if dependency not in available:
                raise ContractError(f"Missing exact required contract {dependency!r}")
        # Existing retained rows satisfy dependencies after their supplier is removed.
        from helix_core.mod_system.contracts import parse_contract_json

        validate_dependency_closure(
            batch, [parse_contract_json(item.canonical_envelope) for item in retained]
        )
        additions = []
        for envelope in batch:
            identity = contract_identity(envelope)
            fingerprint = contract_fingerprint(envelope)
            previous = known.get(identity)
            if previous is not None:
                if previous != fingerprint:
                    raise ContractError(f"Contract identity already has a different definition: {identity!r}")
                continue
            known[identity] = fingerprint
            additions.append(RetainedContract(
                kind=identity[0],
                contract_id=identity[1],
                version=identity[2],
                fingerprint=fingerprint,
                canonical_envelope=canonical_json(envelope).decode("utf-8"),
            ))
        RetainedContract.objects.bulk_create(additions)
        return len(additions)


def retained_contract_envelope(kind: str, contract_id: str, version: str) -> tuple[str, str] | None:
    from helix_core.models import RetainedContract

    row = RetainedContract.objects.filter(
        kind=kind, contract_id=contract_id, version=version
    ).first()
    if row is None:
        return None
    return row.canonical_envelope, row.fingerprint
