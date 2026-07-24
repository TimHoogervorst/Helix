from django.apps import AppConfig


class MentionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core.mentions"

    def ready(self):
        from django.db.models.signals import post_delete, post_save

        from core.mentions.prefix_resolver import invalidate_prefix_cache

        # Connect prefix-cache invalidation signals for Schema and
        # SchemaType — the shared models that replaced the legacy
        # EntityType / RegisteredEntityType models.
        from helix_core.models import Schema, SchemaType

        post_save.connect(invalidate_prefix_cache, sender=Schema)
        post_delete.connect(invalidate_prefix_cache, sender=Schema)
        post_save.connect(invalidate_prefix_cache, sender=SchemaType)
        post_delete.connect(invalidate_prefix_cache, sender=SchemaType)
