from django.urls import path

from .views import LibraryContentsView

urlpatterns = [
    path("contents/", LibraryContentsView.as_view(), name="library-contents"),
]
