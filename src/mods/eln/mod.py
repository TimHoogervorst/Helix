from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from django.db.models.signals import post_save

    from mods.eln.cascade import update_entity_status_from_entry
    from mods.eln.models import ElnAction, NotebookEntry

    registry.register_action_model("eln", ElnAction)

    # ── Block-level action types ──────────────────────────────────────────
    # Register each block type × verb as a custom action so that
    # POST /api/actions/ validates block-level action types sent via
    # sendAction() (see #327 — Migrate ELN Block Pipeline to sendAction).
    _BLOCK_ACTION_VERBS = {
        "created": "Created",
        "edited": "Edited",
        "deleted": "Deleted",
    }
    _BLOCK_IDS = [
        "table-block",
        "comment-block",
        "protocol-block",
        "registryTable-block",
    ]
    for block_id in _BLOCK_IDS:
        for verb, label in _BLOCK_ACTION_VERBS.items():
            registry.register_custom_action(
                mod_id="eln",
                action_id=f"eln.{block_id}.{verb}",
                label=f"{block_id.replace('-', ' ').title()} {label}",
                core=verb,
                target_model="mods.eln.models.NotebookEntry",
            )

    # ── Entry-level custom actions ───────────────────────────────────────
    # Actions used by @logs_action decorators in views.py.  Must be
    # registered before the views are imported.
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.entry.tags_attached",
        label="Tags Attached",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.entry.tag_detached",
        label="Tag Detached",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )

    # ── Registry-table custom actions ────────────────────────────────────
    # Actions triggered by user interactions in the Registry Table block
    # (register entities, add new row).  Both map to the "edited" core
    # verb because they modify the entry's registry data, not create or
    # delete the entry itself.
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.registryTable-block.registered-entities",
        label="Registered Entities",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.registryTable-block.row-added",
        label="Row Added",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )

    registry.register_schema_type(
        display_name="ELN Entry",
        workspace_id="eln",
        model="mods.eln.models.NotebookEntry",
        prefix="E",
    )
    registry.register_signal(
        "eln", post_save, update_entity_status_from_entry, sender=NotebookEntry
    )
    registry.register_urls(
        "eln", [path("api/eln/", include("mods.eln.urls"))]
    )
