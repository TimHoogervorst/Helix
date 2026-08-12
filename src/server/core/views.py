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

    list:     GET    /api/core/folders/                  — list all folders
    list:     GET    /api/core/folders/?project=<id>      — filter by project
    list:     GET    /api/core/folders/?parent=<id>       — filter by parent
    retrieve: GET    /api/core/folders/{id}/              — get folder with children
    create:   POST   /api/core/folders/                   — create a folder
    update:   PUT    /api/core/folders/{id}/              — update a folder
    destroy:  DELETE /api/core/folders/{id}/              — delete a folder
    """

    queryset = Folder.objects.none()
    serializer_class = FolderSerializer
    pagination_class = None

    action_log_config = {
        "create": {"action": "core.folder.created"},
        "update": {"action": "core.folder.edited"},
        "partial_update": {"action": "core.folder.edited"},
        "destroy": {"action": "core.folder.deleted"},
    }

    def get_queryset(self):
        qs = Folder.objects.all()
        project_id = self.request.query_params.get("project")
        parent_id = self.request.query_params.get("parent")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if parent_id is not None:
            qs = qs.filter(parent_id=int(parent_id) if parent_id.isdigit() else None)
        return qs.order_by("name")

    def perform_update(self, serializer):
        from mods.access.policies import can as access_can

        instance = serializer.instance

        if access_can(self.request.user, "core.folder.edited", resource=instance):
            return super().perform_update(serializer)

        if instance.parent is not None:
            from mods.access.models import FolderShare

            shares = FolderShare.objects.filter(
                source_folder__project_id=instance.project_id,
                level="read_write",
            ).select_related("source_folder").only(
                "id", "source_folder_id", "target_project_id",
            )

            ancestor_ids = self._folder_ancestor_ids(instance)

            for share in shares:
                covers = (
                    instance.id == share.source_folder_id
                    or share.source_folder_id in ancestor_ids
                )
                if not covers:
                    continue
                if access_can(
                    self.request.user,
                    "core.folder.edited",
                    resource=instance,
                    via_project=share.target_project_id,
                ):
                    return super().perform_update(serializer)

        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            "You do not have permission to edit this folder."
        )

    def _folder_ancestor_ids(self, folder):
        ids = set()
        node = folder.parent
        while node is not None:
            ids.add(node.id)
            node = node.parent
        return ids

    def perform_destroy(self, instance):
        from mods.access.policies import can as access_can
        from rest_framework.exceptions import PermissionDenied

        if instance.is_hidden_root:
            raise PermissionDenied(
                "The hidden Project root Folder cannot be deleted."
            )

        if access_can(self.request.user, "core.folder.deleted", resource=instance):
            return super().perform_destroy(instance)

        if instance.parent is not None:
            from mods.access.models import FolderShare

            shares = FolderShare.objects.filter(
                source_folder__project_id=instance.project_id,
                level="read_write",
            ).select_related("source_folder").only(
                "id", "source_folder_id", "target_project_id",
            )

            ancestor_ids = self._folder_ancestor_ids(instance)

            for share in shares:
                covers = (
                    instance.id == share.source_folder_id
                    or share.source_folder_id in ancestor_ids
                )
                if not covers:
                    continue
                if access_can(
                    self.request.user,
                    "core.folder.deleted",
                    resource=instance,
                    via_project=share.target_project_id,
                ):
                    return super().perform_destroy(instance)

        raise PermissionDenied(
            "You do not have permission to delete this folder."
        )


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
