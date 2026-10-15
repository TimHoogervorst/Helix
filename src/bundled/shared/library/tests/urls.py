"""Routes for Library API integration tests."""

from django.urls import include, path

from config.urls import urlpatterns as helix_urlpatterns

urlpatterns = [
    *helix_urlpatterns,
    path("api/library/", include("bundled.shared.library.urls")),
    path("api/access/", include("bundled.access.access.urls")),
]
