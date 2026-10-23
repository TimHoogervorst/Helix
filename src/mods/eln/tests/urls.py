from django.urls import include, path

urlpatterns = [
    path("api/eln/", include("mods.eln.urls")),
    path("api/", include("helix_core.urls")),
]
