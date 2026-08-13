from django.apps import apps
from django.core.paginator import Paginator as DjangoPaginator
from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from core.models import Folder, Project
from mods.access.policies import role as get_role
from mods.tags.serializers import TagSerializer
from mods.users.serializers import UserSerializer


def _ancestor_ids(folder):
    """Return a set of ancestor folder IDs for *folder*."""
    ids = set()
    node = folder.parent
    while node is not None:
        ids.add(node.id)
        node = node.parent
    return ids


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


def _resolve_project(project_uid: str) -> Project:
    """Resolve a Project by its immutable UID.

    Raises ``Http404`` if no matching Project exists.
    """
    try:
        return Project.objects.get(uid=project_uid)
    except Project.DoesNotExist:
        raise Http404("Project not found.")


def _resolve_folder_beneath_root(project: Project, path_str: str) -> Folder | None:
    """Resolve a ``/``-separated path beneath *project*'s hidden root.

    Returns the hidden root folder for an empty path.
    Raises ``Http404`` if any segment does not match an existing folder.

    The first segment at the target project root may resolve to a shared
    folder from a different project.  Once inside a shared folder the
    remaining segments are resolved from the source project's foldertree.
    """
    from mods.access.models import FolderShare

    if not path_str or path_str == "/":
        return project.root_folder

    segments = [s for s in path_str.strip("/").split("/") if s]
    parent = project.root_folder

    for i, segment in enumerate(segments):
        if parent.is_hidden_root:
            try:
                folder = Folder.objects.get(
                    parent=parent, name=segment, project=project,
                )
                parent = folder
                continue
            except Folder.DoesNotExist:
                share = FolderShare.objects.filter(
                    target_project=project,
                    source_folder__name=segment,
                ).select_related("source_folder").first()
                if share:
                    parent = share.source_folder
                    continue
                raise Http404(f"Folder not found: {path_str}")

        try:
            folder = Folder.objects.get(parent=parent, name=segment)
            parent = folder
        except Folder.DoesNotExist:
            raise Http404(f"Folder not found: {path_str}")
    return parent


def _first_paragraph_text(content: dict) -> str:
    """Extract the plain text of the first paragraph from a TipTap document.

    Returns an empty string when the document has no paragraph content.
    """
    if not isinstance(content, dict):
        return ""
    children = content.get("content")
    if not isinstance(children, list):
        return ""
    for node in children:
        if isinstance(node, dict) and node.get("type") == "paragraph":
            texts = node.get("content")
            if not isinstance(texts, list):
                return ""
            return "".join(
                t.get("text", "") for t in texts if isinstance(t, dict)
            )
    return ""


def _get_shared_folders(project: Project, *, include_path: bool = False) -> list[dict]:
    """Return shared folder items appearing at *project*'s root."""
    from mods.access.models import FolderShare

    shares = FolderShare.objects.filter(
        target_project=project,
    ).select_related("source_folder", "source_folder__project").order_by(
        "source_folder__name",
    )
    items = []
    for share in shares:
        source = share.source_folder
        source_project = source.project
        item = {
            "type": "folder",
            "id": source.id,
            "name": source.name,
            "parent": None,
            "created_at": source.created_at,
            "icon": "folder",
            "color": "muted",
            "is_shared": True,
            "source_project_id": source_project.id,
            "source_project_name": source_project.name,
            "source_project_icon": source_project.icon_key,
            "source_project_color": source_project.color_key,
        }
        if include_path:
            item["path"] = source.root_relative_path
        items.append(item)
    return items


class LibraryContentsView(APIView):
    """
    GET /api/library/contents/?project=<uid>&path=<path>&search=<q>&page=<n>

    Returns a paginated, mixed list of folders and entries scoped to
    *project*.  Requires at least Read access to the Project; returns
    404 otherwise.

    At the Project root, shared folders appear mixed with owned folders
    (sorted alphabetically).

    Folders are listed first (alphabetical by name), followed by entries
    (newest first by ``created_at``).  Every item carries a ``type``
    discriminator (``"folder"`` or ``"entry"``).
    """

    def get(self, request):
        project_uid = request.query_params.get("project")
        if not project_uid:
            raise Http404("Project parameter is required.")

        project = _resolve_project(project_uid)

        effective = get_role(request.user, project)
        if effective is None:
            raise Http404("Project not found.")

        path_str = request.query_params.get("path", "")

        folder = _resolve_folder_beneath_root(project, path_str)

        is_at_root = folder.is_hidden_root

        # ── Folders ──────────────────────────────────────────────────
        folders_qs = Folder.objects.filter(
            parent=folder,
        ).prefetch_related(
            "outgoing_shares__target_project",
        ).order_by("name")

        if is_at_root:
            shared_items = _get_shared_folders(project)
        else:
            shared_items = []

        # ── Entries ──────────────────────────────────────────────────
        entries_qs = (
            apps.get_model("eln", "NotebookEntry")
            .objects.filter(folder=folder)
            .select_related("author", "folder", "schema")
            .prefetch_related("tags")
            .order_by("-created_at")
        )

        # ── Search ───────────────────────────────────────────────────
        search_q = request.query_params.get("search", "").strip()

        # ── Build mixed list: folders first (shared + own), then entries ──
        items = []

        def _is_shared(name: str) -> bool:
            return any(s["name"] == name for s in shared_items)

        for f in folders_qs:
            if search_q and search_q.lower() not in f.name.lower():
                continue
            item = {
                "type": "folder",
                "id": f.id,
                "name": f.name,
                "parent": f.parent_id,
                "created_at": f.created_at,
                "icon": "folder",
                "color": "muted",
                "is_shared": False,
            }
            outgoing = f.outgoing_shares.all()
            if outgoing:
                item["share_summary"] = {
                    "shared": True,
                    "target_projects": [
                        {
                            "id": s.target_project.id,
                            "name": s.target_project.name,
                            "icon_key": s.target_project.icon_key,
                            "color_key": s.target_project.color_key,
                        }
                        for s in outgoing
                    ],
                }
            items.append(item)

        for shared in shared_items:
            if search_q and search_q.lower() not in shared["name"].lower():
                continue
            items.append(shared)

        # folders-first: shared folders sort alphabetically with own folders
        folder_items = [i for i in items if i["type"] == "folder"]
        folder_items.sort(key=lambda x: x["name"].lower())
        entry_items = []

        for e in entries_qs:
            if search_q:
                title_match = search_q.lower() in e.name.lower()
                did_match = search_q.lower() in (e.display_id or "").lower()
                if not title_match and not did_match:
                    continue
            entry_items.append(
                {
                    "type": "entry",
                    "id": e.id,
                    "workspace_id": "eln",
                    "display_id": e.display_id,
                    "title": e.name,
                    "folder": e.folder_id,
                    "folder_name": e.folder.name if e.folder else None,
                    "author_username": e.author.username if e.author else None,
                    "author_info": (
                        UserSerializer(e.author).data if e.author else None
                    ),
                    "status": e.status,
                    "description": _first_paragraph_text(e.content),
                    "tags": TagSerializer(e.tags.all(), many=True).data,
                    "editors": [],
                    "samples_count": None,
                    "attachments_count": None,
                    "property_fields": {},
                    "created_at": e.created_at,
                    "updated_at": e.updated_at,
                    "icon": e.schema.icon if e.schema else "",
                    "color": e.schema.color if e.schema else "",
                }
            )

        paginator = MixedListPagination()
        page_items = paginator.paginate_queryset(
            folder_items + entry_items, request,
        )
        response = paginator.get_paginated_response(page_items)
        response.data["current_folder_id"] = folder.id if folder and not folder.is_hidden_root else None
        response.data["current_project_id"] = project.id
        response.data["project_uid"] = project.uid
        response.data["project_name"] = project.name
        response.data["project_is_archived"] = project.is_archived
        response.data["project_icon"] = project.icon_key
        response.data["project_color"] = project.color_key
        response.data["breadcrumb_path"] = path_str if not is_at_root else ""
        return response


class LibraryFolderListView(APIView):
    """GET /api/library/folders/?project=<uid>

    Returns a flat, alphabetically sorted list of non-hidden-root folders for
    *project*, each with ``id``, ``name``, and ``path`` (e.g. ``root / buffers /
    TRIS``).  Requires at least Read access to the Project.
    """

    def get(self, request):
        project_uid = request.query_params.get("project")
        if not project_uid:
            raise Http404("Project parameter is required.")

        project = _resolve_project(project_uid)

        effective = get_role(request.user, project)
        if effective is None:
            raise Http404("Project not found.")

        try:
            root = project.root_folder
        except Folder.DoesNotExist:
            return Response([])

        descendants = (
            Folder.objects.filter(project=project)
            .exclude(pk=root.pk)
            .order_by("name")
        )

        shared_folders = _get_shared_folders(project, include_path=True)

        items = []
        for f in descendants:
            items.append({
                "id": f.id,
                "name": f.name,
                "path": f.root_relative_path,
            })

        for shared in shared_folders:
            items.append({
                "id": shared["id"],
                "name": shared["name"],
                "path": shared["path"],
            })

        items.sort(key=lambda x: x["path"].lower())

        return Response(items)
