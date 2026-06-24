from rest_framework import viewsets, status
from rest_framework.response import Response

from references.services import sync_mentions
from lims.services import sync_entities

from .models import NotebookEntry
from .serializers import NotebookEntrySerializer, NotebookEntryCreateSerializer


class NotebookEntryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for ELN notebook entries.

    list: GET /api/eln/entries/ — list all entries (paginated)
    create: POST /api/eln/entries/ — create a new entry
    retrieve: GET /api/eln/entries/{id}/ — get single entry with full content
    update: PUT /api/eln/entries/{id}/ — update entry
    partial_update: PATCH /api/eln/entries/{id}/ — partial update
    destroy: DELETE /api/eln/entries/{id}/ — delete entry
    """

    queryset = NotebookEntry.objects.select_related("author", "folder").prefetch_related(
        "mentions"
    )
    serializer_class = NotebookEntrySerializer
    permission_classes = []

    def get_serializer_class(self):
        if self.action == "create":
            return NotebookEntryCreateSerializer
        return NotebookEntrySerializer

    def perform_create(self, serializer):
        author = self.request.user if self.request.user.is_authenticated else None
        folder = serializer.validated_data.get("folder")
        if folder is None:
            from core.models import Folder
            folder, _ = Folder.objects.get_or_create(name="Default", parent=None)
        instance = serializer.save(author=author, folder=folder)
        # Sync entities first (patches entityIds into content),
        # then sync mentions (may find new reference nodes in table cells)
        content = sync_entities(instance, instance.content)
        sync_mentions(instance, content)
        # Save updated content with patched entityIds
        if content != instance.content:
            instance.content = content
            instance.save(update_fields=["content"])

    def perform_update(self, serializer):
        instance = serializer.save()
        # Sync entities first, then mentions
        content = sync_entities(instance, instance.content)
        sync_mentions(instance, content)
        # Save updated content with patched entityIds
        if content != instance.content:
            instance.content = content
            instance.save(update_fields=["content"])

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        read_serializer = NotebookEntrySerializer(write_serializer.instance)
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
