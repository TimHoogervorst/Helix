from django.apps import AppConfig


class LimsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.lims"

    def ready(self):
        from core.signals import entry_content_sync
        from core_mods.eln.models import NotebookEntry
        from core_mods.lims.signals import sync_entities_on_content_sync

        entry_content_sync.connect(
            sync_entities_on_content_sync, sender=NotebookEntry
        )
