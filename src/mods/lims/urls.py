from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import EntityViewSet, ActionViewSet, LimsViewViewSet, MetricViewSet

router = DefaultRouter()
router.register(r"entities", EntityViewSet, basename="entity")
router.register(r"actions", ActionViewSet, basename="action")
router.register(r"views", LimsViewViewSet, basename="limsview")
router.register(r"metrics", MetricViewSet, basename="metric")

urlpatterns = [
    path("", include(router.urls)),
]
