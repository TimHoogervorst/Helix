from django.core.paginator import Paginator as DjangoPaginator
from django.db import models
from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from core.models import Folder
from eln.models import NotebookEntry


class MixedListPagination(PageNumberPagination):
    """DRF pagination that works on a plain Python list (not a QuerySet)."""

    page_size = 50
    page_size_query_param = "page_size"

    def paginate_queryset(self, queryset, request, view=None):
        self.request = request
        page_number = int(request.query_params.get(self.page_query_param, 1))
        page_size = self.get_page_size(request)
        paginator = DjangoPaginator(queryset, page_size)
        self.page = paginator.page(page_number)
        return list(self.page)


def resolve_path(path_str: str) -> Folder | None:
    """Resolve a ``/``-separated path string to a Folder instance.

    Returns ``None`` for root (no parent folder).
    Raises ``Http404`` if any segment does not match an existing folder.
    """
    if not path_str or path_str == "/":
        return None

    segments = [s for s in path_str.strip("/").split("/") if s]
    parent = None
    for segment in segments:
        try:
            folder = Folder.objects.get(parent=parent, name=segment)
            parent = folder
        except Folder.DoesNotExist:
            raise Http404(f"Folder not found: {path_str}")
    return parent


class LibraryContentsView(APIView):
    """
    GET /api/library/contents/?path=<path>&search=<q>&page=<n>

    Returns a paginated, mixed list of folders and entries at the given
    path.  Folders are listed first (alphabetical by name), followed by
    entries (newest first by ``created_at``).  Every item carries a
    ``type`` discriminator (``"folder"`` or ``"entry"``).
    """

    permission_classes = []

    def get(self, request):
        path_str = request.query_params.get("path", "")
        search = request.query_params.get("search", "")

        folder = resolve_path(path_str)  # raises Http404 if not found

        # ── Folders ──────────────────────────────────────────────────
        folders_qs = Folder.objects.filter(parent=folder).order_by("name")
        if search:
            folders_qs = folders_qs.filter(name__icontains=search)

        # ── Entries ──────────────────────────────────────────────────
        entries_qs = (
            NotebookEntry.objects.filter(folder=folder)
            .select_related("author", "folder")
            .order_by("-created_at")
        )
        if search:
            entries_qs = entries_qs.filter(
                models.Q(title__icontains=search)
                | models.Q(display_id__icontains=search)
            )

        # ── Build mixed list: folders first, then entries ────────────
        items = []
        for f in folders_qs:
            items.append(
                {
                    "type": "folder",
                    "id": f.id,
                    "name": f.name,
                    "parent": f.parent_id,
                    "created_at": f.created_at,
                }
            )
        for e in entries_qs:
            items.append(
                {
                    "type": "entry",
                    "id": e.id,
                    "display_id": e.display_id,
                    "title": e.title,
                    "folder": e.folder_id,
                    "folder_name": e.folder.name if e.folder else None,
                    "author_username": e.author.username if e.author else None,
                    "created_at": e.created_at,
                    "updated_at": e.updated_at,
                }
            )

        paginator = MixedListPagination()
        page_items = paginator.paginate_queryset(items, request)
        response = paginator.get_paginated_response(page_items)
        # Include the resolved folder ID so the frontend can create items
        # at the current path without re-resolving it.
        response.data["current_folder_id"] = folder.id if folder else None
        return response
