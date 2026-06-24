from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import EntityType, Entity, Action
from .serializers import EntityTypeSerializer, EntitySerializer, ActionSerializer


class EntityTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS entity types (read-only for Phase 1).

    list: GET /api/lims/entity-types/ — list all entity types
    retrieve: GET /api/lims/entity-types/{id}/ — get single entity type
    """

    queryset = EntityType.objects.all()
    serializer_class = EntityTypeSerializer
    permission_classes = []
    pagination_class = None


class EntityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS entities (read-only for Phase 1).

    list: GET /api/lims/entities/ — list all entities (paginated, filterable by entity_type)
    retrieve: GET /api/lims/entities/{id}/ — get single entity with properties
    """

    queryset = Entity.objects.select_related("entity_type", "created_by", "folder")
    serializer_class = EntitySerializer
    permission_classes = []
    filterset_fields = ["entity_type"]


class ActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for LIMS actions (read-only for Phase 1).
    """

    queryset = Action.objects.select_related("entity", "performed_by")
    serializer_class = ActionSerializer
    permission_classes = []
    filterset_fields = ["entity", "action_type"]
