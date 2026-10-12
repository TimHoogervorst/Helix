"""Reusable permission classes for organization-level administration."""

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from .models import Organization
from .policies import can


class IsOrganizationAdmin(IsAuthenticated):
    """Allow only authenticated Organization Admins and Superusers."""

    message = "Only Organization Admins can perform this action."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and can(
            request.user,
            "edited",
            resource=Organization(),
        )


class IsOrganizationAdminForWrites(IsAuthenticated):
    """Allow authenticated reads; restrict all mutations to Organization Admins."""

    message = "Only Organization Admins can modify this resource."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        return can(request.user, "edited", resource=Organization())
