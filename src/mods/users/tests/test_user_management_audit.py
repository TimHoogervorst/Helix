"""Audit-trail tests for UserViewSet (core.user created / edited / deleted)."""

from unittest.mock import patch

from core.models import User
from core.tests.base import BaseTestCase
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)

LOG_ACTION_PATH = "mods.users.views.log_action"


def _log_kwargs(mock_log):
    """Extract the kwargs of the single log_action call."""
    return mock_log.call_args.kwargs


class UserManagementAuditTests(BaseTestCase):
    """Every user-management mutation logs exactly one core.user entry."""

    def setUp(self):
        super().setUp()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(
            username="orgadmin", password="pass",
        )
        self.regular = User.objects.create_user(
            username="regular", password="pass",
        )
        OrganizationMembership.objects.update_or_create(
            user=self.admin,
            defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.regular,
            defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        self.client.force_authenticate(user=self.admin)
        self._patcher = patch(LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()
        self.mock_log.return_value = None

    def tearDown(self):
        self._patcher.stop()

    def test_create_user_logs_created(self):
        response = self.client.post(
            "/api/core/users/",
            {"username": "newuser", "password": "Str0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.user.created")
        self.assertEqual(kwargs["target_type"], "core.user")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.admin)
        self.assertEqual(kwargs["metadata"], {"username": "newuser"})

    def test_edit_user_logs_edited(self):
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"first_name": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.user.edited")
        self.assertEqual(kwargs["target_type"], "core.user")
        self.assertEqual(kwargs["target_id"], target.id)
        self.assertEqual(kwargs["metadata"], {"username": "target"})

    def test_reactivate_user_logs_edited(self):
        target = User.objects.create_user(
            username="target", password="pass", is_active=False,
        )
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.user.edited")

    def test_deactivate_user_logs_deactivated(self):
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.user.deactivated")
        self.assertEqual(kwargs["metadata"], {"username": "target"})

    def test_delete_user_logs_deleted(self):
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.delete(f"/api/core/users/{target.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.user.deleted")
        self.assertEqual(kwargs["target_type"], "core.user")
        self.assertEqual(kwargs["target_id"], target.id)
        self.assertEqual(kwargs["metadata"], {"username": "target"})

    def test_denied_mutation_writes_nothing(self):
        self.client.force_authenticate(user=self.regular)
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"first_name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()

    def test_denied_delete_writes_nothing(self):
        self.client.force_authenticate(user=self.regular)
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.delete(f"/api/core/users/{target.id}/")
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()
        self.assertTrue(User.objects.filter(pk=target.id).exists())

    def test_list_users_writes_nothing(self):
        response = self.client.get("/api/core/users/")
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

    def test_audit_write_failure_does_not_block_edit(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.patch(
            f"/api/core/users/{target.id}/",
            {"first_name": "Still Saved"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.first_name, "Still Saved")

    def test_audit_write_failure_does_not_block_delete(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        target = User.objects.create_user(username="target", password="pass")
        response = self.client.delete(f"/api/core/users/{target.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=target.id).exists())
