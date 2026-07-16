from django.apps import AppConfig


class MentionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core.mentions"

    def ready(self):
        from django.db.models.signals import post_delete, post_save

        from core.mentions.prefix_resolver import invalidate_prefix_cache
        from mods.lims.models import EntityType, RegisteredEntityType

        post_save.connect(invalidate_prefix_cache, sender=EntityType)
        post_delete.connect(invalidate_prefix_cache, sender=EntityType)
        post_save.connect(invalidate_prefix_cache, sender=RegisteredEntityType)
        post_delete.connect(invalidate_prefix_cache, sender=RegisteredEntityType)
