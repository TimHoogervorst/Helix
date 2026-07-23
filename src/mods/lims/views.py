import logging

from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.actions.logger import log_action
from helix_core.actions.mixins import ActionLoggingMixin

from .models import Entity, Action, LimsView
from .serializers import (
    EntitySerializer,
    EntityBatchSerializer,
    EntityBatchRegisterSerializer,
    ActionSerializer,
    LimsViewSerializer,
)

logger = logging.getLogger(__name__)


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
    permission_classes = []
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        public_only = self.request.query_params.get("public") == "true"

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
