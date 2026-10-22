"""API views for Schema, SchemaType, and Mod Registry.

SchemaViewSet replaces the LIMS-owned EntityTypeViewSet with endpoints
that manage the shared ``Schema`` model.  SchemaTypeViewSet provides a
read-only list for populating the Schema Type selector dropdown.

ModRegistryView exposes the backend-owned mod data (workspace IDs,
schema types, and action catalogs) at ``GET /api/mod-registry/``.
"""

import logging
import json
import uuid
from django.http import HttpResponse

from django.db.models import F, FloatField, Q
from django.db.models.functions import Cast
from rest_framework import serializers, viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from helix_core.models import ColorToken, IconLibraryEntry, Schema, SchemaType
from helix_core.serializers import (
    ColorTokenSerializer,
    IconLibrarySerializer,
    SchemaListSerializer,
    SchemaWriteSerializer,
    SchemaTypeListSerializer,
)

from bundled.access.access.permissions import IsOrganizationAdmin, IsOrganizationAdminForWrites
from helix_core.serializers import EntityHubSerializer, EntityHubPaginator
from helix_core.column_types import registry as column_type_registry
from helix_core.formulas import evaluate_formula
from helix_core.query_builder import (
    FilterSpec,
    build_entity_hub_filters,
    parse_filter_params,
)
from bundled.access.access.scoping import visible_rows_q

logger = logging.getLogger(__name__)

# ── Content targets for the unified action-log endpoint ────────────────────
#
# ``POST /api/actions/`` validates that the submitter can Edit the logged
# target for every content target type here (Folders, Entries, Entities).
# Any other target type is not a project resource and skips the check.


def _resolve_content_target_model(target_type):
    """Return the model for *target_type* when it is a project-resource
    content target (Folder, Entry, or Entity), or ``None`` otherwise.

    Models are imported lazily to avoid import cycles between the core
    app and the content mods.
    """
    from helix_core.core.models import Folder
    from helix_core.mod_system.registry import registry
    if target_type == "core.folder":
        return Folder
    for provider, model in registry.content_source_models():
        short = provider.kind.rsplit(":", 1)[-1]
        if target_type.rsplit(".", 1)[-1] in (short, f"{short}s"):
            return model
    return None

# ── Common column descriptors ─────────────────────────────────────────────
#
# Each common column carries a ``type`` ID from the column type registry,
# ``filterable`` (derived from whether the type has filter operators), and
# ``width`` (null for now — rendering is wired in a follow-up).

_COMMON_COLUMN_DEFS: list[dict] = [
    {"key": "display_id",    "label": "ID",          "type": "text"},
    {"key": "name",          "label": "Name",        "type": "text"},
    {"key": "schema_type_id","label": "Schema Type",  "type": "text"},
    {"key": "project",       "label": "Project",     "type": "project"},
    {"key": "source",        "label": "Source",      "type": "source"},
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
    result_type = col.get("resultType") if col_type == "formula" else None
    effective_type = result_type or col_type
    result = {
        "key": col.get("name", ""),
        "label": col.get("name", ""),
        "source": source,
        "type": col_type,
        **_resolve_column_meta(effective_type),
    }
    if result_type:
        result["resultType"] = result_type
    dropdown_id = col.get("dropdownId")
    if dropdown_id is not None:
        result["dropdownId"] = dropdown_id
    reference_schema_id = col.get("referenceSchemaId")
    if reference_schema_id is not None:
        result["referenceSchemaId"] = reference_schema_id
    return result

SORTABLE_FIELDS = frozenset({"name", "status", "created_at", "updated_at", "project__name"})


def _build_column_type_map(schema_id: str, schema_type_id: str) -> dict[str, str]:
    """Build a ``{column_name: type_id}`` map from schema column definitions.

    Columns whose ``name`` is empty or whose ``type`` is missing fall back
    to ``"text"``.
    """
    column_type_map: dict[str, str] = {}

    if schema_id:
        try:
            schema_obj = Schema.objects.get(
                pk=int(schema_id), is_active=True
            )
            for col in schema_obj.columns:
                name = col.get("name", "")
                col_type = col.get("type", "text")
                if col_type == "formula":
                    col_type = col.get("resultType", "text")
                if name:
                    column_type_map[name] = col_type
        except (Schema.DoesNotExist, ValueError):
            pass

    if not column_type_map and schema_type_id:
        try:
            workspace_id = schema_type_id.split(".")[0]
            schema_type_obj = SchemaType.objects.get(
                workspace_id=workspace_id, is_active=True
            )
            for col in schema_type_obj.columns:
                name = col.get("name", "")
                col_type = col.get("type", "text")
                if col_type == "formula":
                    col_type = col.get("resultType", "text")
                if name:
                    column_type_map[name] = col_type
        except (SchemaType.DoesNotExist, IndexError):
            pass

    return column_type_map


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
        Supported fields: name, status, created_at, updated_at, project__name.
    f : str (repeatable)
        Field filters in ``key:value`` format, applied against the
        ``properties`` JSON column.
    """

    serializer_class = EntityHubSerializer
    pagination_class = EntityHubPaginator

    def get_queryset(self):
        from helix_core.mod_system.registry import registry

        rows = []
        self._source_providers = {}
        params = self._parse_filter_params()
        for provider, model in registry.content_source_models():
            if not provider.hub_visible:
                continue
            qs = model.objects.select_related(
                "author", "schema__schema_type", "project", "source_type"
            ).all()
            qs = registry.query_content_sources(provider.kind, self.request, qs)
            qs = self._apply_filters(qs)
            if params["schema_type"]:
                wanted = params["schema_type"]
                qs = [row for row in qs if self._schema_type_id(row, provider) == wanted]
            rows.extend(qs)
            self._source_providers.update({model: provider})
        sort = params["sort"] or "-updated_at"
        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        rows.sort(key=lambda row: self._sort_value(row, key), reverse=descending)
        return rows

    @staticmethod
    def _schema_type_id(row, provider):
        schema_type = getattr(getattr(row, "schema", None), "schema_type", None)
        metadata = provider.display_metadata
        if not schema_type:
            return None
        return metadata.get("schema_type_id") or f"{metadata.get('workspace_id', schema_type.workspace_id)}.{type(row)._meta.model_name}"

    @staticmethod
    def _sort_value(row, key):
        value = getattr(row, key, None)
        if value is None and key not in SORTABLE_FIELDS:
            value = (getattr(row, "properties", {}) or {}).get(key)
        return (value is None, value)

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
            # Column type map for direct column type resolution
            "column_type_map": _build_column_type_map(
                request.query_params.get("schema", "").strip(),
                request.query_params.get("schema_type", "").strip(),
            ),
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
        # ── Schema filter ──────────────────────────────────────────────
        if params["schema"]:
            qs = qs.filter(schema_id=params["schema"])

        # ── Status filter ──────────────────────────────────────────────
        if params["status"] in ("in_progress", "finished"):
            qs = qs.filter(status=params["status"])

        # ── Structured field filters (new ?f=column:operator:value) ───
        if params["filter_specs"]:
            qs = qs.filter(
                build_entity_hub_filters(
                    params["filter_specs"],
                    column_type_map=params["column_type_map"],
                )
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
            property_type = params["column_type_map"].get(sort)
            if sort in SORTABLE_FIELDS:
                ordering = f"-{sort}" if descending else sort
                qs = qs.order_by(ordering)
            elif property_type:
                # Property sorting is applied after source querysets are merged.
                return qs
        return qs

    def get_serializer_context(self):
        """Add schema_columns to context so _expanded can be populated."""
        context = super().get_serializer_context()
        context["source_providers"] = getattr(self, "_source_providers", {})
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

        # Reuse the GET implementation so POST and GET cannot diverge.
        list_view = EntityHubListView()
        list_view.request = request
        schema_type = str(request.data.get("schema_type", "")).strip()
        schema = str(request.data.get("schema", "")).strip()
        list_view._filter_params = {
            "search": str(request.data.get("search", "")).strip(),
            "schema_type": schema_type,
            "schema": schema,
            "status": str(request.data.get("status", "")).strip(),
            "sort": str(request.data.get("sort", "")).strip(),
            "filter_specs": filter_specs,
            "field_filters": [],
            "column_type_map": _build_column_type_map(schema, schema_type),
        }
        qs = list_view.get_queryset()

        # ── Paginate ───────────────────────────────────────────────────
        paginator = EntityHubPaginator()
        page = paginator.paginate_queryset(qs, request)
        serializer = EntityHubSerializer(
            page, many=True, context={"request": request, "source_providers": list_view._source_providers}
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
    pagination_class = None
    permission_classes = [IsOrganizationAdminForWrites]

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return SchemaListSerializer
        return SchemaWriteSerializer

    def perform_create(self, serializer):
        from django.db import transaction
        from helix_core.models import SchemaType

        schema_type_id = serializer.validated_data["schema_type"].pk
        with transaction.atomic():
            SchemaType.objects.select_for_update().get(pk=schema_type_id)
            serializer.save()

    def perform_update(self, serializer):
        from django.db import transaction
        from helix_core.models import Schema, SchemaType

        current = serializer.instance
        schema_type_ids = {current.schema_type_id}
        proposed_type = serializer.validated_data.get("schema_type")
        if proposed_type is not None:
            schema_type_ids.add(proposed_type.pk)
        with transaction.atomic():
            list(SchemaType.objects.select_for_update().filter(
                pk__in=schema_type_ids
            ).order_by("pk"))
            locked = Schema.objects.select_for_update().get(pk=current.pk)
            if locked.schema_type_id not in schema_type_ids:
                from helix_core.record_persistence import StateConflict
                raise StateConflict("The Schema Type changed while this Schema edit was being prepared.")
            serializer.instance = locked
            serializer.save()

    def perform_destroy(self, instance):
        """Soft-delete: set is_active=False instead of removing the row."""
        from django.db import transaction
        from helix_core.models import Schema, SchemaType

        with transaction.atomic():
            SchemaType.objects.select_for_update().get(pk=instance.schema_type_id)
            locked = Schema.objects.select_for_update().get(pk=instance.pk)
            locked.is_active = False
            locked.save(update_fields=["is_active"])

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

        from helix_core.mod_system.registry import registry
        from django.db import transaction
        from helix_core.models import SchemaType
        with transaction.atomic():
            list(SchemaType.objects.select_for_update().order_by("pk"))
            list(Schema.objects.select_for_update().order_by("pk"))
            for _provider, model in registry.content_source_models():
                model.objects.all().delete()
            try:
                count, _ = Schema.objects.all().delete()
            except OperationalError:
                # If a test-only model (e.g. ConcreteTestEntity) has registered
                # an FK to Schema but its table hasn't been created yet, the
                # cascade collector will fail. Fall back to a raw delete since
                # all real referencing rows were already removed above.
                from django.db import connection
                count = Schema.objects.count()
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM {}".format(Schema._meta.db_table)
                    )
        return Response({"deleted": count})


class FormulaEvaluateSerializer(serializers.Serializer):
    """Input for the display-only, row-scoped formula preview gateway."""

    expressions = serializers.DictField(
        child=serializers.CharField(allow_blank=False),
        allow_empty=False,
    )
    row = serializers.DictField(child=serializers.JSONField(), default=dict)


class FormulaEvaluateView(APIView):
    """Evaluate independent expressions against one row without persisting."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        input_serializer = FormulaEvaluateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        expressions = input_serializer.validated_data["expressions"]
        row = input_serializer.validated_data["row"]
        results = {
            name: evaluate_formula(expression, row)
            for name, expression in expressions.items()
        }
        return Response({"results": results})


class PlatformRecordCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=500)
    project_id = serializers.IntegerField()
    schema_id = serializers.IntegerField()
    field_values = serializers.JSONField()
    metadata = serializers.JSONField(required=False, default=dict)
    request_id = serializers.UUIDField(required=False)


class PlatformRecordEditSerializer(serializers.Serializer):
    state_token = serializers.UUIDField()
    request_id = serializers.UUIDField()
    field_values = serializers.JSONField(required=False)
    metadata = serializers.JSONField(required=False)


class RecordActionExecuteSerializer(serializers.Serializer):
    record_id = serializers.UUIDField()
    action = serializers.CharField(max_length=255)
    contract_id = serializers.CharField(max_length=255)
    contract_version = serializers.CharField(max_length=64)
    state_token = serializers.UUIDField()
    request_id = serializers.UUIDField()
    inputs = serializers.JSONField()


class RecordActionExecuteView(APIView):
    """Invoke a declared provider and route its proposed effects to persistence."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = RecordActionExecuteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        from helix_core.record_persistence import execute_action_invocation

        values = payload.validated_data
        result = execute_action_invocation(
            actor=request.user,
            invocation_id=str(values["request_id"]),
            sequence_fingerprint="legacy-single-action",
            inputs=values["inputs"],
            parameters={},
            targets={"record": str(values["record_id"])},
            expected_state={"record": {
                "stateToken": str(values["state_token"]),
            }},
            providers={"action": values["action"]},
        )
        return Response(result["record"])


class ActionInvocationSerializer(serializers.Serializer):
    invocationId = serializers.CharField(max_length=255, allow_blank=False)
    sequenceFingerprint = serializers.CharField(max_length=255, allow_blank=False)
    inputs = serializers.JSONField()
    parameters = serializers.JSONField()
    targets = serializers.JSONField()
    expectedState = serializers.JSONField()
    providers = serializers.JSONField()


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "The Action invocation exceeds the supported payload limits."
    default_code = "payload_too_large"


def _check_invocation_limits(request, values):
    content_length = request.META.get("CONTENT_LENGTH")
    if content_length and int(content_length) > 10 * 1024 * 1024:
        raise PayloadTooLarge()
    if values is None:
        return
    try:
        encoded = json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        return
    if len(encoded) > 10 * 1024 * 1024:
        raise PayloadTooLarge()
    stack = [(values, 1)]
    while stack:
        value, depth = stack.pop()
        if depth > 64:
            raise PayloadTooLarge("Action invocation nesting exceeds 64 levels.")
        if isinstance(value, dict):
            stack.extend((child, depth + 1) for child in value.values())
        elif isinstance(value, list):
            if len(value) > 1000:
                raise PayloadTooLarge("Action invocation arrays may contain at most 1000 rows.")
            stack.extend((child, depth + 1) for child in value)


class ActionInvocationCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _check_invocation_limits(request, None)
        request_data = request.data
        _check_invocation_limits(request, request_data)
        payload = ActionInvocationSerializer(data=request_data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        from helix_core.record_persistence import execute_action_invocation

        outcome = execute_action_invocation(
            actor=request.user,
            invocation_id=values["invocationId"],
            sequence_fingerprint=values["sequenceFingerprint"],
            inputs=values["inputs"],
            parameters=values["parameters"],
            targets=values["targets"],
            expected_state=values["expectedState"],
            providers=values["providers"],
        )
        return Response({key: value for key, value in outcome.items() if key != "record"})


class ActionInvocationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invocation_id):
        from helix_core.models import ActionInvocationReceipt
        from helix_core.record_persistence import _authorize_invocation_replay

        receipt = ActionInvocationReceipt.objects.filter(
            actor_stable_id=str(request.user.pk), invocation_id=invocation_id
        ).first()
        if receipt is None:
            from rest_framework.exceptions import NotFound
            raise NotFound("Action invocation not found.")
        target_available = _authorize_invocation_replay(request.user, receipt)
        outcome = dict(receipt.outcome)
        from helix_core.record_persistence import mark_unavailable_action_targets
        mark_unavailable_action_targets(outcome, target_available)
        outcome.pop("record", None)
        outcome["replayed"] = True
        return Response(outcome)


class PlatformRecordCollectionView(APIView):
    """Generic list and create boundary for Mod-independent records."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from bundled.access.access.policies import role
        from helix_core.models import PlatformRecord

        rows = PlatformRecord.objects.select_related("schema", "project").order_by("-created_at", "-pk")
        if request.query_params.get("q"):
            rows = rows.filter(name__icontains=request.query_params["q"])
        if request.query_params.get("schema_id"):
            rows = rows.filter(schema_id=request.query_params["schema_id"])
        if request.query_params.get("project_id"):
            rows = rows.filter(project_id=request.query_params["project_id"])
        rows = [row for row in rows if role(request.user, row.project) in {"read", "edit"}]
        from helix_core.record_persistence import _record_response
        page, page_size = _record_page_params(request)
        count = len(rows)
        start = (page - 1) * page_size
        return Response({
            "count": count,
            "next": page + 1 if start + page_size < count else None,
            "previous": page - 1 if page > 1 else None,
            "page": page,
            "page_size": page_size,
            "results": [_record_response(row) for row in rows[start:start + page_size]],
        })

    def post(self, request):
        from bundled.access.access.policies import role
        from helix_core.core.models import Project
        from helix_core.models import Schema
        from helix_core.record_persistence import create_record

        payload = PlatformRecordCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        try:
            project = Project.objects.get(pk=values["project_id"])
            schema = Schema.objects.select_related("schema_type").get(pk=values["schema_id"])
        except (Project.DoesNotExist, Schema.DoesNotExist):
            raise serializers.ValidationError("Project or Schema does not exist.")
        if role(request.user, project) != "edit":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to create records in this Project.")
        response = create_record(
            actor=request.user,
            project=project,
            schema=schema,
            name=values["name"],
            field_values=values["field_values"],
            metadata=values.get("metadata"),
            request_id=values.get("request_id", uuid.uuid4()),
        )
        return Response(response, status=status.HTTP_201_CREATED)


class PlatformRecordDetailView(APIView):
    """Generic read and form execution endpoints for a Platform record."""

    permission_classes = [IsAuthenticated]

    def get_record(self, request, record_id):
        from bundled.access.access.policies import role
        from helix_core.models import PlatformRecord
        from rest_framework.exceptions import NotFound, PermissionDenied

        try:
            record = PlatformRecord.objects.select_related("schema__schema_type", "project").get(pk=record_id)
        except (PlatformRecord.DoesNotExist, ValueError):
            raise NotFound("Record not found.")
        if role(request.user, record.project) not in {"read", "edit"}:
            raise PermissionDenied("You do not have permission to read this record.")
        return record

    def get(self, request, record_id):
        from helix_core.record_persistence import _record_response
        return Response(_record_response(self.get_record(request, record_id)))

    def delete(self, request, record_id):
        from django.db import transaction
        from bundled.access.access.policies import role
        from rest_framework.exceptions import PermissionDenied
        from helix_core.record_persistence import delete_platform_record

        record = self.get_record(request, record_id)
        if role(request.user, record.project) != "edit":
            raise PermissionDenied("You do not have permission to delete this record.")
        from helix_core.source_deletion import delete_source_descendants
        with transaction.atomic():
            delete_source_descendants(record, actor=request.user)
            delete_platform_record(record, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_form(self, request, record_id):
        record = self.get_record(request, record_id)
        from helix_core.record_persistence import _record_response, _schema_fields
        response = _record_response(record)
        response["fields"] = [
            {"id": field_id, **column}
            for field_id, column in _schema_fields(record).items()
        ]
        return Response(response)

    def get_revisions(self, request, record_id):
        record = self.get_record(request, record_id)
        revisions = []
        for group in record.revision_groups.prefetch_related("revisions").all():
            revisions.append({
                "group_id": str(group.pk),
                "group_key": group.group_key,
                "current_revision_id": str(group.current_revision_id),
                "revisions": [
                    {
                        "id": str(revision.pk),
                        "sequence": revision.sequence,
                        "content_hash": revision.content_hash,
                        "snapshot": revision.snapshot,
                        "created_by": revision.created_by_snapshot or None,
                        "created_at": revision.created_at,
                    }
                    for revision in group.revisions.all()
                ],
            })
        return Response({"record_id": str(record.pk), "groups": revisions})

    def post_form(self, request, record_id):
        record = self.get_record(request, record_id)
        from helix_core.record_persistence import edit_record

        payload = PlatformRecordEditSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        response = edit_record(
            actor=request.user,
            record_id=record.pk,
            state_token=values["state_token"],
            request_id=values["request_id"],
            field_values=values.get("field_values"),
            metadata=values.get("metadata"),
        )
        return Response(response)


class PlatformRecordFormView(PlatformRecordDetailView):
    """Read and submit the generic field form for a record."""

    def get(self, request, record_id):
        return self.get_form(request, record_id)

    def post(self, request, record_id):
        return self.post_form(request, record_id)


class PlatformRecordRevisionsView(PlatformRecordDetailView):
    """Read-only history inspection for the record's immutable snapshots."""

    def get(self, request, record_id):
        return self.get_revisions(request, record_id)


def _record_page_params(request):
    from rest_framework.exceptions import ValidationError

    try:
        page = int(request.query_params.get("page", "1"))
        page_size = int(request.query_params.get("page_size", "50"))
    except (TypeError, ValueError):
        raise ValidationError({"pagination": "page and page_size must be integers."})
    if page < 1 or page_size < 1 or page_size > 100:
        raise ValidationError({"pagination": "page must be positive and page_size must be between 1 and 100."})
    return page, page_size


class PlatformRecordGroupHistoryView(PlatformRecordDetailView):
    """Paginated metadata and exact snapshots for one authorized group."""

    def get(self, request, record_id, group_id, revision_id=None):
        from rest_framework.exceptions import NotFound
        from helix_core.models import RecordRevisionGroup

        record = self.get_record(request, record_id)
        try:
            group = RecordRevisionGroup.objects.get(pk=group_id, record=record)
        except (RecordRevisionGroup.DoesNotExist, ValueError):
            raise NotFound("Revision group not found.")
        if revision_id is not None:
            try:
                revision = group.revisions.get(pk=revision_id)
            except (group.revisions.model.DoesNotExist, ValueError):
                raise NotFound("Revision not found in this group.")
            return Response({
                "id": str(revision.pk), "group_id": str(group.pk), "group_key": group.group_key,
                "sequence": revision.sequence, "content_hash": revision.content_hash,
                "snapshot": revision.snapshot, "created_at": revision.created_at,
            })
        page, page_size = _record_page_params(request)
        revisions = group.revisions.order_by("-sequence")
        count = revisions.count()
        start = (page - 1) * page_size
        return Response({
            "record_id": str(record.pk), "group_id": str(group.pk), "group_key": group.group_key,
            "current_revision_id": str(group.current_revision_id) if group.current_revision_id else None,
            "count": count, "next": page + 1 if start + page_size < count else None,
            "previous": page - 1 if page > 1 else None, "page": page, "page_size": page_size,
            "results": [{
                "id": str(item.pk), "sequence": item.sequence, "content_hash": item.content_hash,
                "created_at": item.created_at,
            } for item in revisions[start:start + page_size]],
        })


class PlatformRecordActivityView(PlatformRecordDetailView):
    """Persisted Platform Actions in which the record actually participated."""

    def get(self, request, record_id):
        from helix_core.models import ActionLogEntry, ActionParticipant

        record = self.get_record(request, record_id)
        page, page_size = _record_page_params(request)
        participants = ActionParticipant.objects.filter(record=record)
        actions = ActionLogEntry.objects.filter(participants__in=participants).distinct().order_by("-created_at", "-pk")
        count = actions.count()
        start = (page - 1) * page_size
        results = []
        default_group = record.revision_groups.values_list("pk", flat=True).first()
        for action in actions[start:start + page_size].prefetch_related("participants"):
            subject_roles = list(action.participants.filter(record=record).values_list("role", flat=True))
            metadata = action.metadata if isinstance(action.metadata, dict) else {}
            descriptions = metadata.get("descriptions", [])
            if isinstance(descriptions, str):
                descriptions = [descriptions]
            if not descriptions and isinstance(metadata.get("description"), str):
                descriptions = [metadata["description"]]
            def revision_links(values):
                if isinstance(values, (str, dict)):
                    values = [values]
                if not isinstance(values, list):
                    return []
                links = []
                for value in values:
                    if isinstance(value, str):
                        if default_group:
                            links.append({"group_id": str(default_group), "revision_id": value})
                    elif isinstance(value, dict) and value.get("group_id") and value.get("revision_id"):
                        links.append({"group_id": str(value["group_id"]), "revision_id": str(value["revision_id"])})
                return links
            results.append({
                "id": action.pk, "action": action.action, "action_type": action.action_type,
                "performed_by": action.performed_by_snapshot or None, "created_at": action.created_at,
                "descriptions": descriptions,
                "subject": {"id": str(record.pk), "roles": subject_roles},
                "before": revision_links(metadata.get("before_revisions", [])),
                "after": revision_links(metadata.get("after_revisions", metadata.get("revision_id", []))),
            })
        return Response({
            "record_id": str(record.pk), "count": count,
            "next": page + 1 if start + page_size < count else None,
            "previous": page - 1 if page > 1 else None, "page": page, "page_size": page_size,
            "results": results,
        })


class PlatformRecordExportView(PlatformRecordDetailView):
    """Versioned JSON export of current or exact retained group state."""

    def get(self, request, record_id):
        from rest_framework.exceptions import NotFound
        from helix_core.models import RecordRevisionGroup, RetainedContract
        from helix_core.mod_system.contracts import parse_contract_json, _contract_references

        record = self.get_record(request, record_id)
        group_id = request.query_params.get("group_id")
        revision_id = request.query_params.get("revision_id")
        if revision_id and not group_id:
            raise serializers.ValidationError({"group_id": "An exact revision export requires group_id."})
        if group_id:
            try:
                group = record.revision_groups.get(pk=group_id)
            except (RecordRevisionGroup.DoesNotExist, ValueError):
                raise NotFound("Revision group not found.")
            if revision_id:
                try:
                    revision = group.revisions.get(pk=revision_id)
                except (group.revisions.model.DoesNotExist, ValueError):
                    raise NotFound("Revision not found in this group.")
            else:
                revision = group.current_revision
            if revision is None:
                raise NotFound("Revision group has no current revision.")
            values = revision.snapshot.get("field_values", {})
            state = {"group_id": str(group.pk), "revision_id": str(revision.pk), "snapshot": revision.snapshot}
        else:
            values = record.field_values or {}
            state = {"group_id": None, "revision_id": None, "snapshot": None}

        references = set()
        def collect(value):
            if isinstance(value, dict):
                contract = value.get("contract")
                if isinstance(contract, dict) and {"kind", "id", "version"} <= contract.keys():
                    references.add((contract["kind"], contract["id"], contract["version"]))
                if value.get("type") == "contract" and {"kind", "id", "version"} <= value.keys():
                    references.add((value["kind"], value["id"], value["version"]))
                if value.get("kind") in {"data", "action"} and {"id", "version"} <= value.keys():
                    references.add((value["kind"], value["id"], value["version"]))
                for child in value.values():
                    collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
        collect(values)
        definitions = {}
        pending = list(references)
        while pending:
            kind, contract_id, version = pending.pop()
            identity = (kind, contract_id, version)
            if identity in definitions:
                continue
            retained = RetainedContract.objects.filter(kind=kind, contract_id=contract_id, version=version).first()
            if retained is None:
                continue
            envelope = parse_contract_json(retained.canonical_envelope)
            definitions[identity] = {"fingerprint": retained.fingerprint, "envelope": envelope}
            pending.extend(_contract_references(envelope["definition"]))

        fields = {column.get("id"): column for column in [*(record.schema.schema_type.columns or []), *(record.schema.columns or [])] if isinstance(column, dict)}
        for column in fields.values():
            ref = column.get("contract")
            type_ref = column.get("type")
            if ref is None and isinstance(type_ref, dict) and type_ref.get("type") == "contract":
                ref = type_ref
            if isinstance(ref, dict) and all(key in ref for key in ("kind", "id", "version")):
                pending.append((ref["kind"], ref["id"], ref["version"]))
        while pending:
            kind, contract_id, version = pending.pop()
            identity = (kind, contract_id, version)
            if identity in definitions:
                continue
            retained = RetainedContract.objects.filter(kind=kind, contract_id=contract_id, version=version).first()
            if retained is None:
                continue
            envelope = parse_contract_json(retained.canonical_envelope)
            definitions[identity] = {"fingerprint": retained.fingerprint, "envelope": envelope}
            pending.extend(_contract_references(envelope["definition"]))
        try:
            from helix_core.record_exports import attachment_metadata_for_export
            attachments = attachment_metadata_for_export(record, state["snapshot"])
            attachment_capability = {"available": True}
        except Exception:
            attachments = []
            attachment_capability = {"available": False, "reason": "The optional Platform attachment metadata extension is unavailable."}
        return Response({
            "formatVersion": 1, "record": {
                "id": str(record.pk), "display_id": record.display_id, "name": record.name,
                "metadata": state["snapshot"].get("metadata", {}) if state["snapshot"] else (record.properties or {}),
                "schema_id": state["snapshot"].get("schema_id", record.schema_id) if state["snapshot"] else record.schema_id,
                "field_values": values,
            },
            "state": state,
            "definitions": [{"kind": kind, "id": contract_id, "version": version, **entry}
                            for (kind, contract_id, version), entry in sorted(definitions.items())],
            "attachments": attachments,
            "capabilities": {
                "viewer": {"available": False, "reason": "No optional specialized viewer is installed; generic inspection is available."},
                "attachmentMetadata": attachment_capability,
            },
        })


class ActionCreateView(APIView):
    """Unified endpoint for all action logging.

    ``POST /api/actions/`` accepts:

    * ``action`` — triple-dotted action identifier (e.g.
      ``"eln.entry.created"``).
    * ``action_type`` — core action verb (``"created"``, ``"edited"``,
      or ``"deleted"``; ``"read"`` is rejected — see below).
    * ``target_type`` — namespaced target, e.g. ``"eln.entry"``.
    * ``target_id`` — primary key of the target record.
    * ``workspace_id`` — the owning mod / workspace identifier.
    * ``metadata`` — optional JSON payload.
    * ``timestamp`` — optional ISO 8601 datetime (accepted, currently
      ignored).

    ``action_type: "read"`` is **rejected** with a 400 error.
    Read participates in authorization and the policy catalog but
    never creates an Action Log Entry and never appears in Activity.

    The backend:

    1. Rejects ``action_type: "read"`` immediately.
    2. Resolves ``workspace_id`` to the owning mod.
    3. Validates ``action`` against that mod's registered action
       catalog.
    4. Routes to the correct mod action table.
    5. Creates a single action row with both ``action`` and
       ``action_type`` populated.
    6. Returns ``201 Created`` with the created action row as a JSON
       array.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from helix_core.actions.serializers import ActionCreateSerializer
        from helix_core.actions.registry import get_action_catalog
        from helix_core.models import ActionLogEntry

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

        # ── reject read actions — they are authorization-only ─────────
        if action_type == "read":
            raise serializers.ValidationError(
                "'read' actions are not persisted.  Read participates "
                "in authorization and policy discovery but never creates "
                "an Action Log Entry and never appears in Activity."
            )

        if target_type == "helix.record":
            raise serializers.ValidationError(
                "Platform record mutations must execute through /api/actions/execute/."
            )

        # ── validate action against the workspace's catalog ─────────────
        catalog = get_action_catalog(workspace_id)
        if not catalog:
            raise serializers.ValidationError(
                f"No action model registered for workspace "
                f"'{workspace_id}'. No Platform Action definitions are registered."
            )

        catalog_action_ids = {entry["id"] for entry in catalog}
        if action not in catalog_action_ids:
            available = ", ".join(sorted(catalog_action_ids))
            logger.warning(
                "ActionCreateView: rejecting unknown action '%s' for "
                "workspace '%s'. Known actions: %s",
                action,
                workspace_id,
                available,
            )
            raise serializers.ValidationError(
                f"Unknown action '{action}' for workspace "
                f"'{workspace_id}'. Available action types: {available}"
            )

        # ── enforce Edit on content targets ───────────────────────────────
        # Content targets (Folders, Entries, Entities) may only be logged
        # by a submitter who can Edit them.  A target the submitter cannot
        # Edit — or that does not exist — is rejected so the audit trail
        # cannot be written against arbitrary content.  Non-content targets
        # (organization records, tags, and so on) are not project resources
        # and skip the check.
        from bundled.access.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        target_model = _resolve_content_target_model(target_type)
        if target_model is not None:
            try:
                target = target_model.objects.get(pk=target_id)
            except target_model.DoesNotExist:
                raise PermissionDenied(
                    "You do not have permission to log an action against this target."
                )
            if effective_role(request.user, target) != "edit":
                raise PermissionDenied(
                    "You do not have permission to log an action against this target."
                )

        # ── capture client IP ────────────────────────────────────────────
        client_ip = request.META.get("REMOTE_ADDR", "") or None

        # ── resolve request_id (client-provided or server-generated) ─────
        request_id = validated.get("request_id", uuid.uuid4())

        # ── create the action row ────────────────────────────────────────
        from helix_core.mod_system.registry import registry
        manifest = registry._manifests.get(workspace_id)
        row = ActionLogEntry.objects.create(
            performed_by=request.user,
            action=action,
            action_type=action_type,
            target_model_reference=target_type,
            target_object_id=str(target_id),
            initiating_mod_id=workspace_id,
        initiating_mod_version=(
            manifest.version
            if manifest
            else registry._action_providers.get(workspace_id, (workspace_id, "unknown"))[1]
        ),
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
    performed_by = row.performed_by_snapshot or None
    if not performed_by and row.performed_by is not None:
        performed_by = {
            "id": row.performed_by.pk,
            "username": row.performed_by.username,
            "displayName": row.performed_by.get_full_name().strip() or row.performed_by.username,
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

    # ModLoader hydrates the frontend registry before CurrentUserProvider has
    # established the session. This payload contains Mod metadata only.
    permission_classes = [AllowAny]

    def get(self, request):
        from helix_core.mod_system.registry import registry

        payload = registry.get_registry_payload()
        return Response(payload)


class RetainedContractView(APIView):
    """Read one immutable declarative contract without loading its provider."""

    permission_classes = [AllowAny]

    def get(self, request, kind, contract_id, version):
        from helix_core.mod_system.retention import retained_contract_envelope

        found = retained_contract_envelope(kind, contract_id, version)
        if found is None:
            return Response({"code": "CONTRACT_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        envelope, fingerprint = found
        response = HttpResponse(envelope, content_type="application/json; charset=utf-8")
        response["ETag"] = f'"{fingerprint}"'
        return response

class ModBootView(APIView):
    """Serve the completed backend boot barrier to the frontend.

    This endpoint is intentionally separate from the organization-admin
    lifecycle surface: normal users need the active graph, but must not be
    able to change it.
    """

    # ModLoader runs before CurrentUserProvider has established the session.
    # Boot data contains only public Mod metadata and activation state.
    permission_classes = [AllowAny]

    def get(self, request):
        from django.conf import settings
        from helix_core.models import ModInstallation
        from helix_core.mod_system.registry import registry

        catalog = None
        catalog_path = getattr(settings, "HELIX_MOD_CATALOG", None)
        if catalog_path:
            from helix_core.mod_system.catalog import read_catalog

            catalog = read_catalog(catalog_path)

        active = ModInstallation.objects.filter(
            state=ModInstallation.State.ACTIVE,
        ).values_list("mod_id", flat=True)
        return Response(
            {
                "activeMods": sorted(active),
                "catalog": catalog,
                "registry": registry.get_registry_payload(),
            }
        )


class ModLifecycleView(APIView):
    """Org-admin API for persisted External Mod activation intent."""

    permission_classes = [IsOrganizationAdmin]

    def get(self, request):
        from helix_core.models import ModInstallation

        rows = ModInstallation.objects.filter(tier="External")
        return Response(
            {
                "mods": [
                    {
                        "id": row.mod_id,
                        "displayName": row.display_name,
                        "version": row.version,
                        "requiresHelix": row.requires_helix,
                        "artifacts": row.artifacts,
                        "dependsOn": row.dependencies,
                        "state": row.state,
                        "desiredState": row.desired_state,
                        "restartRequired": row.state != row.desired_state,
                        "available": row.state != ModInstallation.State.REMOVED,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request):
        from helix_core.mod_system.lifecycle import activate_mod, deactivate_mod

        mod_id = request.data.get("modId")
        operation = request.data.get("operation")
        if not isinstance(mod_id, str) or operation not in {"activate", "deactivate"}:
            raise serializers.ValidationError(
                {"detail": "modId and operation (activate or deactivate) are required."}
            )
        try:
            if operation == "activate":
                changed = activate_mod(
                    mod_id,
                    request.user,
                    activate_dependencies=bool(request.data.get("activateDependencies", True)),
                )
            else:
                changed = deactivate_mod(
                    mod_id,
                    request.user,
                    cascade=bool(request.data.get("cascade", False)),
                )
        except ValueError as exc:
            logger.warning(
                "Mod lifecycle operation failed for mod_id=%r operation=%r",
                mod_id,
                operation,
                exc_info=True,
            )
            raise serializers.ValidationError(
                {"detail": "Invalid mod lifecycle request."}
            ) from exc
        return Response({"changed": sorted(changed), "restartRequired": True})


class ColorTokenViewSet(viewsets.ModelViewSet):
    """API endpoint for managing ColorTokens.

    list:     GET    /api/colors/
    create:   POST   /api/colors/
    destroy:  DELETE /api/colors/{id}/  — hard-deletes; reports usage count
    """

    queryset = ColorToken.objects.all()
    serializer_class = ColorTokenSerializer
    pagination_class = None
    permission_classes = [IsOrganizationAdminForWrites]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        """Hard-delete the ColorToken and report how many objects reference it.

        Deleting always succeeds, even when tags (or future objects)
        reference the key.  The response carries a ``usage_count`` so
        the caller can warn the user before confirming the delete.
        """
        from bundled.labelling.tags.models import Tag

        instance = self.get_object()
        key = instance.key
        label = instance.label

        tag_count = Tag.objects.filter(color=key).count()

        instance.delete()

        return Response(
            {
                "detail": f"Deleted colour token '{label}'.",
                "usage_count": tag_count,
            },
            status=status.HTTP_200_OK,
        )


class IconLibraryViewSet(viewsets.ModelViewSet):
    """API endpoint for managing IconLibraryEntry.

    list:     GET    /api/icons/
    create:   POST   /api/icons/
    destroy:  DELETE /api/icons/{id}/  — hard-deletes; reports usage count
    """

    queryset = IconLibraryEntry.objects.all()
    serializer_class = IconLibrarySerializer
    pagination_class = None
    permission_classes = [IsOrganizationAdminForWrites]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        """Hard-delete the icon and report how many objects reference it.

        Deleting always succeeds, even when tags or cards reference
        the key.  The response carries a ``usage_count`` so the caller
        can warn the user before confirming the delete.
        """
        from bundled.labelling.tags.models import Tag
        from bundled.shared.home.models import Card

        instance = self.get_object()
        key = instance.key
        label = instance.label

        tag_count = Tag.objects.filter(icon=key).count()
        card_count = Card.objects.filter(icon=key).count()

        instance.delete()

        return Response(
            {
                "detail": f"Deleted icon '{label}'.",
                "usage_count": tag_count + card_count,
            },
            status=status.HTTP_200_OK,
        )
