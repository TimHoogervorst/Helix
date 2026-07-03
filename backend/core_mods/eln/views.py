from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import NotebookEntry, Tag
from .serializers import (
    NotebookEntrySerializer,
    NotebookEntryCreateSerializer,
    TagSerializer,
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
    permission_classes = []
    lookup_field = "display_id"

    def get_serializer_class(self):
        if self.action == "create":
            return NotebookEntryCreateSerializer
        return NotebookEntrySerializer

    def perform_create(self, serializer):
        author = self.request.user if self.request.user.is_authenticated else None
        instance = serializer.save(author=author)
        sync_entry_content(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        sync_entry_content(instance)

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


class TagViewSet(viewsets.ModelViewSet):
    """
    API endpoint for tags.

    list: GET /api/eln/tags/?q=... — list/search tags
    create: POST /api/eln/tags/ — create a new tag (name + color)
    """

    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = []
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        query = self.request.query_params.get("q", "").strip()
        if query:
            qs = qs.filter(name__icontains=query)
        return qs
