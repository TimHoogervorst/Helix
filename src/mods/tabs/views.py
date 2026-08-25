from django.db import IntegrityError, models, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.actions.mixins import ActionLoggingMixin

from .models import PinnedWorkspace, TabFolder
from .serializers import PinnedWorkspaceSerializer, TabFolderSerializer, TabLayoutSerializer


class PinnedWorkspaceViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for pinned workspaces.

    list:    GET    /api/core/tabs/       — list current user's tabs
    create:  POST   /api/core/tabs/       — create a tab
    destroy: DELETE /api/core/tabs/{id}/  — delete a tab
    """

    queryset = PinnedWorkspace.objects.all()
    serializer_class = PinnedWorkspaceSerializer
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "core.tab.created"},
        "destroy": {"action": "core.tab.deleted"},
    }

    def get_queryset(self):
        return (
            super().get_queryset().filter(user=self.request.user)
            .select_related("folder").order_by("order", "id")
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            PinnedWorkspace.objects.filter(
                user=self.request.user, folder__isnull=True
            ).update(order=models.F("order") + 1)
            serializer.save(user=self.request.user, order=0)
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

    @action(detail=True, methods=["patch"], url_path="label")
    def label(self, request, pk=None):
        """Refresh a tab's snapshot label without logging an action."""
        if set(request.data) != {"label"}:
            return Response(
                {"label": ["Only the label can be updated here."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tab = self.get_object()
        serializer = self.get_serializer(tab, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=["put"], url_path="layout")
    def layout(self, request):
        serializer = TabLayoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        submitted_folders = data["folders"]
        submitted_tabs = data["tabs"]

        with transaction.atomic():
            request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
            folders = list(TabFolder.objects.filter(user=request.user))
            tabs = list(PinnedWorkspace.objects.filter(user=request.user))
            folder_by_id = {folder.id: folder for folder in folders}
            tab_by_id = {tab.id: tab for tab in tabs}

            if {item["id"] for item in submitted_folders} != set(folder_by_id):
                raise serializers.ValidationError(
                    {"folders": "The layout must include every folder exactly once."}
                )
            if {item["id"] for item in submitted_tabs} != set(tab_by_id):
                raise serializers.ValidationError(
                    {"tabs": "The layout must include every tab exactly once."}
                )
            if len(submitted_folders) != len(folder_by_id) or len(submitted_tabs) != len(tab_by_id):
                raise serializers.ValidationError("Layout entries must be unique.")

            folder_tab_ids = set()
            for folder_data in submitted_folders:
                for tab_id in folder_data["tab_ids"]:
                    if tab_id not in tab_by_id or tab_id in folder_tab_ids:
                        raise serializers.ValidationError({"folders": "Folder tab memberships are invalid."})
                    folder_tab_ids.add(tab_id)
            tab_folder_ids = set()
            for tab_data in submitted_tabs:
                folder_id = tab_data["folder"]
                if folder_id is not None:
                    if folder_id not in folder_by_id:
                        raise serializers.ValidationError({"tabs": "Tabs may only reference the current user's folders."})
                    tab_folder_ids.add(tab_data["id"])
            if folder_tab_ids != tab_folder_ids:
                raise serializers.ValidationError({"tabs": "Tab folder memberships must match folder tab_ids."})

            for folder_data in submitted_folders:
                folder = folder_by_id[folder_data["id"]]
                folder.order = folder_data["order"]
                folder.expanded = folder_data["expanded"]
                folder.save(update_fields=["order", "expanded"])
            for tab_data in submitted_tabs:
                tab = tab_by_id[tab_data["id"]]
                tab.order = tab_data["order"]
                tab.folder_id = tab_data["folder"]
                tab.save(update_fields=["order", "folder"])

        return Response({
            "folders": TabFolderSerializer(
                TabFolder.objects.filter(user=request.user), many=True
            ).data,
            "tabs": PinnedWorkspaceSerializer(
                PinnedWorkspace.objects.filter(user=request.user)
                .select_related("folder").order_by("order", "id"), many=True
            ).data,
        })


class TabFolderViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    queryset = TabFolder.objects.all()
    serializer_class = TabFolderSerializer
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "core.tab_folder.created"},
        "update": {"action": "core.tab_folder.edited"},
        "partial_update": {"action": "core.tab_folder.edited"},
        "destroy": {"action": "core.tab_folder.deleted"},
    }

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        last = TabFolder.objects.filter(user=self.request.user).order_by("-order", "-id").first()
        serializer.save(user=self.request.user, order=(last.order + 1 if last else 0))
        self._maybe_log(
            "create",
            instance=serializer.instance,
            validated_data=serializer.validated_data,
        )
