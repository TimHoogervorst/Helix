import pytest

from helix_core.identity_migration import (
    UnknownPersistedIdentity,
    identity_map,
    migrate_json,
    migrate_workspace_url,
    translate,
)


def test_checked_in_map_covers_each_persisted_identity_namespace():
    mapping = identity_map()

    assert mapping["schema_types"] == {
        "eln.entry": "helix.eln:entry",
        "lims.entity": "helix.lims:entity",
        "lims.result": "helix.lims:result",
    }
    assert mapping["models"]["mods.eln.models.NotebookEntry"] == "helix.eln:entry"
    assert mapping["entity_tabs"]["lims.results"] == "helix.lims:results"
    assert "eln.registry-table" in mapping["blocks"]
    assert "eln.editor" in mapping["slots"]
    assert mapping["actions"]["eln.entry.edited"] == "helix.eln:entry.edited"


def test_unknown_stored_identity_fails_instead_of_being_guessed():
    with pytest.raises(UnknownPersistedIdentity, match="Unknown persisted blocks identity"):
        translate("blocks", "eln.future-block")


def test_migrates_nested_saved_view_document_and_action_metadata():
    stored = {
        "schema_type_id": "lims.entity",
        "filters": [{"workspaceId": "lims", "component": "lims.results"}],
        "document": {"type": "eln.registry-table", "attrs": {"blockId": "eln.registry-table"}},
        "metadata": {"action": "eln.entry.edited", "target_type": "eln.entry"},
        "content_type": "legacy.generic.contenttype",
        "source_path": [{"kind": "entry", "id": 7}],
    }

    assert migrate_json(stored) == {
        "schema_type_id": "helix.lims:entity",
        "filters": [{"workspaceId": "helix.lims:workspace", "component": "helix.lims:results"}],
        "document": {"type": "helix.eln:registry-table", "attrs": {"blockId": "helix.eln:registry-table"}},
        "metadata": {"action": "helix.eln:entry.edited", "target_type": "helix.eln:entry"},
        "content_type": "legacy.generic.contenttype",
        "source_path": [{"kind": "entry", "id": 7}],
    }


def test_migrates_pinned_workspace_url_to_explicit_reference():
    assert migrate_workspace_url("/eln/E7?tab=history") == (
        "helix.eln:workspace",
        "/w/helix/eln/workspace/E7?tab=history",
    )


def test_unknown_nested_identity_fails_without_changing_source_path():
    with pytest.raises(UnknownPersistedIdentity, match="Unknown persisted workspaces identity"):
        migrate_json({"workspaceId": "unknown", "source_path": [{"kind": "entry"}]})


def test_known_document_migration_preserves_source_path_and_generic_content_type():
    value = {
        "type": "eln.table",
        "source_path": [{"kind": "entry", "id": 9}],
        "source_type": "core.generic",
    }

    assert migrate_json(value) == {
        "type": "helix.eln:table",
        "source_path": [{"kind": "entry", "id": 9}],
        "source_type": "core.generic",
    }
