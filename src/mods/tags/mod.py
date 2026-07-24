from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from .models import TagsAction

    registry.register_action_model("tags", TagsAction)
    registry.register_urls(
        "tags", [path("api/tags/", include("mods.tags.urls"))]
    )
