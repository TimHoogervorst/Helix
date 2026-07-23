from django.urls import path, include
from rest_framework.routers import DefaultRouter

from helix_core.views import SchemaViewSet, SchemaTypeViewSet

router = DefaultRouter()
router.register(r"schemas", SchemaViewSet, basename="schema")
router.register(r"schema-types", SchemaTypeViewSet, basename="schema-type")

urlpatterns = [
    path("", include(router.urls)),
]
