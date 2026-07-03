from django.db import IntegrityError
from rest_framework import status, viewsets
from rest_framework.response import Response

from .models import PinnedWorkspace
from .serializers import PinnedWorkspaceSerializer


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
