from __future__ import annotations

import pytest

from helix_core import ModelReference, ModRegistrar, SignalKind, ServiceReference
from helix_core.mod_system.manifest import Dependency, ModManifest
from helix_core.mod_system.registry import BackendModRegistry


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
def test_schema_tags_allow_platform_and_owner_namespaced_extensions():
    mod = ModRegistrar(manifest(), BackendModRegistry())
    model = mod.register_model("widget", object)

    mod.register_schema_type(
        "Widget",
        workspace_id="widgets",
        model=model,
        prefix="W",
        tags=["RegistrationTable", "acme.widgets:sortable"],
    )

    with pytest.raises(ValueError, match="unknown schema tag"):
        mod.register_schema_type(
            "Other",
            workspace_id="widgets",
            model=model,
            prefix="O",
            tags=["foreign.widgets:tag"],
        )


def test_service_reference_can_be_called_through_public_registrar():
    mod = ModRegistrar(manifest(), BackendModRegistry())
    reference = mod.register_service("add", lambda left, right: left + right)

    assert mod.call(reference, 2, 3) == 5


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
