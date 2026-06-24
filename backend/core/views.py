from rest_framework import viewsets

from .models import Folder
from .serializers import FolderSerializer


class FolderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for folders.

    list: GET /api/core/folders/ — list root folders (parent is null)
    retrieve: GET /api/core/folders/{id}/ — get folder with children
    """

    queryset = Folder.objects.filter(parent__isnull=True)
    serializer_class = FolderSerializer
    permission_classes = []
    pagination_class = None
