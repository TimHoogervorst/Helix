from types import SimpleNamespace
import pytest

from mods.eln import mod as eln_mod


class Registrar:
    def __init__(self, mod_id):
        self.id = mod_id
        self.calls = []

    def register_model(self, key, model):
        self.calls.append(("model", key))
        return SimpleNamespace(id=f"{self.id}:{key}")

    def register_content_source(self, key, model, **kwargs):
        self.calls.append(("source", key, model, kwargs))

    register_source_kind = register_content_source

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return SimpleNamespace(id=f"{self.id}:reference")
        return method


def _source(registrar, key):
    return next(call for call in registrar.calls if call[0] == "source" and call[1] == key)


def test_eln_registers_entry_provider_with_library_capabilities():
    registrar = Registrar("helix.eln")

    eln_mod.register(registrar)

    _, _, reference, kwargs = _source(registrar, "entry")
    assert reference.id == "helix.eln:entry"
    assert kwargs["serializer"].__name__ == "NotebookEntrySerializer"
    assert kwargs["display_metadata"]["workspace_id"] == "eln"
    assert {"create", "edit", "lock"} <= set(kwargs["mutation_handlers"])
    assert callable(kwargs["visibility_query"])


def test_eln_status_signal_only_observes_eln_owned_models():
    registrar = Registrar("helix.eln")

    eln_mod.register(registrar)

    signal_calls = [call for call in registrar.calls if call[0] == "register_signal"]
    assert signal_calls
    assert all(call[1][1].id.startswith("helix.eln:") for call in signal_calls)


@pytest.mark.parametrize("block_id", [
    "helix.eln:table", "helix.lims:comment", "helix.lims:protocol",
    "helix.lims:registry-table", "helix.lims:result-table",
])
@pytest.mark.parametrize("verb", ["created", "edited", "deleted"])
def test_editor_lifecycle_actions_are_declared_for_entry(block_id, verb):
    registrar = Registrar("helix.eln")
    eln_mod.register(registrar)
    actions = {call[1][0]: call[1] for call in registrar.calls
               if call[0] == "register_custom_action"}
    declaration = actions[f"{block_id}.{verb}"]
    assert declaration[2] == verb
    assert declaration[3].id == "helix.eln:entry"


@pytest.mark.parametrize("action_id", [
    "helix.lims:registry-table.entities-registered",
    "helix.lims:registry-table.row-added",
    "helix.lims:result-table.results-registered",
    "eln.registry-table.entities-registered",
])
def test_editor_custom_actions_preserve_canonical_and_legacy_ids(action_id):
    registrar = Registrar("helix.eln")
    eln_mod.register(registrar)
    actions = {call[1][0]: call[1] for call in registrar.calls
               if call[0] == "register_custom_action"}
    assert actions[action_id][2] == "edited"
    assert actions[action_id][3].id == "helix.eln:entry"
