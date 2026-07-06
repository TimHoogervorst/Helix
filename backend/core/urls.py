from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CoreSettingViewSet,
    FolderViewSet,
    csrf_token_view,
)
from core_mods.pins.views import PinnedWorkspaceViewSet

router = DefaultRouter()
router.register(r"folders", FolderViewSet, basename="folder")
router.register(r"pins", PinnedWorkspaceViewSet, basename="pinnedworkspace")
router.register(r"settings", CoreSettingViewSet, basename="coresetting")

urlpatterns = [
    path("csrf/", csrf_token_view, name="csrf-token"),
    # Auth + user management (core_mods.users)
    path("", include("core_mods.users.urls")),
    path("", include(router.urls)),
]
