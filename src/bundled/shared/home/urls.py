from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import CardViewSet, MetricProviderValueView

router = DefaultRouter()
router.register(r"cards", CardViewSet, basename="home-card")

urlpatterns = [
    path("", include(router.urls)),
    path("providers/<path:provider_id>/value/", MetricProviderValueView.as_view()),
]
