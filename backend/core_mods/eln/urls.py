from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import NotebookEntryViewSet, ProtocolViewSet

router = DefaultRouter()
router.register(r"entries", NotebookEntryViewSet, basename="entry")
router.register(r"protocols", ProtocolViewSet, basename="protocol")

urlpatterns = [
    path("", include(router.urls)),
]
