from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import FolderViewSet, register_view, login_view

router = DefaultRouter()
router.register(r"folders", FolderViewSet, basename="folder")

urlpatterns = [
    path("", include(router.urls)),
    path("auth/register/", register_view, name="auth-register"),
    path("auth/login/", login_view, name="auth-login"),
]
