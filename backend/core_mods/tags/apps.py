from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class TagsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.tags"

    def ready(self):
        from .models import TagsAction

        registry.register_action_model("tags", TagsAction)
        registry.register_urls(
            "tags", [path("api/tags/", include("core_mods.tags.urls"))]
        )
