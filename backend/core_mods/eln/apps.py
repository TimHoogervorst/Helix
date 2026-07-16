from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class ElnConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.eln"

    def ready(self):
        from django.db.models.signals import post_save

        from core_mods.eln.cascade import update_entity_status_from_entry
        from core_mods.eln.models import ElnAction, NotebookEntry

        registry.register_action_model("eln", ElnAction)
        registry.register_signal(
            "eln", post_save, update_entity_status_from_entry, sender=NotebookEntry
        )
        registry.register_urls(
            "eln", [path("api/eln/", include("core_mods.eln.urls"))]
        )
