from django.urls import path, include
from rest_framework.routers import DefaultRouter

from helix_core.views import SchemaViewSet, SchemaTypeViewSet, EntityHubListView, ModRegistryView

# Router for schemas and schema-types
router = DefaultRouter()
router.register(r"schemas", SchemaViewSet, basename="schema")
router.register(r"schema-types", SchemaTypeViewSet, basename="schema-type")

# Router for the registry (cross-mod entity browsing)
registry_router = DefaultRouter()
registry_router.register(r"entities", EntityHubListView, basename="registry-entity")

urlpatterns = [
    path("", include(router.urls)),
    path("registry/", include(registry_router.urls)),
    path("mod-registry/", ModRegistryView.as_view(), name="mod-registry"),
]
