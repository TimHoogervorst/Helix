from django.urls import path, include
from rest_framework.routers import DefaultRouter

from helix_core.views import (
    ActionCreateView,
    ColorTokenViewSet,
    ModRegistryView,
    SchemaViewSet,
    SchemaTypeViewSet,
    EntityHubListView,
    EntityHubQueryView,
)

# Router for schemas, schema-types, and colors
router = DefaultRouter()
router.register(r"schemas", SchemaViewSet, basename="schema")
router.register(r"schema-types", SchemaTypeViewSet, basename="schema-type")
router.register(r"colors", ColorTokenViewSet, basename="color-token")

# Router for the registry (cross-mod entity browsing)
registry_router = DefaultRouter()
registry_router.register(r"entities", EntityHubListView, basename="registry-entity")

urlpatterns = [
    path("actions/", ActionCreateView.as_view(), name="action-create"),
    path("", include(router.urls)),
    path("registry/", include(registry_router.urls)),
    path(
        "registry/entities/query/",
        EntityHubQueryView.as_view(),
        name="registry-entity-query",
    ),
    path("mod-registry/", ModRegistryView.as_view(), name="mod-registry"),
    path(
        "mod-registry/sync-actions/",
        ModRegistryView.as_view(),
        name="mod-registry-sync-actions",
    ),
]
