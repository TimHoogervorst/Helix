from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ChangePasswordView,
    CoreSettingViewSet,
    FolderViewSet,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    UserViewSet,
    csrf_token_view,
)
from core_mods.pins.views import PinnedWorkspaceViewSet

router = DefaultRouter()
router.register(r"folders", FolderViewSet, basename="folder")
router.register(r"pins", PinnedWorkspaceViewSet, basename="pinnedworkspace")
router.register(r"users", UserViewSet, basename="user")
router.register(r"settings", CoreSettingViewSet, basename="coresetting")

urlpatterns = [
    path("csrf/", csrf_token_view, name="csrf-token"),
    # Auth
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("", include(router.urls)),
]
