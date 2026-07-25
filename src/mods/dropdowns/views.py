from rest_framework import viewsets
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from helix_core.actions.mixins import ActionLoggingMixin

from .models import Dropdown
from .serializers import DropdownSerializer


class IsAdminOrReadOnly(IsAuthenticated):
    """Allow read access to any authenticated user, write access to staff only."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_staff


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
    permission_classes = [IsAdminOrReadOnly]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "dropdowns.dropdown.created"},
        "update": {"action": "dropdowns.dropdown.edited"},
        "partial_update": {"action": "dropdowns.dropdown.edited"},
        "destroy": {"action": "dropdowns.dropdown.deleted"},
    }
