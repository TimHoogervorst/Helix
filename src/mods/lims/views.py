import logging

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.response import Response

from helix_core.actions.logger import log_action
from helix_core.actions.mixins import ActionLoggingMixin, logs_action
from mods.access.permissions import IsOrganizationAdmin
from mods.access.scoping import visible_rows_q

from .models import Entity, Action, LimsView, Metric
from mods.tags.models import Tag
from .serializers import (
    EntitySerializer,
    validate_reference_properties,
    EntityBatchSerializer,
    EntityBatchRegisterSerializer,
    ActionSerializer,
    LimsViewSerializer,
    MetricSerializer,
)
from core.models import Folder, Project

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

    queryset = (
        Entity.objects.select_related(
            "schema", "schema__schema_type", "author", "last_editor", "folder", "project",
        )
        .prefetch_related("tags")
    )
    serializer_class = EntitySerializer
    lookup_field = "display_id"
    filterset_fields = ["schema"]
    search_fields = ["name", "display_id"]

    def get_permissions(self):
        if self.action in ("delete_all", "recompute"):
            return [IsOrganizationAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in ("list", "retrieve", "results"):
            queryset = queryset.filter(visible_rows_q(self.request.user))
        return queryset

    action_log_config = {
        "create": {"action": "lims.entity.created"},
        "update": {"action": "lims.entity.edited"},
        "partial_update": {"action": "lims.entity.edited"},
        "destroy": {"action": "lims.entity.deleted"},
    }

    def perform_destroy(self, instance):
        from mods.access.policies import effective_role, role
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
        from mods.access.policies import effective_role, role
        from rest_framework.exceptions import PermissionDenied

        folder = serializer.validated_data.get("folder")
        project = serializer.validated_data.get("project") or folder.project
        permission = effective_role(self.request.user, folder) if folder else role(
            self.request.user, project,
        )
        if permission != "edit":
            raise PermissionDenied(
                "You do not have permission to create entities in this Project."
            )
        instance = serializer.save(
            author=self.request.user,
            project=project,
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

    @logs_action(
        "lims.entity.tags_attached",
        get_metadata=lambda inst, data, req: {"tag_ids": req.data.get("tag_ids", [])},
    )
    @action(detail=True, methods=["post"], url_path="tags")
    def attach_tags(self, request, display_id=None):
        entity = self.get_object()
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        if effective_role(request.user, entity) != "edit":
            raise PermissionDenied("You do not have permission to edit this entity.")
        tag_ids = request.data.get("tag_ids", [])
        if not isinstance(tag_ids, list):
            return Response(
                {"error": "tag_ids must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entity.tags.add(*Tag.objects.filter(id__in=tag_ids))
        return Response(self.get_serializer(entity).data)

    @logs_action(
        "lims.entity.tag_detached",
        get_metadata=lambda inst, data, req: {
            "tag_id": int(req.resolver_match.kwargs["tag_id"])
        },
    )
    @action(detail=True, methods=["delete"], url_path="tags/(?P<tag_id>[^/.]+)")
    def detach_tag(self, request, display_id=None, tag_id=None):
        entity = self.get_object()
        from mods.access.policies import effective_role
        from rest_framework.exceptions import PermissionDenied

        if effective_role(request.user, entity) != "edit":
            raise PermissionDenied("You do not have permission to edit this entity.")
        try:
            tag = Tag.objects.get(id=tag_id)
        except Tag.DoesNotExist:
            return Response({"error": "Tag not found"}, status=status.HTTP_404_NOT_FOUND)
        entity.tags.remove(tag)
        return Response(self.get_serializer(entity).data)

    @action(detail=True, methods=["get"], url_path="results")
    def results(self, request, display_id=None):
        """Return readable ResultTable rows linked to this entity."""
        entity = self.get_object()
        result_entities = (
            Entity.objects.filter(
                schema__schema_type__tags__contains=["ResultTable"],
                properties__Entity=entity.display_id,
            )
            .filter(visible_rows_q(request.user))
            .select_related("schema", "schema__schema_type", "author")
            .order_by("schema_id", "created_at")
        )

        groups = {}
        for result in result_entities:
            schema = result.schema
            group = groups.setdefault(
                schema.pk,
                {
                    "schema": {
                        "id": schema.pk,
                        "name": schema.name,
                        "icon": schema.icon,
                        "color": schema.color,
                        "columns": (schema.schema_type.columns or []) + (schema.columns or []),
                    },
                    "results": [],
                },
            )
            group["results"].append({
                "display_id": result.display_id,
                "name": result.name,
                "created_at": result.created_at,
                "author_username": result.author.username,
                "properties": result.properties,
            })

        return Response(list(groups.values()))

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
        from helix_core.formulas import evaluate_row

        input_serializer = EntityBatchRegisterSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        schema_id = input_serializer.validated_data["schema_id"]
        project_id = input_serializer.validated_data.get("project_id")
        rows = input_serializer.validated_data["rows"]

        # Validate schema exists
        try:
            schema = Schema.objects.get(pk=schema_id)
        except Schema.DoesNotExist:
            return Response(
                {"detail": f"Schema with id {schema_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        project = None
        if project_id is not None:
            try:
                project = Project.objects.get(pk=project_id)
            except Project.DoesNotExist:
                return Response(
                    {"detail": f"Project with id {project_id} not found."},
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

        formula_defs = {
            name: definition
            for name, definition in _column_defs.items()
            if definition.get("type") == "formula"
        }
        is_result_schema = "ResultTable" in (schema.schema_type.tags or [])

        results = []
        errors = []

        for row_index, row in enumerate(rows):
            entity_id = row.get("entity_id")
            result_row_id = row.get("result_row_id")
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

            if (
                project is not None
                and folder is not None
                and folder.project_id != project.id
            ):
                errors.append({
                    "row_index": row_index,
                    "field": "project_id",
                    "message": "The folder must belong to the project.",
                })
                continue

            # Computed fields are never accepted from the client.  Their
            # dependencies use the ordinary input values as the row base.
            input_values = {
                key: value for key, value in values.items() if key not in formula_defs
            }
            formula_values = {}
            if formula_defs:
                try:
                    formula_results = evaluate_row(
                        input_values,
                        {
                            name: {"expression": definition["expression"]}
                            for name, definition in formula_defs.items()
                        },
                    )
                except Exception as exc:
                    errors.append({
                        "row_index": row_index,
                        "field": next(iter(formula_defs)),
                        "message": f"Formula evaluation failed: {exc}",
                    })
                    continue
                formula_error = next(
                    (
                        (name, result)
                        for name, result in formula_results.items()
                        if name in formula_defs and not result["ok"]
                    ),
                    None,
                )
                if formula_error is not None:
                    field, result = formula_error
                    errors.append({
                        "row_index": row_index,
                        "field": field,
                        "message": f"{result['error']['code']}: {result['error']['message']}",
                    })
                    continue
                formula_values = {
                    name: formula_results[name]["value"] for name in formula_defs
                }
                formula_type_error = False
                for name, value in formula_values.items():
                    result_type = formula_defs[name].get("resultType")
                    result_column_type = column_type_registry.get_column_type(result_type)
                    validation = (
                        result_column_type.validate(value)
                        if result_column_type is not None
                        else "Unknown formula result type"
                    )
                    if validation is not True:
                        errors.append({
                            "row_index": row_index,
                            "field": name,
                            "message": str(validation),
                        })
                        formula_type_error = True
                        break
                if formula_type_error:
                    continue
            persisted_values = {**input_values, **formula_values}
            if is_result_schema and result_row_id:
                persisted_values["_result_row_id"] = result_row_id
            if formula_defs:
                persisted_values["_computed_field_versions"] = {
                    field: definition.get("expression_version", 1)
                    for field, definition in formula_defs.items()
                }
                persisted_values["_computed_field_schema_hash"] = schema.content_hash

            # ── Column-type validation for each property value ──────────
            row_has_errors = False
            for key, value in input_values.items():
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

            try:
                validate_reference_properties(input_values, schema)
            except serializers.ValidationError as exc:
                for field, messages in exc.detail.items():
                    message = messages[0] if isinstance(messages, list) else messages
                    errors.append({
                        "row_index": row_index,
                        "field": field,
                        "message": str(message),
                    })
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
                    if project is not None and entity.project_id != project.id:
                        errors.append({
                            "row_index": row_index,
                            "field": "project_id",
                            "message": "The entity must belong to the project.",
                        })
                        continue
                    if folder is not None:
                        entity.folder = folder
                        update_fields = ["name", "properties", "folder"]
                    else:
                        update_fields = ["name", "properties"]
                    entity.name = name
                    entity.properties = persisted_values
                    entity.save(update_fields=update_fields)
                    results.append({
                        "row_index": row_index,
                        "entity_id": entity.id,
                        "display_id": entity.display_id,
                        "result_row_id": result_row_id,
                        "status": "updated",
                        "values": formula_values,
                        "schema_content_hash": schema.content_hash,
                    })
                except Entity.DoesNotExist:
                    errors.append({
                        "row_index": row_index,
                        "field": "entity_id",
                        "message": f"Entity with id {entity_id} not found.",
                    })
            else:
                existing = None
                if is_result_schema and result_row_id:
                    existing = Entity.objects.filter(
                        schema=schema,
                        properties___result_row_id=result_row_id,
                    ).first()
                if existing is None and not (is_result_schema and result_row_id):
                    existing = Entity.objects.filter(
                        name=name, schema=schema
                    ).first()
                if existing:
                    existing.properties = persisted_values
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
                        "result_row_id": result_row_id,
                        "status": "updated",
                        "values": formula_values,
                        "schema_content_hash": schema.content_hash,
                    })
                else:
                    entity = Entity.objects.create(
                        name=name,
                        schema=schema,
                        properties=persisted_values,
                        folder=folder,
                        project=folder.project,
                        author=author,
                    )
                    results.append({
                        "row_index": row_index,
                        "entity_id": entity.id,
                        "display_id": entity.display_id,
                        "result_row_id": result_row_id,
                        "status": "created",
                        "values": formula_values,
                        "schema_content_hash": schema.content_hash,
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

    @action(detail=False, methods=["post"])
    def recompute(self, request):
        """Explicitly recompute all registered entities for a schema.

        This is intentionally separate from table registration: expression
        edits never rewrite stored values until an administrator requests it.
        """
        from helix_core.column_types import registry as column_type_registry
        from helix_core.formulas import evaluate_row
        from helix_core.models import Schema

        schema_id = request.data.get("schema_id")
        try:
            schema = Schema.objects.get(pk=schema_id)
        except (Schema.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": f"Schema with id {schema_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        column_defs: dict[str, dict] = {}
        for column in schema.schema_type.columns + schema.columns:
            name = column.get("name")
            if name:
                column_defs[name] = column
        formula_defs = {
            name: definition
            for name, definition in column_defs.items()
            if definition.get("type") == "formula"
        }
        results = []
        errors = []

        for row_index, entity in enumerate(
            Entity.objects.filter(schema=schema).order_by("pk")
        ):
            input_values = {
                key: value
                for key, value in entity.properties.items()
                if key not in formula_defs
                and key not in {
                    "_computed_field_versions",
                    "_computed_field_schema_hash",
                }
            }
            try:
                formula_results = evaluate_row(
                    input_values,
                    {
                        name: {"expression": definition["expression"]}
                        for name, definition in formula_defs.items()
                    },
                )
            except Exception:
                logger.exception(
                    "Formula evaluation failed during recompute (row_index=%s, entity_id=%s).",
                    row_index,
                    entity.id,
                )
                errors.append({
                    "row_index": row_index,
                    "entity_id": entity.id,
                    "message": "Formula evaluation failed due to an internal error.",
                })
                continue

            formula_error = next(
                (
                    (name, result)
                    for name, result in formula_results.items()
                    if name in formula_defs and not result["ok"]
                ),
                None,
            )
            if formula_error is not None:
                field, result = formula_error
                errors.append({
                    "row_index": row_index,
                    "entity_id": entity.id,
                    "field": field,
                    "message": f"{result['error']['code']}: {result['error']['message']}",
                })
                continue

            formula_values = {
                name: formula_results[name]["value"] for name in formula_defs
            }
            type_error = next(
                (
                    (name, value)
                    for name, value in formula_values.items()
                    if (
                        (column_type := column_type_registry.get_column_type(
                            formula_defs[name].get("resultType")
                        )) is None
                        or column_type.validate(value) is not True
                    )
                ),
                None,
            )
            if type_error is not None:
                field, _ = type_error
                errors.append({
                    "row_index": row_index,
                    "entity_id": entity.id,
                    "field": field,
                    "message": "Computed value does not match its result type.",
                })
                continue

            entity.properties = {
                **input_values,
                **formula_values,
                "_computed_field_versions": {
                    field: definition.get("expression_version", 1)
                    for field, definition in formula_defs.items()
                },
                "_computed_field_schema_hash": schema.content_hash,
            }
            entity.save(update_fields=["properties"])
            results.append({
                "entity_id": entity.id,
                "display_id": entity.display_id,
                "values": formula_values,
                "schema_content_hash": schema.content_hash,
            })

        return Response({"results": results, "errors": errors})


class ActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS actions (read-only for Phase 1).
    """

    serializer_class = ActionSerializer
    filterset_fields = ["entity", "action_type", "target_type", "target_id"]

    def get_queryset(self):
        visible_entities = Entity.objects.filter(
            visible_rows_q(self.request.user)
        ).values("pk")
        from mods.eln.models import NotebookEntry

        visible_entries = NotebookEntry.objects.filter(
            visible_rows_q(self.request.user)
        ).values("pk")

        visible_related_targets = (
            Q(entity_id__in=visible_entities)
            & (Q(source_entry__isnull=True) | Q(source_entry_id__in=visible_entries))
        ) | (
            Q(entity__isnull=True)
            & Q(source_entry_id__in=visible_entries)
        )
        visible_generic_targets = (
            Q(entity__isnull=True, source_entry__isnull=True)
            & (
                Q(
                    target_type__in=("lims.entity", "lims.entities"),
                    target_id__in=visible_entities,
                )
                | Q(target_type="eln.entry", target_id__in=visible_entries)
            )
        )
        return Action.objects.filter(
            visible_related_targets | visible_generic_targets
        ).select_related("entity", "performed_by", "source_entry")


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
        if user.is_authenticated and user.is_active:
            from django.db.models import Q

            return (
                Metric.objects.filter(
                    Q(owner=user) | Q(view__is_public=True)
                )
                .select_related("owner", "view")
                .distinct()
            )
        if not user.is_authenticated or not user.is_active:
            return Metric.objects.none()
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
                user=request.user,
            )
            return Response(result)
        except Exception:
            logger.exception("Metric value evaluation failed for metric %d", metric.pk)
            return Response(
                {"detail": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
