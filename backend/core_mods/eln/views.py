from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.actions.logger import log_action

from .models import NotebookEntry, Tag, ElnAction
from .serializers import (
    NotebookEntrySerializer,
    NotebookEntryCreateSerializer,
    TagSerializer,
    ElnActionSerializer,
    ElnActionCreateSerializer,
)
from .sync import sync_entry_content


class NotebookEntryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for ELN notebook entries.

    list: GET /api/eln/entries/ — list all entries (paginated)
    create: POST /api/eln/entries/ — create a new entry
    retrieve: GET /api/eln/entries/{display_id}/ — lookup by display_id
    update: PUT /api/eln/entries/{display_id}/ — update entry
    partial_update: PATCH /api/eln/entries/{display_id}/ — partial update
    destroy: DELETE /api/eln/entries/{display_id}/ — delete entry
    delete_all: DELETE /api/eln/entries/delete_all/ — delete all entries
    attach_tags: POST /api/eln/entries/{display_id}/tags/ — attach one or more tags
    detach_tag: DELETE /api/eln/entries/{display_id}/tags/{tag_id}/ — detach a tag
    """

    queryset = NotebookEntry.objects.select_related("author", "folder").prefetch_related(
        "mentions"
    )
    serializer_class = NotebookEntrySerializer
    lookup_field = "display_id"

    def get_serializer_class(self):
        if self.action == "create":
            return NotebookEntryCreateSerializer
        return NotebookEntrySerializer

    def perform_create(self, serializer):
        author = self.request.user if self.request.user.is_authenticated else None
        instance = serializer.save(author=author)
        sync_entry_content(instance)
        if author is not None:
            log_action(
                user=author,
                action_type="created",
                target_type="eln.entry",
                target_id=instance.id,
            )

    def perform_update(self, serializer):
        instance = serializer.save()
        sync_entry_content(instance)
        if self.request.user.is_authenticated:
            log_action(
                user=self.request.user,
                action_type="edited",
                target_type="eln.entry",
                target_id=instance.id,
            )

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        read_serializer = NotebookEntrySerializer(write_serializer.instance)
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=["delete"], url_path="delete_all")
    def delete_all(self, request):
        """Delete ALL notebook entries. Danger zone endpoint for testing."""
        count, _ = NotebookEntry.objects.all().delete()
        return Response({"deleted": count})

    @action(detail=True, methods=["post"], url_path="tags")
    def attach_tags(self, request, display_id=None):
        """Attach one or more tags to the entry.

        Body: {"tag_ids": [1, 2, 3]}
        """
        entry = self.get_object()
        tag_ids = request.data.get("tag_ids", [])
        if not isinstance(tag_ids, list):
            return Response(
                {"error": "tag_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST
            )

        tags = Tag.objects.filter(id__in=tag_ids)
        entry.tags.add(*tags)
        read_serializer = NotebookEntrySerializer(entry)
        return Response(read_serializer.data)

    @action(detail=True, methods=["delete"], url_path="tags/(?P<tag_id>[^/.]+)")
    def detach_tag(self, request, display_id=None, tag_id=None):
        """Detach a tag from the entry."""
        entry = self.get_object()
        try:
            tag = Tag.objects.get(id=tag_id)
        except Tag.DoesNotExist:
            return Response(
                {"error": "Tag not found"}, status=status.HTTP_404_NOT_FOUND
            )
        entry.tags.remove(tag)
        read_serializer = NotebookEntrySerializer(entry)
        return Response(read_serializer.data)

    @action(detail=True, methods=["get", "post"], url_path="actions")
    def entry_actions(self, request, display_id=None):
        """GET: list actions for an entry, filterable by ?action_type= and ?since=.

        POST: log a custom action against an entry.

        GET /api/eln/entries/{display_id}/actions/
        GET /api/eln/entries/{display_id}/actions/?action_type=edited
        GET /api/eln/entries/{display_id}/actions/?action_type=edited&since=2026-06-30T00:00:00Z

        POST /api/eln/entries/{display_id}/actions/
        Body: {"action_type": "commented", "metadata": {"text": "..."}}
        """
        if request.method == "POST":
            return self._create_action(request, display_id)
        return self._list_actions(request, display_id)

    def _list_actions(self, request, display_id):
        entry = self.get_object()
        qs = ElnAction.objects.filter(
            target_type="eln.entry",
            target_id=entry.id,
        ).select_related("performed_by").order_by("-created_at")

        # Filter by action_type (e.g. "edited", "created")
        action_type = request.query_params.get("action_type")
        if action_type:
            qs = qs.filter(action_type=action_type)

        # Filter by since (ISO 8601 datetime)
        since_str = request.query_params.get("since")
        if since_str:
            since = parse_datetime(since_str)
            if since is None:
                return Response(
                    {"error": "Invalid since parameter. Use ISO 8601 format."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(created_at__gte=since)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ElnActionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ElnActionSerializer(qs, many=True)
        return Response(serializer.data)

    def _create_action(self, request, display_id):
        entry = self.get_object()
        serializer = ElnActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = log_action(
            user=request.user,
            action_type=serializer.validated_data["action_type"],
            target_type="eln.entry",
            target_id=entry.id,
            metadata=serializer.validated_data.get("metadata") or {},
        )

        read_serializer = ElnActionSerializer(action)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)


class TagViewSet(viewsets.ModelViewSet):
    """
    API endpoint for tags.

    list: GET /api/eln/tags/?q=... — list/search tags
    create: POST /api/eln/tags/ — create a new tag (name + color)
    """

    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        query = self.request.query_params.get("q", "").strip()
        if query:
            qs = qs.filter(name__icontains=query)
        return qs
