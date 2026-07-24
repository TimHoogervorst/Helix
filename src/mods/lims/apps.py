from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class LimsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mods.lims"

    def ready(self):
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
