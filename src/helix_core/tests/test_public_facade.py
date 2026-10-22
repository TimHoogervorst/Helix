from __future__ import annotations

import pytest

from helix_core import (
    ActionReference,
    ModelReference,
    ModRegistrar,
    ObjectReference,
    SignalKind,
    ServiceReference,
    SlotReference,
    WorkspaceReference,
)
from helix_core.mod_system.manifest import Dependency, ModManifest
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.capabilities import PLATFORM_CAPABILITIES


def manifest(mod_id: str = "acme.widgets") -> ModManifest:
    return ModManifest(
        id=mod_id,
        display_name="Widgets",
        version="1.2.3",
        requires_helix=">=1.0.0",
        artifacts=("backend",),
        depends_on=(),
    )


def test_registrar_namespaces_public_references_and_services():
    raw = BackendModRegistry()
    mod = ModRegistrar(manifest(), raw)

    widget = mod.register_model("widget", object)
    service = mod.register_service("lookup", lambda value: value.upper())

    assert widget == ModelReference("acme.widgets", "widget")
    assert service == ServiceReference("acme.widgets", "lookup")
    assert raw.call("acme.widgets:lookup", "ok") == "OK"
    assert raw.get_registered_models()["acme.widgets:widget"] is object


def test_owner_bound_registration_rejects_foreign_references():
    mod = ModRegistrar(manifest(), BackendModRegistry())
    foreign = ModelReference("other.widgets", "widget")

    with pytest.raises(ValueError, match="not 'acme.widgets'"):
        mod.register_source_kind("sample", foreign)

    with pytest.raises(ValueError, match="not 'acme.widgets'"):
        mod.register_custom_action("sample.changed", "Changed", "edited", foreign)


def test_signal_api_uses_platform_vocabulary_and_model_reference():
    raw = BackendModRegistry()
    mod = ModRegistrar(manifest(), raw)
    sender = mod.register_model("widget", object)
    handler = lambda **kwargs: None

    mod.register_signal(SignalKind.MODEL_POST_SAVE, sender, handler)

    registration = raw.get_signal_registrations()[0]
    assert registration["kind"] == SignalKind.MODEL_POST_SAVE
    assert registration["sender_ref"] == sender

    with pytest.raises(ValueError, match="Platform signal kind"):
        mod.register_signal("arbitrary", sender, handler)


@pytest.mark.django_db
def test_schema_capabilities_allow_platform_and_owner_namespaced_extensions():
    mod = ModRegistrar(manifest(), BackendModRegistry())
    model = mod.register_model("widget", object)

    mod.register_schema_type(
        "Widget",
        workspace_id="widgets",
        model=model,
        prefix="W",
        capabilities=["RegistrationTable", "acme.widgets:sortable"],
    )

    with pytest.raises(ValueError, match="foreign capability"):
        mod.register_schema_type(
            "Other",
            workspace_id="widgets",
            model=model,
            prefix="O",
            capabilities=["foreign.widgets:tag"],
        )


def test_platform_capability_vocabulary_is_curated_and_versioned():
    assert isinstance(PLATFORM_CAPABILITIES, frozenset)
    assert "RegistrationTable" in PLATFORM_CAPABILITIES


@pytest.mark.django_db
def test_registrations_carry_capabilities_into_hydration_payload():
    raw = BackendModRegistry()
    mod = ModRegistrar(manifest(), raw)
    service = mod.register_service("lookup", lambda: None, capabilities=["editor"])
    block = mod.register_block("widget", capabilities=["editor"])
    slot = mod.register_slot("toolbar", accepts=["editor"])
    metric = mod.register_metric_provider("count", service, capabilities=["acme.widgets:sortable"])

    assert service == ServiceReference("acme.widgets", "lookup")
    assert block == "acme.widgets:widget"
    assert slot == SlotReference("acme.widgets", "toolbar")
    assert metric == "acme.widgets:count"
    payload = raw.get_registry_payload()
    assert payload["services"][0]["capabilities"] == ["editor"]
    assert payload["blocks"][0]["capabilities"] == ["editor"]
    assert payload["slots"][0]["capabilities"] == ["editor"]
    assert payload["metricProviders"][0]["capabilities"] == ["acme.widgets:sortable"]


def test_service_reference_can_be_called_through_public_registrar():
    mod = ModRegistrar(manifest(), BackendModRegistry())
    reference = mod.register_service("add", lambda left, right: left + right)

    assert mod.call(reference, 2, 3) == 5


def test_reference_namespaces_are_distinct_and_object_ids_are_durable():
    model = ModelReference("acme.widgets", "widget")
    assert str(model) == "acme.widgets:widget"
    assert ObjectReference(model, "missing-42").id == "acme.widgets:widget:missing-42"
    assert WorkspaceReference("acme.widgets", "detail").id == "acme.widgets:detail"
    assert SlotReference("acme.widgets", "toolbar").id == "acme.widgets:toolbar"
    assert ServiceReference("acme.widgets", "lookup").id == "acme.widgets:lookup"
    assert ActionReference("acme.widgets", "updated").id == "acme.widgets:updated"


@pytest.mark.django_db
def test_deferred_model_reference_resolution_is_order_independent():
    raw = BackendModRegistry()
    consumer = ModRegistrar(manifest("acme.consumer"), raw)
    provider = ModRegistrar(manifest("acme.provider"), raw)
    target = consumer.model_reference("acme.provider", "widget")

    consumer.register_schema_type("Widget", workspace_id="widgets", model=target, prefix="W")
    provider.register_model("widget", object)

    raw.resolve_references()
    assert raw.get_registered_models()["acme.provider:widget"] is object


def test_unresolved_references_have_deterministic_actionable_diagnostics():
    raw = BackendModRegistry()
    consumer = ModRegistrar(manifest("acme.consumer"), raw)
    consumer.register_schema_type(
        "Widget", workspace_id="widgets", model=consumer.model_reference("acme.provider", "widget"), prefix="W"
    )

    with pytest.raises(ValueError, match="acme.provider:widget.*unresolved"):
        raw.resolve_references()


def test_reference_ids_reject_noncanonical_ownership_and_cross_namespace_values():
    with pytest.raises(ValueError, match="lowercase vendor.name"):
        ModelReference("Acme.widgets", "widget")

    mod = ModRegistrar(manifest(), BackendModRegistry())
    with pytest.raises(TypeError, match="Expected ModelReference"):
        mod.register_source_kind("sample", ServiceReference("acme.widgets", "lookup"))


def test_entry_point_discovery_reads_metadata_without_loading_mod_code(monkeypatch):
    from helix_core.mod_system import loader

    class EntryPoints:
        def select(self, *, group):
            assert group == "helix.mods"
            return [type("Entry", (), {"name": "acme.widgets", "value": "acme_widgets"})()]

    monkeypatch.setattr(loader.metadata, "entry_points", lambda: EntryPoints())

    assert loader.discover_python_mod_entry_points() == {
        "acme.widgets": "acme_widgets"
    }


def test_packaged_manifest_is_loaded_from_entry_point_package_without_importing_registration(
    monkeypatch, tmp_path
):
    from helix_core.mod_system import loader

    package = tmp_path / "acme_widgets"
    package.mkdir()
    (package / "__init__.py").write_text(
        "raise AssertionError('registration package was imported')\n",
        encoding="utf-8",
    )
    (package / "modManifest.json").write_text(
        '{"id":"acme.widgets","displayName":"Widgets",'
        '"version":"1.2.3","requiresHelix":">=1.0.0",'
        '"artifacts":["backend"],"dependsOn":[]}',
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    loaded = loader.load_entry_point_manifest("acme.widgets", "acme_widgets")

    assert loaded.id == "acme.widgets"
    assert loaded.version == "1.2.3"


def test_public_mod_composition_resolves_explicit_packages_in_dependency_order():
    from helix_core.public import get_bundled_mod_packages, get_mod_app_configs

    bundled = get_bundled_mod_packages()
    apps = get_mod_app_configs([*bundled, "mods.eln"])

    assert "mods.eln" in apps
    assert apps.index("bundled.lims") < apps.index("mods.eln")
    assert apps.index("bundled.labelling.tags") < apps.index("mods.eln")
    assert get_mod_app_configs(bundled) == get_mod_app_configs(list(bundled))


def test_app_config_exposes_one_stable_django_label():
    from helix_core import make_app_config

    config = make_app_config("acme_widgets", manifest(), "widgets")

    assert config.name == "acme_widgets"
    assert config.label == "widgets"
    assert config.mod_id == "acme.widgets"
    assert config.mod_version == "1.2.3"


def test_app_config_rejects_duplicate_labels():
    from helix_core import make_app_config

    with pytest.raises(ValueError, match="already registered"):
        make_app_config("acme_widgets", manifest(), "widgets", used_labels={"widgets"})
