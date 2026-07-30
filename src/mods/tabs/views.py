from django.db import IntegrityError
from rest_framework import status, viewsets
from rest_framework.response import Response

from helix_core.actions.mixins import ActionLoggingMixin

from .models import PinnedWorkspace
from .serializers import PinnedWorkspaceSerializer


class PinnedWorkspaceViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for pinned workspaces.

    list:    GET    /api/core/tabs/       — list current user's tabs
    create:  POST   /api/core/tabs/       — create a tab
    destroy: DELETE /api/core/tabs/{id}/  — delete a tab
    """

    queryset = PinnedWorkspace.objects.all()
    serializer_class = PinnedWorkspaceSerializer
    permission_classes = []
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "core.tab.created"},
        "destroy": {"action": "core.tab.deleted"},
    }

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        self._maybe_log(
            "create",
            instance=serializer.instance,
            validated_data=serializer.validated_data,
        )

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"url": ["This workspace is already pinned."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
