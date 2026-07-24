from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from helix_core.actions.mixins import ActionLoggingMixin

from .models import CoreSetting, Folder
from .serializers import (
    CoreSettingSerializer,
    FolderSerializer,
)


@ensure_csrf_cookie
def csrf_token_view(request):
    """Return a CSRF token cookie for the SPA frontend."""
    return JsonResponse({"detail": "CSRF cookie set"})


# ── Folder ─────────────────────────────────────────────────────────────────


class FolderViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
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
    pagination_class = None

    action_log_config = {
        "create": {"action": "core.folder.created"},
        "update": {"action": "core.folder.edited"},
        "partial_update": {"action": "core.folder.edited"},
        "destroy": {"action": "core.folder.deleted"},
    }


# ── CoreSetting ────────────────────────────────────────────────────────────


class CoreSettingViewSet(ActionLoggingMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only list + retrieve for CoreSettings.

    list:     GET    /api/core/settings/       — list all settings
    retrieve: GET    /api/core/settings/{key}/  — get a setting by key

    Update is provided via a custom action on the list route so the key
    in the URL is the natural key, not a numeric PK.
    """

    queryset = CoreSetting.objects.all()
    serializer_class = CoreSettingSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "key"

    action_log_config = {
        "partial_update": {"action": "core.setting.edited"},
    }

    def partial_update(self, request, key=None):
        """PATCH /api/core/settings/{key}/ — update a setting value."""
        try:
            setting = CoreSetting.objects.get(key=key)
        except CoreSetting.DoesNotExist:
            return Response(
                {"detail": "Setting not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = CoreSettingSerializer(setting, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        self._maybe_log(
            "partial_update",
            instance=setting,
            validated_data=serializer.validated_data,
        )
        return Response(serializer.data)
