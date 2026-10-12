from django.urls import include, path

from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    registry.register_urls(
        "library", [path("api/library/", include("bundled.shared.library.urls"))]
    )
