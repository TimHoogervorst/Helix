from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from mods.lims.models import Action
    from mods.lims.services import cascade_entry_status

    registry.register_action_model("lims", Action)
    registry.register_urls(
        "lims", [path("api/lims/", include("mods.lims.urls"))]
    )
    registry.register_service(
        "lims.cascadeEntryStatus", cascade_entry_status
    )

    # Register LIMS schema type identity.
    registry.register_schema_type(
        display_name="Entity",
        workspace_id="lims",
        model="mods.lims.models.Entity",
        prefix="BLOOD",
    )
