"""Routes for tests of the access Mod's public HTTP API."""

from django.urls import include, path

from config.urls import urlpatterns as helix_urlpatterns

urlpatterns = [
    *helix_urlpatterns,
    path("api/access/", include("bundled.access.access.urls")),
]
