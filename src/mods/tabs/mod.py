from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    registry.register_urls(
        "pins", [path("api/core/pins/", include("mods.pins.urls"))]
    )
