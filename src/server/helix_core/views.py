"""API views for Schema and SchemaType.

SchemaViewSet replaces the LIMS-owned EntityTypeViewSet with endpoints
that manage the shared ``Schema`` model.  SchemaTypeViewSet provides a
read-only list for populating the Schema Type selector dropdown.
"""

import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from helix_core.models import Schema, SchemaType
from helix_core.serializers import (
    SchemaListSerializer,
    SchemaWriteSerializer,
    SchemaTypeListSerializer,
)

logger = logging.getLogger(__name__)


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
