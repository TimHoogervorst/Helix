from rest_framework import viewsets
from helix_core.actions.mixins import ActionLoggingMixin
from mods.access.permissions import IsOrganizationAdminForWrites

from .models import Dropdown
from .serializers import DropdownSerializer


class DropdownViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for dropdowns.

    list:    GET  /api/dropdowns/         — list all dropdowns
    create:  POST /api/dropdowns/          — create a dropdown (admin only)
    retrieve: GET  /api/dropdowns/{id}/     — retrieve a single dropdown
    update:  PUT  /api/dropdowns/{id}/     — full update (admin only)
    partial_update: PATCH /api/dropdowns/{id}/ — partial update (admin only)
    destroy: DELETE /api/dropdowns/{id}/   — delete a dropdown (admin only)
    """

    queryset = Dropdown.objects.all()
    serializer_class = DropdownSerializer
    permission_classes = [IsOrganizationAdminForWrites]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "dropdowns.dropdown.created"},
        "update": {"action": "dropdowns.dropdown.edited"},
        "partial_update": {"action": "dropdowns.dropdown.edited"},
        "destroy": {"action": "dropdowns.dropdown.deleted"},
    }
