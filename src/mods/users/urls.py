"""URL configuration for the users core-mod.

All routes are mounted under /api/core/ by core.urls.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AffiliationViewSet,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    PublicationViewSet,
    RecognitionViewSet,
    RegisterView,
    UserViewSet,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")

profile_router = DefaultRouter()
profile_router.register(r"affiliations", AffiliationViewSet, basename="affiliation")
profile_router.register(r"publications", PublicationViewSet, basename="publication")
profile_router.register(r"recognitions", RecognitionViewSet, basename="recognition")

urlpatterns = [
    # Auth
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
    # Profile list CRUD under /me/
    path("me/", include(profile_router.urls)),
    # User management (router)
    path("", include(router.urls)),
]
