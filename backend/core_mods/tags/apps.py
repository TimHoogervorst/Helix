from django.apps import AppConfig


class TagsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.tags"

    def ready(self):
        from core.actions.registry import register_action_model
        from .models import TagsAction

        register_action_model("tags", TagsAction)
