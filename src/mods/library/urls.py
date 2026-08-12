from django.urls import path

from .views import LibraryContentsView, LibraryFolderListView

urlpatterns = [
    path("contents/", LibraryContentsView.as_view(), name="library-contents"),
    path("folders/", LibraryFolderListView.as_view(), name="library-folders"),
]
