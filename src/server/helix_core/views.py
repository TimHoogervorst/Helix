"""API views for Schema, SchemaType, and Mod Registry.

SchemaViewSet replaces the LIMS-owned EntityTypeViewSet with endpoints
that manage the shared ``Schema`` model.  SchemaTypeViewSet provides a
read-only list for populating the Schema Type selector dropdown.

ModRegistryView exposes the backend-owned mod data (workspace IDs,
schema types, and action catalogs) at ``GET /api/mod-registry/``.
"""

import logging
import uuid

from django.db.models import Q
from rest_framework import serializers, viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from helix_core.models import Schema, SchemaType
from helix_core.serializers import (
    SchemaListSerializer,
    SchemaWriteSerializer,
    SchemaTypeListSerializer,
)

from helix_core.models import EntityHubView
from helix_core.serializers import EntityHubSerializer, EntityHubPaginator
from helix_core.column_types import registry as column_type_registry
from helix_core.query_builder import (
    FilterSpec,
    build_entity_hub_filters,
    parse_filter_params,
)

logger = logging.getLogger(__name__)

# ── Common column descriptors ─────────────────────────────────────────────
#
# Each common column carries a ``type`` ID from the column type registry,
# ``filterable`` (derived from whether the type has filter operators), and
# ``width`` (null for now — rendering is wired in a follow-up).

_COMMON_COLUMN_DEFS: list[dict] = [
    {"key": "display_id",    "label": "ID",          "type": "text"},
    {"key": "name",          "label": "Name",        "type": "text"},
    {"key": "schema_type_id","label": "Schema Type",  "type": "text"},
    {"key": "status",        "label": "Status",      "type": "dropdown"},
    {"key": "author",        "label": "Author",      "type": "user"},
    {"key": "created_at",    "label": "Created",     "type": "datetime"},
    {"key": "updated_at",    "label": "Updated",     "type": "datetime"},
]


def _resolve_column_meta(col_type: str) -> dict:
    """Return ``filterable`` and ``width`` for a column type ID.

    Looks up *col_type* in the column type registry.  ``filterable`` is
    ``True`` when the type has at least one filter operator.  ``width`` is
    always ``None`` for now — rendering is wired in a follow-up.
    """
    ct = column_type_registry.get_column_type(col_type)
    return {
        "filterable": bool(ct.get_operators()) if ct else False,
        "width": None,
    }


def _build_common_column(col_def: dict) -> dict:
    """Resolve a common-column descriptor into a full available_columns entry."""
    return {
        "key": col_def["key"],
        "label": col_def["label"],
        "source": "common",
        "type": col_def["type"],
        **_resolve_column_meta(col_def["type"]),
    }


def _build_available_columns() -> list[dict]:
    """Return the full list of common available columns."""
    return [_build_common_column(c) for c in _COMMON_COLUMN_DEFS]


def _enrich_schema_column(col: dict, source: str) -> dict:
    """Return an available_columns entry for a schema/schema_type column.

    Derives ``type`` from the column definition and ``filterable``/``width``
    from the column type registry.
    """
    col_type = col.get("type", "text")
    result = {
        "key": col.get("name", ""),
        "label": col.get("name", ""),
        "source": source,
        "type": col_type,
        **_resolve_column_meta(col_type),
    }
    dropdown_id = col.get("dropdownId")
    if dropdown_id is not None:
        result["dropdownId"] = dropdown_id
    return result

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
    permission_classes: list = []

    def get_queryset(self):
        qs = EntityHubView.objects.select_related("author", "schema").all()
        return self._apply_filters(qs)

    def _parse_filter_params(self):
        """Return a dict of parsed filter params, cached on the viewset.

        Parses ``?f=`` params into structured filter specs (new
        ``column:operator:value`` format) and legacy filters (old
        ``key:value`` format), using :func:`parse_filter_params`.
        """
        if hasattr(self, "_filter_params"):
            return self._filter_params
        request = self.request
        raw_filters: list[str] = request.query_params.getlist("f")
        structured, legacy = parse_filter_params(raw_filters)
        self._filter_params = {
            "search": request.query_params.get("search", "").strip(),
            "schema_type": request.query_params.get("schema_type", "").strip(),
            "schema": request.query_params.get("schema", "").strip(),
            "status": request.query_params.get("status", "").strip(),
            "sort": request.query_params.get("sort", "").strip(),
            # New structured filter specs (column:operator:value)
            "filter_specs": structured,
            # Legacy exact-match field filters (key:value)
            "field_filters": legacy,
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

        # ── Structured field filters (new ?f=column:operator:value) ───
        if params["filter_specs"]:
            qs = qs.filter(
                build_entity_hub_filters(params["filter_specs"])
            )

        # ── Legacy field filters (repeatable ?f=key:value) ─────────────
        if params["field_filters"]:
            qs = qs.filter(
                build_entity_hub_filters([], params["field_filters"])
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
        columns = _build_available_columns()

        if params["schema"]:
            try:
                schema_obj = Schema.objects.get(
                    pk=int(params["schema"]), is_active=True
                )
                for col in schema_obj.columns:
                    columns.append(_enrich_schema_column(col, "schema"))
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
                    columns.append(_enrich_schema_column(col, "schema_type"))
            except (SchemaType.DoesNotExist, IndexError):
                pass

        response.data["available_columns"] = columns
        return response


class EntityHubQueryView(APIView):
    """POST endpoint for structured entity hub queries.

    ``POST /api/registry/entities/query/`` accepts a JSON body with an
    optional ``filters`` array.  Each filter is an object with:

    * ``column`` — the column key (e.g. ``"name"``, ``"concentration"``)
    * ``operator`` — the operator ID (e.g. ``"eq"``, ``"contains"``, ``"gt"``)
    * ``value`` — the filter value as a string

    The endpoint also accepts the same query parameters as the GET endpoint
    (``search``, ``schema_type``, ``schema``, ``status``, ``sort``, ``page``,
    ``size``) so the full filter state can be sent in one request.

    Returns the same paginated response shape as GET
    ``/api/registry/entities/``.
    """

    permission_classes: list = []

    def post(self, request):
        from rest_framework import serializers as drf_serializers

        # ── Parse structured filters from JSON body ────────────────────
        raw_filters: list[dict] = request.data.get("filters", [])
        filter_specs: list[FilterSpec] = []
        errors: list[str] = []

        for i, f in enumerate(raw_filters):
            column = f.get("column", "")
            operator = f.get("operator", "")
            value = f.get("value", "")
            if not column or not operator:
                errors.append(
                    f"filters[{i}]: 'column' and 'operator' are required."
                )
                continue
            filter_specs.append(
                FilterSpec(column=str(column), operator=str(operator), value=str(value))
            )

        if errors:
            raise drf_serializers.ValidationError(errors)

        # ── Build the filtered queryset ────────────────────────────────
        qs = EntityHubView.objects.select_related("author", "schema").all()

        # Search
        search = request.data.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(display_id__icontains=search)
            )

        # Schema type
        schema_type = request.data.get("schema_type", "").strip()
        if schema_type:
            qs = qs.filter(schema_type_id=schema_type)

        # Schema
        schema = request.data.get("schema", "").strip()
        if schema:
            qs = qs.filter(schema_id=schema)

        # Status
        status_val = request.data.get("status", "").strip()
        if status_val in ("in_progress", "finished"):
            qs = qs.filter(status=status_val)

        # Structured filters from POST body
        if filter_specs:
            qs = qs.filter(build_entity_hub_filters(filter_specs))

        # Sort
        sort = request.data.get("sort", "").strip()
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

        # ── Paginate ───────────────────────────────────────────────────
        paginator = EntityHubPaginator()
        page = paginator.paginate_queryset(qs, request)
        serializer = EntityHubSerializer(
            page, many=True, context={"request": request}
        )

        response = paginator.get_paginated_response(serializer.data)

        # ── available_columns ──────────────────────────────────────────
        columns = _build_available_columns()
        if schema:
            try:
                schema_obj = Schema.objects.get(
                    pk=int(schema), is_active=True
                )
                for col in schema_obj.columns:
                    columns.append(_enrich_schema_column(col, "schema"))
            except (Schema.DoesNotExist, ValueError):
                pass
        elif schema_type:
            try:
                workspace_id = schema_type.split(".")[0]
                schema_type_obj = SchemaType.objects.get(
                    workspace_id=workspace_id, is_active=True
                )
                for col in schema_type_obj.columns:
                    columns.append(_enrich_schema_column(col, "schema_type"))
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
    permission_classes: list = []
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
    permission_classes: list = []
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


class ActionCreateView(APIView):
    """Unified endpoint for all action logging.

    ``POST /api/actions/`` accepts:

    * ``action`` — triple-dotted action identifier (e.g.
      ``"eln.entry.created"``).
    * ``action_type`` — core CRUD verb (``"created"``, ``"edited"``, or
      ``"deleted"``).
    * ``target_type`` — namespaced target, e.g. ``"eln.entry"``.
    * ``target_id`` — primary key of the target record.
    * ``workspace_id`` — the owning mod / workspace identifier.
    * ``metadata`` — optional JSON payload.
    * ``timestamp`` — optional ISO 8601 datetime (accepted, currently
      ignored).

    The backend:

    1. Resolves ``workspace_id`` to the owning mod.
    2. Validates ``action`` against that mod's registered action catalog.
    3. Routes to the correct mod action table.
    4. Creates a single action row with both ``action`` and
       ``action_type`` populated.
    5. Returns ``201 Created`` with the created action row as a JSON
       array.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from helix_core.actions.serializers import ActionCreateSerializer
        from helix_core.actions.registry import (
            get_action_catalog,
            get_action_model,
        )

        # ── validate input ──────────────────────────────────────────────
        serializer = ActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        action: str = validated["action"]
        action_type: str = validated["action_type"]
        target_type: str = validated["target_type"]
        target_id: int = validated["target_id"]
        workspace_id: str = validated["workspace_id"]
        metadata: dict = validated.get("metadata", {})

        # ── validate action against the workspace's catalog ─────────────
        catalog = get_action_catalog(workspace_id)
        if not catalog:
            raise serializers.ValidationError(
                f"No action model registered for workspace "
                f"'{workspace_id}'. Did you forget to call "
                f"register_action_model()?"
            )

        catalog_action_ids = {entry["id"] for entry in catalog}
        if action not in catalog_action_ids:
            available = ", ".join(sorted(catalog_action_ids))
            raise serializers.ValidationError(
                f"Unknown action '{action}' for workspace "
                f"'{workspace_id}'. Available action types: {available}"
            )

        # ── route to the correct mod action model ────────────────────────
        model_class = get_action_model(workspace_id)
        if model_class is None:
            raise serializers.ValidationError(
                f"No action model registered for workspace '{workspace_id}'."
            )

        # ── capture client IP ────────────────────────────────────────────
        client_ip = request.META.get("REMOTE_ADDR", "") or None

        # ── resolve request_id (client-provided or server-generated) ─────
        request_id = validated.get("request_id", uuid.uuid4())

        # ── create the action row ────────────────────────────────────────
        row = model_class.objects.create(
            performed_by=request.user,
            action=action,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
            client_ip=client_ip,
            request_id=request_id,
        )

        # ── serialize response ───────────────────────────────────────────
        return Response(
            [_serialize_action_row(row)],
            status=status.HTTP_201_CREATED,
        )


def _serialize_action_row(row) -> dict:
    """Serialize a single action row into the deterministic response shape.

    Produces a dict with keys ``id``, ``action``, ``action_type``,
    ``target_type``, ``target_id``, ``metadata``, ``created_at``, and
    ``performed_by`` (nested user dict).
    """
    performed_by = None
    if row.performed_by is not None:
        performed_by = {
            "id": row.performed_by.pk,
            "username": row.performed_by.username,
        }

    created_at = None
    if row.created_at is not None:
        created_at = row.created_at.isoformat().replace("+00:00", "Z")

    return {
        "id": row.pk,
        "action": row.action,
        "action_type": row.action_type,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "metadata": row.metadata or {},
        "created_at": created_at,
        "performed_by": performed_by,
    }


class ModRegistryView(APIView):
    """Expose all backend-owned mod data.

    ``GET /api/mod-registry/`` returns a JSON object keyed by workspace
    ID.  Each entry contains ``workspaceId``, ``schemaTypes``, and
    ``actions`` — the data the frontend needs to bootstrap its mod
    registry without hard-coding per-mod metadata.

    The response is built from already-populated ``SchemaType`` rows
    (created by ``register_schema_type()`` in each mod's ``mod.py``)
    and registered action models.
    """

    permission_classes: list = []

    def get(self, request):
        from helix_core.mod_system.registry import registry

        payload = registry.get_registry_payload()
        return Response(payload)

    def post(self, request):
        """Sync frontend block action IDs into the backend action catalog.

        ``POST /api/mod-registry/sync-actions/`` accepts a mod ID and a
        list of action objects (``{"id": str, "core": str}``), atomically
        replaces all custom actions for the mod, derives human-readable
        labels, and validates that every provided action ID exists in the
        catalog after upsert.

        Hard-fails (400) when any action IDs are missing from the catalog
        after the sync — the frontend treats this as a boot error.
        """
        from helix_core.mod_system.registry import registry

        mod_id = request.data.get("mod_id")
        actions = request.data.get("actions", [])

        if not mod_id:
            return Response(
                {"status": "error", "error": "mod_id is required"},
                status=400,
            )

        result = registry.sync_actions(mod_id, actions)

        if result["status"] == "error":
            return Response(result, status=400)

        return Response(result)
