from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import FolderViewSet

router = DefaultRouter()
router.register(r"folders", FolderViewSet, basename="folder")

urlpatterns = [
    path("", include(router.urls)),
]
