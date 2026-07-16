from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class PinsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.pins"

    def ready(self):
        registry.register_urls(
            "pins", [path("api/core/pins/", include("core_mods.pins.urls"))]
        )
