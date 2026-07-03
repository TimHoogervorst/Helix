from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import NotebookEntryViewSet, TagViewSet

router = DefaultRouter()
router.register(r"entries", NotebookEntryViewSet, basename="entry")
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = [
    path("", include(router.urls)),
]
