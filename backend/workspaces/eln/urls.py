from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import NotebookEntryViewSet

router = DefaultRouter()
router.register(r"entries", NotebookEntryViewSet, basename="entry")

urlpatterns = [
    path("", include(router.urls)),
]
