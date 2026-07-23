"""API views for Schema and SchemaType.

SchemaViewSet replaces the LIMS-owned EntityTypeViewSet with endpoints
that manage the shared ``Schema`` model.  SchemaTypeViewSet provides a
read-only list for populating the Schema Type selector dropdown.
"""

import logging

from django.db.models import Q
from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.models import Schema, SchemaType
from helix_core.serializers import (
    SchemaListSerializer,
    SchemaWriteSerializer,
    SchemaTypeListSerializer,
)

from helix_core.models import EntityHubView
from helix_core.serializers import EntityHubSerializer, EntityHubPaginator

logger = logging.getLogger(__name__)

AVAILABLE_COLUMNS = [
    {"key": "display_id", "label": "ID", "source": "common"},
    {"key": "name", "label": "Name", "source": "common"},
    {"key": "schema_type_id", "label": "Schema Type", "source": "common"},
    {"key": "status", "label": "Status", "source": "common"},
    {"key": "author", "label": "Author", "source": "common"},
    {"key": "created_at", "label": "Created", "source": "common"},
    {"key": "updated_at", "label": "Updated", "source": "common"},
]

SORTABLE_FIELDS = frozenset({"name", "status", "created_at", "updated_at"})


class EntityHubListView(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Read-only list of all entities from the entity_hub_view VIEW.

    GET /api/registry/entities/ — returns paginated entity rows with
    ``results``, ``total``, ``page``, ``size``, and ``available_columns``.
    Each row carries a ``workspace_id`` for building workspace URLs on the
    frontend.

    Query Parameters
    ----------------
    search : str
        Case-insensitive search across ``name`` and ``display_id``.
    schema_type : str
        Filter by schema_type_id (e.g. ``eln.entry``, ``lims.entity``).
    schema : int
        Filter by specific schema ID.
    status : str
        Filter by status: ``in_progress`` or ``finished``.
    sort : str
        Sort by field. Prefix with ``-`` for descending order.
        Supported fields: name, status, created_at, updated_at.
    f : str (repeatable)
        Field filters in ``key:value`` format, applied against the
        ``properties`` JSON column.
    """

    serializer_class = EntityHubSerializer
    pagination_class = EntityHubPaginator
    permission_classes = []

    def get_queryset(self):
        qs = EntityHubView.objects.select_related("author", "schema").all()
        return self._apply_filters(qs)

    def _parse_filter_params(self):
        """Return a dict of parsed filter params, cached on the viewset."""
        if hasattr(self, "_filter_params"):
            return self._filter_params
        request = self.request
        self._filter_params = {
            "search": request.query_params.get("search", "").strip(),
            "schema_type": request.query_params.get("schema_type", "").strip(),
            "schema": request.query_params.get("schema", "").strip(),
            "status": request.query_params.get("status", "").strip(),
            "field_filters": request.query_params.getlist("f"),
            "sort": request.query_params.get("sort", "").strip(),
        }
        return self._filter_params

    def _apply_filters(self, qs):
        params = self._parse_filter_params()

        # ── Search: name + display_id ──────────────────────────────────
        if params["search"]:
            qs = qs.filter(
                Q(name__icontains=params["search"])
                | Q(display_id__icontains=params["search"])
            )

        # ── Schema type filter ─────────────────────────────────────────
        if params["schema_type"]:
            qs = qs.filter(schema_type_id=params["schema_type"])

        # ── Schema filter ──────────────────────────────────────────────
        if params["schema"]:
            qs = qs.filter(schema_id=params["schema"])

        # ── Status filter ──────────────────────────────────────────────
        if params["status"] in ("in_progress", "finished"):
            qs = qs.filter(status=params["status"])

        # ── Field filters (repeatable ?f=key:value) ────────────────────
        for ff in params["field_filters"]:
            if ":" in ff:
                key, value = ff.split(":", 1)
                qs = qs.filter(
                    Q(properties__has_key=key)
                    & Q(properties__contains={key: value})
                )

        # ── Sort ───────────────────────────────────────────────────────
        sort = params["sort"]
        if sort:
            descending = False
            if sort.startswith("-"):
                descending = True
                sort = sort[1:]
            if sort in SORTABLE_FIELDS:
                ordering = f"-{sort}" if descending else sort
                qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-updated_at")

        return qs

    def get_serializer_context(self):
        """Add schema_columns to context so _expanded can be populated."""
        context = super().get_serializer_context()
        params = self._parse_filter_params()
        if params["schema"]:
            try:
                schema_obj = Schema.objects.get(
                    pk=int(params["schema"]), is_active=True
                )
                context["schema_columns"] = [
                    col.get("name", "")
                    for col in schema_obj.columns
                ]
            except (Schema.DoesNotExist, ValueError):
                pass
        return context

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)

        # ── Compute available_columns dynamically ──────────────────────
        params = self._parse_filter_params()
        columns = list(AVAILABLE_COLUMNS)

        if params["schema"]:
            try:
                schema_obj = Schema.objects.get(
                    pk=int(params["schema"]), is_active=True
                )
                for col in schema_obj.columns:
                    columns.append({
                        "key": col.get("name", ""),
                        "label": col.get("name", ""),
                        "source": "schema",
                    })
            except (Schema.DoesNotExist, ValueError):
                pass
        elif params["schema_type"]:
            try:
                # Derive workspace_id from schema_type_id (format: "mod.entity")
                workspace_id = params["schema_type"].split(".")[0]
                schema_type_obj = SchemaType.objects.get(
                    workspace_id=workspace_id, is_active=True
                )
                for col in schema_type_obj.columns:
                    columns.append({
                        "key": col.get("name", ""),
                        "label": col.get("name", ""),
                        "source": "schema_type",
                    })
            except (SchemaType.DoesNotExist, IndexError):
                pass

        response.data["available_columns"] = columns
        return response


class SchemaTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only list of registered SchemaTypes.

    GET /api/schema-types/ — list all active SchemaTypes (for dropdowns).
    """

    queryset = SchemaType.objects.filter(is_active=True)
    serializer_class = SchemaTypeListSerializer
    permission_classes = []
    pagination_class = None


class SchemaViewSet(viewsets.ModelViewSet):
    """API endpoint for managing Schemas.

    list:    GET    /api/schemas/
    create:  POST   /api/schemas/
    retrieve: GET   /api/schemas/{id}/
    update:  PUT    /api/schemas/{id}/
    partial_update: PATCH /api/schemas/{id}/
    destroy: DELETE /api/schemas/{id}/  — soft-deletes (sets is_active=False)
    delete_all: DELETE /api/schemas/delete_all/ — hard-deletes all schemas
    """

    queryset = Schema.objects.select_related("schema_type").filter(is_active=True)
    permission_classes = []
    pagination_class = None

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return SchemaListSerializer
        return SchemaWriteSerializer

    def perform_destroy(self, instance):
        """Soft-delete: set is_active=False instead of removing the row."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["delete"], url_path="delete_all")
    def delete_all(self, request):
        """Hard-delete ALL schemas. Danger zone endpoint for testing.

        Order matters — delete child entities first to respect FK constraints.
        """
        from django.db.utils import OperationalError

        from mods.lims.models import Entity
        from mods.eln.models import NotebookEntry

        # Delete entities first (they have FK to Schema)
        Entity.objects.all().delete()
        NotebookEntry.objects.all().delete()

        try:
            count, _ = Schema.objects.all().delete()
        except OperationalError:
            # If a test-only model (e.g. ConcreteTestEntity) has registered
            # an FK to Schema but its table hasn't been created yet, the
            # cascade collector will fail.  Fall back to a raw delete since
            # all real referencing rows were already removed above.
            from django.db import connection
            count = Schema.objects.count()
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM {}".format(Schema._meta.db_table)
                )
        return Response({"deleted": count})
