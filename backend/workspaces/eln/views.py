from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import NotebookEntry
from .serializers import NotebookEntrySerializer, NotebookEntryCreateSerializer
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
