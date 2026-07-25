from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import DropdownViewSet

router = DefaultRouter()
router.register(r"", DropdownViewSet, basename="dropdowns-dropdown")

urlpatterns = [
    path("", include(router.urls)),
]
