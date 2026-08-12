from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    from .models import AccessAction

    registry.register_action_model("access", AccessAction)

    registry.register_urls(
        "access", [path("api/access/", include("mods.access.urls"))]
    )
