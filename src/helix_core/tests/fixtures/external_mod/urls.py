"""Minimal URL module for testing registry include patterns."""

from django.http import JsonResponse
from django.urls import path


def fixture_endpoint(request):
    return JsonResponse({"ok": True})


urlpatterns = [path("fixture/", fixture_endpoint, name="fixture-endpoint")]
