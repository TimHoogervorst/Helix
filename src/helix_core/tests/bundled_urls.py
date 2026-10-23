"""Explicit endpoint composition for Bundled API tests; real boot is tested separately."""

from django.urls import include, path
from config.urls import urlpatterns as platform_urlpatterns

urlpatterns = [
    path("api/core/tabs/", include("bundled.tabs.urls")),
    path("api/dropdowns/", include("bundled.datatypes.dropdowns.urls")),
    path("api/tags/", include("bundled.labelling.tags.urls")),
    path("api/home/", include("bundled.shared.home.urls")),
    path("api/lims/", include("bundled.lims.urls")),
    path("api/library/", include("bundled.shared.library.urls")),
    *platform_urlpatterns,
]
