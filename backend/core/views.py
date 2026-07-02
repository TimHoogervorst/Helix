from django.db import IntegrityError
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.response import Response

from .models import Folder, PinnedWorkspace
from .serializers import FolderSerializer, PinnedWorkspaceSerializer


@ensure_csrf_cookie
def csrf_token_view(request):
    """Return a CSRF token cookie for the SPA frontend."""
    return JsonResponse({"detail": "CSRF cookie set"})


class FolderViewSet(viewsets.ModelViewSet):
    """
    API endpoint for folders.

    list:     GET    /api/core/folders/      — list root folders (parent is null)
    retrieve: GET    /api/core/folders/{id}/  — get folder with children
    create:   POST   /api/core/folders/       — create a folder
    update:   PUT    /api/core/folders/{id}/  — update a folder
    destroy:  DELETE /api/core/folders/{id}/  — delete a folder
    """

    queryset = Folder.objects.filter(parent__isnull=True)
    serializer_class = FolderSerializer
    permission_classes = []
    pagination_class = None


class PinnedWorkspaceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for pinned workspaces.

    list:    GET    /api/core/pins/       — list current user's pins
    create:  POST   /api/core/pins/       — create a pin
    destroy: DELETE /api/core/pins/{id}/  — delete a pin
    """

    queryset = PinnedWorkspace.objects.all()
    serializer_class = PinnedWorkspaceSerializer
    permission_classes = []
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"url": ["This workspace is already pinned."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
