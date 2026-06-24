from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import NotebookEntry
from .serializers import NotebookEntrySerializer, NotebookEntryCreateSerializer


class NotebookEntryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for ELN notebook entries.

    list: GET /api/eln/entries/ — list all entries (paginated)
    create: POST /api/eln/entries/ — create a new entry (auth required)
    retrieve: GET /api/eln/entries/{id}/ — get single entry with full content
    update: PUT /api/eln/entries/{id}/ — update entry (auth required)
    partial_update: PATCH /api/eln/entries/{id}/ — partial update (auth required)
    destroy: DELETE /api/eln/entries/{id}/ — delete entry (auth required)
    """

    queryset = NotebookEntry.objects.select_related("author", "folder").prefetch_related(
        "mentions"
    )
    serializer_class = NotebookEntrySerializer

    def get_serializer_class(self):
        if self.action == "create":
            return NotebookEntryCreateSerializer
        return NotebookEntrySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return []
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        # Use the full read serializer for the response
        read_serializer = NotebookEntrySerializer(write_serializer.instance)
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
