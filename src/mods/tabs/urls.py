from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import PinnedWorkspaceViewSet, TabFolderViewSet

router = DefaultRouter()
router.register(r"folders", TabFolderViewSet, basename="tab-folders")
router.register(r"", PinnedWorkspaceViewSet, basename="tabs")

urlpatterns = [
    path("", include(router.urls)),
]
