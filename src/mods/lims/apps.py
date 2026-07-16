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
        from core_mods.lims.services import (
            cascade_entry_status,
            get_entity_prefixes,
            get_workspace_map,
        )
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
        registry.register_service(
            "lims.cascadeEntryStatus", cascade_entry_status
        )
        registry.register_service(
            "lims.getEntityPrefixes", get_entity_prefixes
        )
        registry.register_service(
            "lims.getWorkspaceMap", get_workspace_map
        )
