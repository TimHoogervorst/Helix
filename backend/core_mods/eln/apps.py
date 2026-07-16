from django.apps import AppConfig


class ElnConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.eln"

    def ready(self):
        from django.db.models.signals import post_save

        from helix_core.actions.registry import register_action_model
        from core_mods.eln.cascade import update_entity_status_from_entry
        from core_mods.eln.models import ElnAction, NotebookEntry

        post_save.connect(update_entity_status_from_entry, sender=NotebookEntry)
        register_action_model("eln", ElnAction)
