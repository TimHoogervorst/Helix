"""Routes for LIMS API tests, independent of ModInstallation bootstrap."""

from django.urls import include, path

from config.urls import urlpatterns as helix_urlpatterns

urlpatterns = [
    *helix_urlpatterns,
    path("api/lims/", include("bundled.lims.urls")),
]
