"""Tests for admin-only enforcement on UserViewSet."""

from rest_framework.test import APIClient

from core.models import User
from core.tests.base import BaseTestCase
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)


class UserManagementAuthTests(BaseTestCase):
    """Verify UserViewSet is restricted to Organization Admins."""

    def setUp(self):
        super().setUp()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(
            username="orgadmin", password="pass",
        )
        self.regular = User.objects.create_user(
            username="regular", password="pass",
        )
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        OrganizationMembership.objects.create(
            user=self.regular, organization=self.org, role=OrganizationRole.USER,
        )

    def test_list_users_as_admin_succeeds(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/core/users/")
        self.assertEqual(response.status_code, 200)

    def test_list_users_as_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.get("/api/core/users/")
        self.assertEqual(response.status_code, 403)

    def test_create_user_as_admin_succeeds(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/core/users/",
            {"username": "newuser", "password": "Str0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_create_user_as_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.post(
            "/api/core/users/",
            {"username": "newuser", "password": "Str0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_deactivate_user_as_admin_succeeds(self):
        target = User.objects.create_user(username="target", password="pass")
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_deactivate_user_as_regular_user_is_forbidden(self):
        target = User.objects.create_user(username="target", password="pass")
        self.client.force_authenticate(user=self.regular)
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_delete_user_as_admin_succeeds(self):
        target = User.objects.create_user(username="target", password="pass")
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/core/users/{target.id}/")
        self.assertEqual(response.status_code, 204)

    def test_delete_user_as_regular_user_is_forbidden(self):
        target = User.objects.create_user(username="target", password="pass")
        self.client.force_authenticate(user=self.regular)
        response = self.client.delete(f"/api/core/users/{target.id}/")
        self.assertEqual(response.status_code, 403)

    def test_user_management_unauthenticated_returns_403(self):
        response = self.client.get("/api/core/users/")
        self.assertEqual(response.status_code, 403)

    def test_list_users_includes_organization_role(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/core/users/")
        self.assertEqual(response.status_code, 200)
        roles = {u["username"]: u.get("organization_role") for u in response.data}
        self.assertEqual(roles["orgadmin"], "admin")
        self.assertEqual(roles["regular"], "user")
