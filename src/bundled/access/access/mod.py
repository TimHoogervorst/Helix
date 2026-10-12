from django.urls import include, path

def register(mod):
    from .models import AccessAction

    mod.register_action_model(AccessAction)
    mod.register_urls([path("api/access/", include("bundled.access.access.urls"))])
