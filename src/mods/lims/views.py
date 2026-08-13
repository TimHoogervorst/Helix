import logging

from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.response import Response

from helix_core.actions.logger import log_action
from helix_core.actions.mixins import ActionLoggingMixin
from mods.access.permissions import IsOrganizationAdmin

from .models import Entity, Action, LimsView, Metric
from .serializers import (
    EntitySerializer,
    EntityBatchSerializer,
    EntityBatchRegisterSerializer,
    ActionSerializer,
    LimsViewSerializer,
    MetricSerializer,
)
from core.models import Folder

logger = logging.getLogger(__name__)


class ReferentialConflict(APIException):
    status_code = 409
    default_detail = "Entity is referenced by other entities and cannot be deleted."
    default_code = "referential_conflict"


def _get_dropdown_options(dropdown_id: str) -> list[str] | None:
    """Return the list of option values for a dropdown, or *None* if the
    dropdown cannot be found.

    Looks up the Dropdown model from the dropdowns mod by its integer
    primary key.  Returns ``None`` for unknown IDs so that callers fall
    back to basic string validation.
    """
    from mods.dropdowns.models import Dropdown

    try:
        dropdown = Dropdown.objects.get(pk=int(dropdown_id))
        return dropdown.options
    except (Dropdown.DoesNotExist, ValueError, TypeError):
        return None


class EntityViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for LIMS entities.

    list: GET /api/lims/entities/ — paginated, filterable by ?search= and ?type=
    retrieve: GET /api/lims/entities/{display_id}/ — lookup by display_id or pk
    create: POST /api/lims/entities/ — create entity
    update: PUT /api/lims/entities/{display_id}/
    partial_update: PATCH /api/lims/entities/{display_id}/
    destroy: DELETE /api/lims/entities/{display_id}/
    batch: POST /api/lims/entities/batch/ — batch resolve display IDs
    delete_all: DELETE /api/lims/entities/delete_all/ — delete all entities
    """

    queryset = Entity.objects.select_related("schema", "author", "folder")
    serializer_class = EntitySerializer
    lookup_field = "display_id"
    filterset_fields = ["schema"]
    search_fields = ["name", "display_id"]

    def get_permissions(self):
        if self.action == "delete_all":
            return [IsOrganizationAdmin()]
        return super().get_permissions()

    action_log_config = {
        "create": {"action": "lims.entity.created"},
        "update": {"action": "lims.entity.edited"},
        "partial_update": {"action": "lims.entity.edited"},
        "destroy": {"action": "lims.entity.deleted"},
    }

    def perform_destroy(self, instance):
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        if effective_role(self.request.user, instance) != "edit":
            raise PermissionDenied(
                "You do not have permission to delete this entity."
            )
        referencing_schemas = self._find_referencing_schemas(instance.display_id)
        if referencing_schemas:
            raise ReferentialConflict(
                f"Cannot delete '{instance.display_id}' — it is referenced "
                f"by entities in the following schemas: "
                f"{', '.join(referencing_schemas)}. "
                f"Clear or reassign those references before deleting."
            )
        super().perform_destroy(instance)

    def _find_referencing_schemas(self, display_id):
        """Return sorted unique schema names whose reference columns
        point to *display_id*.

        Scans every Schema for reference-type columns (both targeted and
        open references) and checks whether any Entity holds the given
        display_id in that column's property slot.
        """
        from helix_core.models import Schema

        referencing: set[str] = set()

        for schema in Schema.objects.exclude(columns=[]):
            for col_def in schema.columns:
                if col_def.get("type") != "reference":
                    continue
                col_name = col_def.get("name")
                if not col_name:
                    continue

                refs_exist = Entity.objects.filter(
                    **{f"properties__{col_name}": display_id}
                ).exists()

                if refs_exist:
                    referencing.add(schema.name)

        return sorted(referencing)

    def perform_create(self, serializer):
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        folder = serializer.validated_data["folder"]
        if effective_role(self.request.user, folder) != "edit":
            raise PermissionDenied(
                "You do not have permission to create entities in this folder."
            )
        instance = serializer.save(
            author=self.request.user,
            project=folder.project,
        )
        self._maybe_log(
            "create",
            instance=instance,
            validated_data=serializer.validated_data,
        )

    def perform_update(self, serializer):
        from mods.access.policies import destination_within_shared_subtree, effective_role
        from rest_framework.exceptions import PermissionDenied, ValidationError

        instance = serializer.instance
        if effective_role(self.request.user, instance) != "edit":
            raise PermissionDenied(
                "You do not have permission to edit this entity."
            )
        if "folder" in serializer.validated_data:
            new_folder = serializer.validated_data["folder"]
            if new_folder.project_id != instance.project_id:
                raise ValidationError(
                    {"folder": "Entities cannot be moved to a different Project."}
                )
            if not destination_within_shared_subtree(
                instance.folder, new_folder, instance.project_id,
            ):
                raise ValidationError(
                    {"folder": "Entities cannot be moved outside the shared subtree."}
                )
        serializer.save()
        self._maybe_log(
            self.action,
            instance=serializer.instance,
            validated_data=serializer.validated_data,
        )

    def filter_queryset(self, queryset):
        # Support ?type= as an alias for ?schema=
        type_id = self.request.query_params.get("type")
        if type_id:
            queryset = queryset.filter(schema_id=type_id)
        return super().filter_queryset(queryset)

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """Batch-resolve entity display IDs to their details.

        Requires Edit access on every resolved entity — batch resolution
        is a mutation path per the access enforcement series.

        POST /api/lims/entities/batch/
        Body: {"ids": ["BLOOD1", "DNA2"]}
        Returns: {"BLOOD1": {...}, "DNA2": {...}, "NONEXIST1": null}
        """
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        input_serializer = EntityBatchSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        ids = input_serializer.validated_data["ids"]

        entities = Entity.objects.filter(display_id__in=ids).select_related("schema")
        entity_map = {e.display_id: e for e in entities}

        for display_id in ids:
            entity = entity_map.get(display_id)
            if entity is not None and effective_role(request.user, entity) != "edit":
                raise PermissionDenied(
                    "You do not have permission to resolve these entities."
                )

        result = {}
        for display_id in ids:
            entity = entity_map.get(display_id)
            if entity is None:
                result[display_id] = None
            else:
                result[display_id] = {
                    "id": entity.pk,
                    "display_id": entity.display_id,
                    "name": entity.name,
                    "schema_id": entity.schema_id,
                    "schema_name": entity.schema.name,
                    "properties": entity.properties,
                    "folder_id": entity.folder_id,
                    "created_at": entity.created_at.isoformat(),
                }

        return Response(result)

    @action(detail=False, methods=["delete"], url_path="delete_all")
    def delete_all(self, request):
        """Delete ALL entities. Danger zone endpoint for testing."""
        count, _ = Entity.objects.all().delete()
        return Response({"deleted": count})

    @action(detail=False, methods=["post"], url_path="batch-register")
    def batch_register(self, request):
        """Batch-register (create or update) LIMS entities.

        POST /api/lims/entities/batch-register/
        Body: {"schema_id": 1, "rows": [{"entity_id": null, "name": "...", "values": {...}}]}

        - ``entity_id: null`` → create new entity.
        - ``entity_id`` provided → update existing entity.
        - Idempotent: re-registering the same (name, schema) does not duplicate.
        - Partial success: errors in some rows don't block valid rows.
        """
        from helix_core.models import Schema
        from helix_core.column_types import registry as column_type_registry

        input_serializer = EntityBatchRegisterSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        schema_id = input_serializer.validated_data["schema_id"]
        rows = input_serializer.validated_data["rows"]

        # Validate schema exists
        try:
            schema = Schema.objects.get(pk=schema_id)
        except Schema.DoesNotExist:
            return Response(
                {"detail": f"Schema with id {schema_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        author = request.user if request.user.is_authenticated else None
        if author is None:
            from rest_framework.exceptions import NotAuthenticated
            raise NotAuthenticated(
                "Authentication is required to batch-register entities."
            )

        # ── Access enforcement ────────────────────────────────────────────
        # Batch registration mutates content, so it enforces the same Edit
        # rule as single mutations.  A row that targets content the
        # submitter cannot Edit rejects the whole request with 403.  Rows
        # whose target does not exist (unknown entity or folder) are data
        # errors handled per-row below, not access denials.
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        def _row_target_is_editable(row):
            """Return True/False for a real target, None for a missing one."""
            entity_id = row.get("entity_id")
            if entity_id is not None:
                try:
                    target = Entity.objects.get(pk=entity_id)
                except Entity.DoesNotExist:
                    return None
                return effective_role(request.user, target) == "edit"
            folder_id = row.get("folder_id")
            if folder_id is None:
                return None
            try:
                target = Folder.objects.get(pk=folder_id)
            except Folder.DoesNotExist:
                return None
            return effective_role(request.user, target) == "edit"

        for row in rows:
            if _row_target_is_editable(row) is False:
                raise PermissionDenied(
                    "You do not have permission to batch-register entities."
                )

        # Build a lookup from column name → column definition.
        # SchemaType columns provide system-level defaults; Schema columns
        # override them for the same name.
        _column_defs: dict[str, dict] = {}
        for col in schema.schema_type.columns:
            col_name = col.get("name")
            if col_name:
                _column_defs[col_name] = col
        for col in schema.columns:
            col_name = col.get("name")
            if col_name:
                _column_defs[col_name] = col

        results = []
        errors = []

        for row_index, row in enumerate(rows):
            entity_id = row.get("entity_id")
            name = (row.get("name") or "").strip()
            values = row.get("values", {})
            folder_id = row.get("folder_id")

            if not name:
                errors.append({
                    "row_index": row_index,
                    "field": "name",
                    "message": "Name is required.",
                })
                continue

            if folder_id is None and entity_id is None:
                errors.append({
                    "row_index": row_index,
                    "field": "folder_id",
                    "message": "folder_id is required for new entities.",
                })
                continue

            folder = None
            if folder_id is not None:
                try:
                    folder = Folder.objects.get(pk=folder_id)
                except Folder.DoesNotExist:
                    errors.append({
                        "row_index": row_index,
                        "field": "folder_id",
                        "message": f"Folder with id {folder_id} not found.",
                    })
                    continue

            # ── Column-type validation for each property value ──────────
            row_has_errors = False
            for key, value in values.items():
                col_def = _column_defs.get(key)
                if col_def is None:
                    # Unknown column — no type to validate against.
                    continue

                type_id = (col_def.get("type") or "").lower()
                if not type_id:
                    continue

                ct = column_type_registry.get_column_type(type_id)
                if ct is None:
                    # Unknown column type — skip validation.
                    continue

                # Gather context for validation.
                context: dict = {}
                if type_id == "dropdown":
                    # Look up dropdown options if a dropdownId is present.
                    dropdown_id = col_def.get("dropdownId")
                    if dropdown_id:
                        dropdown_options = _get_dropdown_options(dropdown_id)
                        if dropdown_options is not None:
                            context["dropdown_options"] = dropdown_options

                result = ct.validate(value, **context)
                if result is not True:
                    errors.append({
                        "row_index": row_index,
                        "field": key,
                        "message": result,
                    })
                    row_has_errors = True

            if row_has_errors:
                continue

            if entity_id is not None:
                try:
                    entity = Entity.objects.get(pk=entity_id)
                    if folder is not None and folder.project_id != entity.project_id:
                        errors.append({
                            "row_index": row_index,
                            "field": "folder_id",
                            "message": "Entities cannot be moved to a different Project.",
                        })
                        continue
                    if folder is not None:
                        entity.folder = folder
                        update_fields = ["name", "properties", "folder"]
                    else:
                        update_fields = ["name", "properties"]
                    entity.name = name
                    entity.properties = values
                    entity.save(update_fields=update_fields)
                    results.append({
                        "row_index": row_index,
                        "entity_id": entity.id,
                        "display_id": entity.display_id,
                        "status": "updated",
                    })
                except Entity.DoesNotExist:
                    errors.append({
                        "row_index": row_index,
                        "field": "entity_id",
                        "message": f"Entity with id {entity_id} not found.",
                    })
            else:
                existing = Entity.objects.filter(
                    name=name, schema=schema
                ).first()
                if existing:
                    existing.properties = values
                    if folder is not None:
                        existing.folder = folder
                        existing.project = folder.project
                        existing.save(update_fields=["properties", "folder", "project"])
                    else:
                        existing.save(update_fields=["properties"])
                    results.append({
                        "row_index": row_index,
                        "entity_id": existing.id,
                        "display_id": existing.display_id,
                        "status": "updated",
                    })
                else:
                    entity = Entity.objects.create(
                        name=name,
                        schema=schema,
                        properties=values,
                        folder=folder,
                        project=folder.project,
                        author=author,
                    )
                    results.append({
                        "row_index": row_index,
                        "entity_id": entity.id,
                        "display_id": entity.display_id,
                        "status": "created",
                    })

        # Action logging — log eln.entities.registered
        if author and results:
            try:
                with transaction.atomic():
                    log_action(
                        user=author,
                        action="eln.entities.registered",
                        target_type="lims.entities",
                        target_id=schema_id,
                        metadata={
                            "schema_id": schema_id,
                            "count": len(results),
                            "entity_ids": [r["entity_id"] for r in results],
                        },
                        request_id=getattr(self, "_request_id", None),
                        client_ip=request.META.get("REMOTE_ADDR", "") or None,
                    )
            except Exception:
                logger.exception(
                    "Action logging failed for EntityViewSet.batch_register"
                )

        return Response({"results": results, "errors": errors})


class ActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS actions (read-only for Phase 1).
    """

    queryset = Action.objects.select_related("entity", "performed_by")
    serializer_class = ActionSerializer
    filterset_fields = ["entity", "action_type"]


class LimsViewViewSet(viewsets.ModelViewSet):
    """API endpoint for saved Entity Hub Views.

    list: GET /api/lims/views/ — list own views (default) or public (?public=true)
    create: POST /api/lims/views/
    retrieve: GET /api/lims/views/{id}/
    update: PUT /api/lims/views/{id}/
    partial_update: PATCH /api/lims/views/{id}/
    destroy: DELETE /api/lims/views/{id}/
    """

    serializer_class = LimsViewSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        public_only = self.request.query_params.get("public") == "true"

        detail_actions = ("retrieve", "update", "partial_update", "destroy")
        if self.action in detail_actions and user.is_authenticated:
            from django.db.models import Q

            return LimsView.objects.filter(
                Q(owner=user) | Q(is_public=True)
            ).select_related("owner")

        if public_only:
            qs = LimsView.objects.filter(is_public=True).select_related("owner")
            if user.is_authenticated:
                qs = qs.exclude(owner=user)
            return qs

        if user.is_authenticated:
            return LimsView.objects.filter(owner=user).select_related("owner")
        return LimsView.objects.none()

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated("Authentication is required to save views.")
        serializer.save(owner=self.request.user)

    def check_object_permissions(self, request, obj):
        """Only the owner can update, delete, or toggle is_public."""
        if request.method in ("PUT", "PATCH", "DELETE"):
            if not request.user.is_authenticated or obj.owner != request.user:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(
                    "You do not have permission to modify this view."
                )
        return super().check_object_permissions(request, obj)


class MetricViewSet(viewsets.ModelViewSet):
    """API endpoint for live aggregate Metrics.

    list:    GET    /api/lims/metrics/
    create:  POST   /api/lims/metrics/
    retrieve: GET   /api/lims/metrics/{id}/
    update:  PUT    /api/lims/metrics/{id}/
    partial_update: PATCH /api/lims/metrics/{id}/
    destroy: DELETE /api/lims/metrics/{id}/
    value:   GET    /api/lims/metrics/{id}/value/
    """

    serializer_class = MetricSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated:
            from django.db.models import Q

            return (
                Metric.objects.filter(
                    Q(owner=user) | Q(view__is_public=True)
                )
                .select_related("owner", "view")
                .distinct()
            )
        return Metric.objects.filter(
            view__is_public=True
        ).select_related("owner", "view")

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated("Authentication is required to create metrics.")
        serializer.save(owner=self.request.user)

    def check_object_permissions(self, request, obj):
        if request.method in ("PUT", "PATCH", "DELETE"):
            if not request.user.is_authenticated or obj.owner != request.user:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(
                    "You do not have permission to modify this metric."
                )
        return super().check_object_permissions(request, obj)

    @action(detail=True, methods=["get"])
    def value(self, request, pk=None):
        """Live scalar aggregate evaluation.

        GET /api/lims/metrics/{id}/value/?me=<identity>

        Re-runs the View's filter_state against the Entity Hub View and
        returns the computed aggregate as ``{"value": <scalar>}``.

        Query Parameters:
            me (str): Optional user identity for ``is_me`` filter rewriting.
        """
        metric = self.get_object()
        identity = request.query_params.get("me") or None

        from helix_core.query_builder import build_metric_aggregation

        try:
            result = build_metric_aggregation(
                metric.view,
                metric.aggregate_function,
                metric.column or None,
                identity=identity,
            )
            return Response(result)
        except Exception:
            logger.exception("Metric value evaluation failed for metric %d", metric.pk)
            return Response(
                {"detail": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
