from types import SimpleNamespace

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
