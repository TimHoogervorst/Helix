from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.core.paginator import Paginator as DjangoPaginator
from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from core.models import Folder, Project
from mods.access.policies import role as get_role
from mods.access.policies import effective_role
from mods.access.scoping import visible_folders_q, visible_rows_q
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


def _resolve_folder_beneath_root(project: Project, path_str: str) -> Folder | Project:
    """Resolve a path beneath a Project, returning the Project at its root.

    Returns the Project for an empty path.
    Raises ``Http404`` if any segment does not match an existing folder.

    The first segment at the target project root may resolve to a shared
    folder from a different project.  Once inside a shared folder the
    remaining segments are resolved from the source project's foldertree.
    """
    from mods.access.models import FolderShare

    if not path_str or path_str == "/":
        return project

    segments = [s for s in path_str.strip("/").split("/") if s]
    parent = project

    for i, segment in enumerate(segments):
        if parent is project:
            try:
                folder = Folder.objects.get(
                    parent__isnull=True, name=segment, project=project,
                )
                parent = folder
                continue
            except Folder.DoesNotExist:
                share = FolderShare.objects.filter(
                    target_project=project,
                    source_folder__parent__isnull=True,
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
    """Legacy implementation retained only for migration reference."""

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

        is_at_root = folder is project

        # ── Folders ──────────────────────────────────────────────────
        folders_qs = Folder.objects.filter(
            project=project,
            parent__isnull=True if is_at_root else False,
        ) if is_at_root else Folder.objects.filter(parent=folder)
        folders_qs = folders_qs.prefetch_related(
            "outgoing_shares__target_project",
        ).order_by("name")

        if is_at_root:
            shared_items = _get_shared_folders(project)
        else:
            shared_items = []

        # ── Entries ──────────────────────────────────────────────────
        source_type = ContentType.objects.get_for_model(folder)
        source_id = folder.pk
        if is_at_root:
            source_type = ContentType.objects.get_for_model(project)
            source_id = project.pk
        entries_qs = (
            apps.get_model("eln", "NotebookEntry")
            .objects.filter(source_type=source_type, source_id=source_id)
            .select_related("author", "schema", "source_type")
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
                    "source_type": e.source_type_id,
                    "source_type_name": e.source_type.model,
                    "source_id": e.source_id,
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
        response.data["current_folder_id"] = folder.id if not is_at_root else None
        response.data["current_project_id"] = project.id
        response.data["project_uid"] = project.uid
        response.data["project_name"] = project.name
        response.data["project_is_archived"] = project.is_archived
        response.data["project_icon"] = project.icon_key
        response.data["project_color"] = project.color_key
        response.data["breadcrumb_path"] = path_str if not is_at_root else ""
        return response


SOURCE_MODELS = {
    "project": Project,
    "folder": Folder,
    "entry": lambda: apps.get_model("eln", "NotebookEntry"),
    "entity": lambda: apps.get_model("lims", "Entity"),
}


def _source_model(kind):
    model = SOURCE_MODELS.get(kind.lower())
    if model is None:
        raise Http404("Unsupported source type.")
    return model() if callable(model) and not hasattr(model, "_meta") else model


def _resolve_source(kind, source_id):
    model = _source_model(kind)
    try:
        queryset = model.objects.all()
        if model is not Project:
            queryset = queryset.select_related("project")
        return queryset.get(pk=source_id)
    except (model.DoesNotExist, ValueError):
        raise Http404("Source not found.")


def _children_qs(model, parent):
    content_type = ContentType.objects.get_for_model(parent, for_concrete_model=False)
    return model.objects.filter(
        source_type=content_type,
        source_id=parent.pk,
    ).select_related("source_type")


def _source_fields(item):
    return {
        "source_type": item.source_type_id,
        "source_type_name": item.source_type.model,
        "source_id": item.source_id,
    }


def _children_count(item, user):
    scopes = {
        Folder: visible_folders_q(user),
        apps.get_model("eln", "NotebookEntry"): visible_rows_q(user),
        apps.get_model("lims", "Entity"): visible_rows_q(user),
    }
    return sum(
        _children_qs(model, item).filter(scope).count()
        for model, scope in scopes.items()
    )


def _folder_item(folder, user, *, shared=False):
    item = {
        "type": "folder",
        "id": folder.id,
        "name": folder.name,
        "parent": folder.parent_id,
        "created_at": folder.created_at,
        "icon": "folder",
        "color": "muted",
        "is_shared": shared,
        "children_count": _children_count(folder, user),
    }
    if shared:
        project = folder.project
        item.update({
            "source_project_id": project.id,
            "source_project_name": project.name,
            "source_project_icon": project.icon_key,
            "source_project_color": project.color_key,
        })
    outgoing = list(folder.outgoing_shares.select_related("target_project").all())
    if outgoing:
        item["share_summary"] = {
            "shared": True,
            "target_projects": [
                {
                    "id": share.target_project.id,
                    "name": share.target_project.name,
                    "icon_key": share.target_project.icon_key,
                    "color_key": share.target_project.color_key,
                }
                for share in outgoing
            ],
        }
    return item


def _entry_item(entry, user):
    return {
        "type": "entry",
        "id": entry.id,
        "workspace_id": "eln",
        "display_id": entry.display_id,
        "title": entry.name,
        **_source_fields(entry),
        "author_username": entry.author.username if entry.author else None,
        "author_info": UserSerializer(entry.author).data if entry.author else None,
        "status": entry.status,
        "description": _first_paragraph_text(entry.content),
        "tags": TagSerializer(entry.tags.all(), many=True).data,
        "editors": [],
        "samples_count": None,
        "attachments_count": None,
        "property_fields": {},
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "icon": entry.schema.icon if entry.schema else "",
        "color": entry.schema.color if entry.schema else "",
        "children_count": _children_count(entry, user),
    }


def _entity_item(entity, user):
    return {
        "type": "entity",
        "id": entity.id,
        "workspace_id": "lims",
        "display_id": entity.display_id,
        "title": entity.name,
        **_source_fields(entity),
        "author_username": entity.author.username if entity.author else None,
        "author_info": UserSerializer(entity.author).data if entity.author else None,
        "status": entity.status,
        "description": "",
        "tags": TagSerializer(entity.tags.all(), many=True).data,
        "editors": [],
        "samples_count": None,
        "attachments_count": None,
        "property_fields": entity.properties or {},
        "created_at": entity.created_at,
        "updated_at": entity.updated_at,
        "icon": entity.schema.icon if entity.schema else "",
        "color": entity.schema.color if entity.schema else "",
        "children_count": _children_count(entity, user),
    }


def _serialize_source_item(item, user, *, shared=False):
    if isinstance(item, Folder):
        return _folder_item(item, user, shared=shared)
    if item.__class__.__name__ == "NotebookEntry":
        return _entry_item(item, user)
    return _entity_item(item, user)


class LibraryChildrenView(APIView):
    """Return direct or recursive mixed children of a Source."""

    def get(self, request):
        kind = request.query_params.get("source_type")
        source_id = request.query_params.get("source_id")
        if not kind or not source_id:
            raise Http404("source_type and source_id are required.")

        if kind.lower() == "project":
            try:
                parent = Project.objects.get(uid=source_id)
            except (Project.DoesNotExist, ValueError):
                parent = _resolve_source(kind, source_id)
        else:
            parent = _resolve_source(kind, source_id)

        if isinstance(parent, Project) and get_role(request.user, parent) is None:
            raise Http404("Source not found.")
        if not isinstance(parent, Project) and effective_role(request.user, parent) is None:
            raise Http404("Source not found.")

        models = (
            ("folder", Folder, visible_folders_q(request.user)),
            ("entry", apps.get_model("eln", "NotebookEntry"), visible_rows_q(request.user)),
            ("entity", apps.get_model("lims", "Entity"), visible_rows_q(request.user)),
        )
        recursive = request.query_params.get("recursive", "0").lower() in {"1", "true", "yes"}
        search = request.query_params.get("search", "").strip().lower()
        rows = []
        queue = [(_children_qs(model, parent).filter(scope), 0) for _, model, scope in models]

        if isinstance(parent, Project):
            from mods.access.models import FolderShare

            shared_ids = FolderShare.objects.filter(
                target_project=parent,
                source_folder__parent__isnull=True,
            ).values_list("source_folder_id", flat=True)
            queue[0] = (queue[0][0] | Folder.objects.filter(pk__in=shared_ids), 0)

        pending = []
        for query, depth in queue:
            pending.extend((item, depth) for item in query)

        visited = set()
        while pending:
            item, depth = pending.pop(0)
            marker = (item.__class__, item.pk)
            if marker in visited:
                continue
            visited.add(marker)
            serialized = _serialize_source_item(
                item,
                request.user,
                shared=isinstance(parent, Project)
                and isinstance(item, Folder)
                and item.project_id != parent.id,
            )
            if not search or search in serialized.get("name", serialized.get("title", "")).lower():
                serialized["depth"] = depth
                rows.append(serialized)
            if recursive:
                for _, model, scope in models:
                    pending.extend((child, depth + 1) for child in _children_qs(model, item).filter(scope))

        type_order = {"folder": 0, "entry": 1, "entity": 2}
        rows.sort(key=lambda row: (row["depth"], type_order[row["type"]], row.get("name", row.get("title", "")).lower()))
        paginator = MixedListPagination()
        page_items = paginator.paginate_queryset(rows, request)
        response = paginator.get_paginated_response(page_items)
        if isinstance(parent, Project):
            response.data.update({
                "current_project_id": parent.id,
                "project_uid": str(parent.uid),
                "project_name": parent.name,
                "project_is_archived": parent.is_archived,
                "project_icon": parent.icon_key,
                "project_color": parent.color_key,
            })
        return response


class LibraryFolderListView(APIView):
    """GET /api/library/folders/?project=<uid>

    Returns a flat, alphabetically sorted list of folders for *project*, each
    with a Project-relative ``id``, ``name``, and ``path``. Requires at least
    Read access to the Project.
    """

    def get(self, request):
        project_uid = request.query_params.get("project")
        if not project_uid:
            raise Http404("Project parameter is required.")

        project = _resolve_project(project_uid)

        effective = get_role(request.user, project)
        if effective is None:
            raise Http404("Project not found.")

        descendants = (
            Folder.objects.filter(project=project)
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
