from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import EntityTypeViewSet, EntityViewSet, ActionViewSet

router = DefaultRouter()
router.register(r"entity-types", EntityTypeViewSet, basename="entity-type")
router.register(r"entities", EntityViewSet, basename="entity")
router.register(r"actions", ActionViewSet, basename="action")

urlpatterns = [
    path("", include(router.urls)),
]
