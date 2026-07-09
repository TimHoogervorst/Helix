from django.urls import path

from .views import resolve_view, search_view

urlpatterns = [
    path("resolve/", resolve_view, name="mentions-resolve"),
    path("search/", search_view, name="mentions-search"),
]
