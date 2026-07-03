from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import PinnedWorkspaceViewSet

router = DefaultRouter()
router.register(r"pins", PinnedWorkspaceViewSet, basename="pinnedworkspace")

urlpatterns = [
    path("", include(router.urls)),
]
