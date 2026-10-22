import json
import importlib
from decimal import Decimal, localcontext

import pytest
from django.apps import apps
from django.db.models.signals import post_migrate
from django.test import override_settings

from helix_core.mod_system.contracts import (
    ContractError,
    authorize_publisher,
    canonical_json,
    contract_fingerprint,
    parse_contract_json,
    resolve_artifacts,
    validate_dependency_closure,
)


def data_contract(**changes):
    result = {
        "formatVersion": 1,
        "kind": "data",
        "id": "acme.sample",
        "version": "1.0.0",
        "description": "Scientific sample",
        "definition": {"type": {"type": "object", "fields": {"value": {"type": "number"}}}},
    }
    result.update(changes)
    return result


def test_canonical_encoding_preserves_exact_decimals_and_order_semantics():
    assert canonical_json({"b": json.loads("1.0", parse_float=__import__("decimal").Decimal), "a": 2}) == b'{"a":2e0,"b":1e0}'
    assert canonical_json({"a": 1}) == canonical_json({"a": 1.0})
    assert canonical_json({"a": __import__("decimal").Decimal("12.3400")}) == b'{"a":1234e-2}'
    assert canonical_json(["a", "b"]) != canonical_json(["b", "a"])
    assert canonical_json({"é": 1}) == '{"é":1e0}'.encode("utf-8")


def test_canonical_encoding_never_rounds_large_decimal_tokens():
    token = Decimal("12345678901234567890123456789012345678901234567890.123456789")
    expected = b'{"value":12345678901234567890123456789012345678901234567890123456789e-9}'

    with localcontext() as context:
        context.prec = 6
        assert canonical_json({"value": token}) == expected


@pytest.mark.parametrize(
    "node",
    [
        {"type": "number", "minimum": "low", "maximum": 5},
        {"type": "number", "minimum": 5, "enum": [4]},
        {"type": "number", "minimum": float("nan")},
        {"type": "number", "minLength": 1},
        {"type": "string", "minLength": "short", "maxLength": 5},
        {"type": "string", "minLength": -1},
        {"type": "string", "minLength": Decimal("NaN")},
        {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 1},
        {"type": "string", "enum": ["ok", 7]},
        {"type": "string", "minLength": 4, "enum": ["abc"]},
        {"type": "variant", "tag": 3, "cases": {"text": {"type": "string"}}},
        {"type": "datetime", "minimum": "2025-01-01T00:00:00", "maximum": "2025-01-02T00:00:00Z"},
    ],
)
def test_malformed_machine_constraints_fail_as_contract_errors(node):
    with pytest.raises(ContractError):
        contract_fingerprint(data_contract(definition={"type": node}))


def test_contract_fingerprint_covers_descriptions_versions_and_definitions():
    original = data_contract()
    assert contract_fingerprint(original) == contract_fingerprint(dict(reversed(list(original.items()))))
    assert contract_fingerprint(original) != contract_fingerprint(data_contract(description="Changed meaning"))
    assert contract_fingerprint(original) != contract_fingerprint(data_contract(version="1.0.1"))
    assert contract_fingerprint(original) != contract_fingerprint(data_contract(definition={"type": {"type": "string"}}))


def test_contract_parser_rejects_duplicate_keys_surrogates_and_unknown_types():
    with pytest.raises(ContractError, match="Duplicate JSON key"):
        parse_contract_json('{"formatVersion":1,"formatVersion":1}')
    invalid_unicode = data_contract(description="\ud800")
    with pytest.raises(ContractError, match="surrogate"):
        contract_fingerprint(invalid_unicode)
    invalid_type = data_contract(definition={"type": {"type": "opaque"}})
    with pytest.raises(ContractError, match="Unsupported contract type"):
        contract_fingerprint(invalid_type)


def test_recursive_contract_dependencies_accept_batch_cycles_and_require_exact_versions():
    one = data_contract(definition={"type": {"type": "contract", "kind": "data", "id": "acme.two", "version": "1.0.0"}})
    two = data_contract(id="acme.two", definition={"type": {"type": "contract", "kind": "data", "id": "acme.sample", "version": "1.0.0"}})
    validate_dependency_closure([one, two])
    with pytest.raises(ContractError, match="Missing exact contract dependency"):
        validate_dependency_closure([one])


def test_contract_publisher_requires_deployment_authority_and_reserves_helix():
    authorize_publisher("acme.publisher", {"acme": "acme.publisher"})
    with pytest.raises(ContractError, match="not authorized"):
        authorize_publisher("acme.impostor", {"acme": "acme.publisher"})
    with pytest.raises(ContractError, match="reserved"):
        authorize_publisher("helix.impostor", {"helix": "helix.timhoogervorst"})
    with pytest.raises(ContractError, match="reserved"):
        authorize_publisher("helix.timhoogervorst", {})
    authorize_publisher("helix.timhoogervorst", {"helix": "helix.timhoogervorst"})


def test_contract_artifacts_cannot_escape_package_root(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text(json.dumps(data_contract()), encoding="utf-8")
    with pytest.raises((ContractError, ValueError)):
        resolve_artifacts(package, ["../outside.json"])


def test_manifest_retains_declared_artifact_paths_and_exact_requirements():
    from helix_core.mod_system.manifest import ModManifest

    manifest = ModManifest.from_dict({
        "id": "acme.sample",
        "displayName": "Sample",
        "version": "1.0.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": ["backend"],
        "dependsOn": [],
        "contracts": ["contracts/sample.json"],
        "requiresContracts": [{"kind": "data", "id": "helix.timhoogervorst.unit", "version": "1.0.0"}],
    })

    assert manifest.contracts == ("contracts/sample.json",)
    assert manifest.requires_contracts == ({"kind": "data", "id": "helix.timhoogervorst.unit", "version": "1.0.0"},)


def _package_batch(tmp_path, contracts):
    from helix_core.mod_system.manifest import ModManifest

    package_name = "fake_contract_provider_689"
    package_dir = tmp_path / package_name
    (package_dir / "contracts").mkdir(parents=True, exist_ok=True)
    (package_dir / "__init__.py").write_text("", encoding="utf-8")
    artifact_paths = []
    for name, contract in contracts.items():
        relative = f"contracts/{name}.json"
        (package_dir / relative).write_text(json.dumps(contract), encoding="utf-8")
        artifact_paths.append(relative)
    importlib.invalidate_caches()
    manifest = ModManifest(
        id="acme.publisher",
        display_name="Publisher",
        version="1.0.0",
        requires_helix=">=1.0.0",
        artifacts=("backend",),
        depends_on=(),
        contracts=tuple(artifact_paths),
    )
    (package_dir / "modManifest.json").write_text(json.dumps({
        "id": manifest.id,
        "displayName": manifest.display_name,
        "version": manifest.version,
        "requiresHelix": manifest.requires_helix,
        "artifacts": list(manifest.artifacts),
        "dependsOn": [],
        "contracts": list(manifest.contracts),
    }), encoding="utf-8")
    return {manifest.id: manifest}, {manifest.id: package_name}


@pytest.mark.django_db(transaction=True)
def test_contract_retention_is_idempotent_and_conflicts_leave_batch_unchanged(tmp_path, monkeypatch):
    from helix_core.models import RetainedContract
    from helix_core.mod_system.retention import retain_contract_batch

    monkeypatch.syspath_prepend(str(tmp_path))
    original = data_contract(id="acme.publisher.unit")
    manifests, paths = _package_batch(tmp_path, {"unit": original})
    with override_settings(HELIX_CONTRACT_PUBLISHERS={"acme": "acme.publisher"}):
        assert retain_contract_batch(manifests, paths) == 1
        row = RetainedContract.objects.get()
        assert retain_contract_batch(manifests, paths) == 0
        assert RetainedContract.objects.get().pk == row.pk

        changed = data_contract(id="acme.publisher.unit", description="Reinterpreted unit")
        manifests, paths = _package_batch(tmp_path, {"unit": changed})
        with pytest.raises(ContractError, match="different definition"):
            retain_contract_batch(manifests, paths)
        assert RetainedContract.objects.count() == 1
        assert RetainedContract.objects.get().fingerprint == row.fingerprint


@pytest.mark.django_db
def test_retained_definition_endpoint_returns_exact_envelope_and_fingerprint(client):
    from django.urls import reverse
    from helix_core.models import ContractRetentionLock, RetainedContract
    from helix_core.mod_system.contracts import canonical_json, contract_fingerprint

    envelope = data_contract(id="acme.publisher.unit")
    fingerprint = contract_fingerprint(envelope)
    RetainedContract.objects.create(
        kind="data",
        contract_id=envelope["id"],
        version=envelope["version"],
        fingerprint=fingerprint,
        canonical_envelope=canonical_json(envelope).decode("utf-8"),
    )
    response = client.get(reverse("retained-contract", args=("data", envelope["id"], "1.0.0")))

    assert response.status_code == 200
    assert response["ETag"] == f'"{fingerprint}"'
    assert json.loads(response.content) == json.loads(canonical_json(envelope))


@pytest.mark.django_db(transaction=True)
def test_post_migrate_retains_contracts_from_the_included_package_set(tmp_path, monkeypatch):
    from helix_core.models import RetainedContract

    monkeypatch.syspath_prepend(str(tmp_path))
    envelope = data_contract(id="acme.publisher.startup")
    manifests, _ = _package_batch(tmp_path, {"startup": envelope})
    with override_settings(
        HELIX_MODS=["fake_contract_provider_689"],
        HELIX_CONTRACT_PUBLISHERS={"acme": "acme.publisher"},
    ):
        app_config = apps.get_app_config("helix_core")
        post_migrate.send(
            sender=app_config.__class__,
            app_config=app_config,
            using="default",
            apps=apps,
            interactive=False,
            verbosity=0,
        )

    row = RetainedContract.objects.get()
    assert (row.kind, row.contract_id, row.version) == ("data", envelope["id"], "1.0.0")


@pytest.mark.django_db(transaction=True)
def test_bad_tenth_artifact_retains_none_of_the_new_batch_and_keeps_prior_rows(tmp_path, monkeypatch):
    from helix_core.models import RetainedContract
    from helix_core.mod_system.retention import retain_contract_batch

    monkeypatch.syspath_prepend(str(tmp_path))
    baseline = data_contract(id="acme.publisher.baseline")
    manifests, paths = _package_batch(tmp_path, {"baseline": baseline})
    with override_settings(HELIX_CONTRACT_PUBLISHERS={"acme": "acme.publisher"}):
        assert retain_contract_batch(manifests, paths) == 1
        contracts = {
            f"unit-{index}": data_contract(id=f"acme.publisher.unit-{index}")
            for index in range(10)
        }
        manifests, paths = _package_batch(tmp_path, contracts)
        bad_path = tmp_path / "fake_contract_provider_689" / "contracts" / "unit-9.json"
        bad_path.write_text('{"formatVersion":1,"formatVersion":1}', encoding="utf-8")

        with pytest.raises(ContractError, match="Duplicate JSON key"):
            retain_contract_batch(manifests, paths)

    assert list(RetainedContract.objects.values_list("contract_id", flat=True)) == ["acme.publisher.baseline"]


@pytest.mark.django_db(transaction=True)
def test_consumer_keeps_exact_dependency_after_supplier_package_is_removed(tmp_path, monkeypatch):
    from helix_core.models import RetainedContract
    from helix_core.mod_system.manifest import ModManifest
    from helix_core.mod_system.retention import retain_contract_batch

    monkeypatch.syspath_prepend(str(tmp_path))
    supplier_contract = data_contract(id="acme.publisher.unit")
    supplier_manifests, supplier_paths = _package_batch(tmp_path, {"unit": supplier_contract})
    consumer_dir = tmp_path / "beta_consumer_689"
    consumer_dir.mkdir()
    (consumer_dir / "__init__.py").write_text("", encoding="utf-8")
    importlib.invalidate_caches()
    consumer = ModManifest(
        id="beta.consumer",
        display_name="Consumer",
        version="1.0.0",
        requires_helix=">=1.0.0",
        artifacts=("backend",),
        depends_on=(),
        requires_contracts=({"kind": "data", "id": supplier_contract["id"], "version": "1.0.0"},),
    )

    with override_settings(HELIX_CONTRACT_PUBLISHERS={"acme": "acme.publisher"}):
        assert retain_contract_batch(supplier_manifests, supplier_paths) == 1
        # The next package set contains only the consumer: retained meaning
        # satisfies the exact dependency after its supplier is absent.
        assert retain_contract_batch({consumer.id: consumer}, {consumer.id: consumer_dir.name}) == 0

    row = RetainedContract.objects.get()
    assert (row.contract_id, row.version) == (supplier_contract["id"], "1.0.0")
