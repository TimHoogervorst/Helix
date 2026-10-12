from django.urls import include, path

def register(mod):
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from .models import TagsAction

    mod.register_action_model(TagsAction)
    mod.register_urls([path("api/tags/", include("bundled.labelling.tags.urls"))])
