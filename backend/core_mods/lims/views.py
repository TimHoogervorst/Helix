from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.actions.mixins import ActionLoggingMixin

from .models import EntityType, Entity, Action
from .serializers import (
    EntityTypeSerializer,
    EntityTypeDetailSerializer,
    EntitySerializer,
    EntityBatchSerializer,
    ActionSerializer,
)


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

    queryset = Entity.objects.select_related("entity_type", "created_by", "folder")
    serializer_class = EntitySerializer
    permission_classes = []
    lookup_field = "display_id"
    filterset_fields = ["entity_type"]
    search_fields = ["name", "display_id"]

    action_log_config = {
        "create": {"action_type": "lims.entity.created"},
        "update": {"action_type": "lims.entity.edited"},
        "partial_update": {"action_type": "lims.entity.edited"},
        "destroy": {"action_type": "lims.entity.deleted"},
    }

    def perform_create(self, serializer):
        author = self.request.user if self.request.user.is_authenticated else None
        instance = serializer.save(created_by=author)
        self._maybe_log(
            "create",
            instance=instance,
            validated_data=serializer.validated_data,
        )

    def filter_queryset(self, queryset):
        # Support ?type= as an alias for ?entity_type=
        type_id = self.request.query_params.get("type")
        if type_id:
            queryset = queryset.filter(entity_type_id=type_id)
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
        entities = Entity.objects.filter(display_id__in=ids).select_related("entity_type")
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
                    "entity_type_id": entity.entity_type_id,
                    "entity_type_name": entity.entity_type.name,
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


class ActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS actions (read-only for Phase 1).
    """

    queryset = Action.objects.select_related("entity", "performed_by")
    serializer_class = ActionSerializer
    permission_classes = []
    filterset_fields = ["entity", "action_type"]
