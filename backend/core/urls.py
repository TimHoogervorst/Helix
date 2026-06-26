from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import FolderViewSet, csrf_token_view

router = DefaultRouter()
router.register(r"folders", FolderViewSet, basename="folder")

urlpatterns = [
    path("csrf/", csrf_token_view, name="csrf-token"),
    path("", include(router.urls)),
]
