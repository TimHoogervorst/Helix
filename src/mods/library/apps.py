from django.apps import AppConfig
from django.urls import path, include

from helix_core.mod_system.registry import registry


class LibraryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mods.library"

    def ready(self):
        registry.register_urls(
            "library", [path("api/library/", include("mods.library.urls"))]
        )
