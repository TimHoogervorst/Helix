import logging

from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.actions.logger import log_action
from helix_core.actions.mixins import ActionLoggingMixin

from .models import EntityType, Entity, Action
from .serializers import (
    EntityTypeSerializer,
    EntityTypeDetailSerializer,
    EntitySerializer,
    EntityBatchSerializer,
    EntityBatchRegisterSerializer,
    ActionSerializer,
)

logger = logging.getLogger(__name__)


class EntityTypeViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for LIMS entity types (schemas).

    list: GET /api/lims/entity-types/
    create: POST /api/lims/entity-types/
    retrieve: GET /api/lims/entity-types/{id}/
    update: PUT /api/lims/entity-types/{id}/
    partial_update: PATCH /api/lims/entity-types/{id}/
    destroy: DELETE /api/lims/entity-types/{id}/ — soft-deletes (sets is_active=False)
    delete_all: DELETE /api/lims/entity-types/delete_all/ — hard-deletes all schemas
    """

    queryset = EntityType.objects.all()
    permission_classes = []
    pagination_class = None

    action_log_config = {
        "create": {"action_type": "lims.entity_type.created"},
        "update": {"action_type": "lims.entity_type.edited"},
        "partial_update": {"action_type": "lims.entity_type.edited"},
        "destroy": {"action_type": "lims.entity_type.deleted"},
    }

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return EntityTypeDetailSerializer
        return EntityTypeSerializer

    def perform_destroy(self, instance):
        """Soft-delete: set is_active=False instead of removing the row."""
        instance._pre_delete_pk = instance.pk
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        self._maybe_log("destroy", instance=instance)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["delete"], url_path="delete_all")
    def delete_all(self, request):
        """Hard-delete ALL entity types (schemas). Danger zone endpoint for testing."""
        # Delete entities first to avoid FK constraint issues
        Entity.objects.all().delete()
        count, _ = EntityType.objects.all().delete()
        return Response({"deleted": count})


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
    permission_classes = []
    lookup_field = "display_id"
    filterset_fields = ["schema"]
    search_fields = ["name", "display_id"]

    action_log_config = {
        "create": {"action_type": "lims.entity.created"},
        "update": {"action_type": "lims.entity.edited"},
        "partial_update": {"action_type": "lims.entity.edited"},
        "destroy": {"action_type": "lims.entity.deleted"},
    }

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated
            raise NotAuthenticated("Authentication is required to create entities.")
        # Schema is always resolved by EntitySerializer.validate() — if the
        # client omitted it, the default Schema for the LIMS SchemaType is
        # assigned automatically.
        instance = serializer.save(author=self.request.user)
        self._maybe_log(
            "create",
            instance=instance,
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

        POST /api/lims/entities/batch/
        Body: {"ids": ["BLOOD1", "DNA2"]}
        Returns: {"BLOOD1": {...}, "DNA2": {...}, "NONEXIST1": null}
        """
        input_serializer = EntityBatchSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        ids = input_serializer.validated_data["ids"]

        result = {}
        entities = Entity.objects.filter(display_id__in=ids).select_related("schema")
        entity_map = {e.display_id: e for e in entities}

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

        results = []
        errors = []

        for row_index, row in enumerate(rows):
            entity_id = row.get("entity_id")
            name = (row.get("name") or "").strip()
            values = row.get("values", {})

            # Validate name
            if not name:
                errors.append({
                    "row_index": row_index,
                    "field": "name",
                    "message": "Name is required.",
                })
                continue

            if entity_id is not None:
                # Update existing entity
                try:
                    entity = Entity.objects.get(pk=entity_id)
                    entity.name = name
                    entity.properties = values
                    entity.save(update_fields=["name", "properties"])
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
                # Idempotent create: check for existing entity with same name + schema
                existing = Entity.objects.filter(
                    name=name, schema=schema
                ).first()
                if existing:
                    # Idempotency — update instead of duplicate
                    existing.properties = values
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
                        action_type="eln.entities.registered",
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
    permission_classes = []
    filterset_fields = ["entity", "action_type"]
