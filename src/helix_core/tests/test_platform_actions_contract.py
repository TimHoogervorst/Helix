from __future__ import annotations

from helix_core.models import ActionLogEntry
from helix_core.actions import VersionTarget
from helix_core.mod_system.manifest import ModManifest
from helix_core.public import ModRegistrar


def _manifest() -> ModManifest:
    return ModManifest(
        id="acme.widgets",
        display_name="Widgets",
        version="1.2.3",
        requires_helix=">=1.0.0",
        artifacts=("backend",),
        depends_on=(),
    )


def test_public_mod_contract_has_no_action_model_registration():
    assert not hasattr(ModRegistrar, "register_action_model")


def test_action_log_entry_uses_logical_targets_and_explicit_unknown_provenance():
    fields = {field.name: field for field in ActionLogEntry._meta.fields}

    assert fields["target_model_reference"].remote_field is None
    assert fields["target_object_id"].remote_field is None
    assert fields["initiating_mod_id"].default == "unknown"
    assert fields["initiating_mod_version"].default == "unknown"
    assert fields["target_version_reference"].remote_field is None


def test_custom_action_identity_is_owned_by_provider_mod():
    registrar = ModRegistrar(_manifest())
    target = registrar.register_model("widget", object)

    registrar.register_custom_action("changed", "Changed", "edited", target)

    entry = registrar._registry.get_action_catalog(registrar._registry_id)[-1]
    assert entry["id"] == "acme.widgets:changed"
    assert entry["provider_mod_id"] == "acme.widgets"
    assert entry["provider_mod_version"] == "1.2.3"


def test_version_target_is_provider_neutral():
    target = VersionTarget("acme:revision", "42", "r7", "abc123")

    assert target.reference == "acme:revision"
    assert target.object_id == "42"
    assert target.label == "r7"
    assert target.content_hash == "abc123"
