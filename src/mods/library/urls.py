from django.urls import path

from .views import LibraryChildrenView, LibraryFolderListView

urlpatterns = [
    path("children/", LibraryChildrenView.as_view(), name="library-children"),
    path("folders/", LibraryFolderListView.as_view(), name="library-folders"),
]
