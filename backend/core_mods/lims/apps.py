from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class LimsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.lims"

    def ready(self):
        from core.signals import entry_content_sync
        from core_mods.eln.models import NotebookEntry
        from core_mods.lims.models import Action
        from core_mods.lims.signals import sync_entities_on_content_sync

        registry.register_action_model("lims", Action)
        registry.register_signal(
            "lims",
            entry_content_sync,
            sync_entities_on_content_sync,
            sender=NotebookEntry,
        )
        registry.register_urls(
            "lims", [path("api/lims/", include("core_mods.lims.urls"))]
        )
