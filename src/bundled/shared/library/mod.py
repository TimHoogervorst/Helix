from django.urls import include, path

def register(mod):
    """Called by ModLoader after topological sort. Populates the backend registry."""
    mod.register_urls([path("api/library/", include("bundled.shared.library.urls"))])
