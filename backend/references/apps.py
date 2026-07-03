from django.apps import AppConfig


class ReferencesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "references"

    def ready(self):
        from django.db.models.signals import post_delete, post_save

        from references.prefix_resolver import invalidate_prefix_cache
        from core_mods.lims.models import EntityType

        post_save.connect(invalidate_prefix_cache, sender=EntityType)
        post_delete.connect(invalidate_prefix_cache, sender=EntityType)
