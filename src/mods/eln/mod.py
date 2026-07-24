from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from django.db.models.signals import post_save

    from mods.eln.cascade import update_entity_status_from_entry
    from mods.eln.models import ElnAction, NotebookEntry

    registry.register_action_model("eln", ElnAction)
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
