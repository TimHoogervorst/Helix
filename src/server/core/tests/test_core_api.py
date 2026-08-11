"""
Tests for Folder and CoreSetting API endpoints — action logging.

Exercises ActionLoggingMixin on FolderViewSet and CoreSettingViewSet.
"""
from unittest.mock import patch

from core.models import CoreSetting, Folder
from core.tests.base import BaseTestCase

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class FolderActionLoggingTests(BaseTestCase):
    """Test that Folder CRUD operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_folder_logs_action(self):
        response = self.client.post(
            "/api/core/folders/",
            {"name": "My Folder", "project": self.project.id, "parent": self.root_folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.folder.created")
        self.assertEqual(kwargs["target_type"], "core.folder")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_folder_logs_action(self):
        folder = Folder.objects.create(
            name="Old Name", project=self.project, parent=self.root_folder,
        )
        response = self.client.put(
            f"/api/core/folders/{folder.id}/",
            {"name": "New Name", "project": self.project.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.folder.edited")
        self.assertEqual(kwargs["target_type"], "core.folder")
        self.assertEqual(kwargs["target_id"], folder.id)

    def test_partial_update_folder_logs_action(self):
        folder = Folder.objects.create(
            name="PatchMe", project=self.project, parent=self.root_folder,
        )
        response = self.client.patch(
            f"/api/core/folders/{folder.id}/",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.folder.edited")

    def test_delete_folder_logs_action(self):
        folder = Folder.objects.create(
            name="DeleteMe", project=self.project, parent=self.root_folder,
        )
        response = self.client.delete(f"/api/core/folders/{folder.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.folder.deleted")
        self.assertEqual(kwargs["target_type"], "core.folder")
        self.assertEqual(kwargs["target_id"], folder.id)

    def test_create_folder_captures_client_ip(self):
        self.client.post(
            "/api/core/folders/",
            {"name": "IP Test", "project": self.project.id, "parent": self.root_folder.id},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_get_does_not_log(self):
        Folder.objects.create(
            name="ReadOnly", project=self.project, parent=self.root_folder,
        )
        self.client.get("/api/core/folders/")
        self.mock_log.assert_not_called()


class CoreSettingActionLoggingTests(BaseTestCase):
    """Test that CoreSetting PATCH operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_patch_setting_logs_action(self):
        setting = CoreSetting.objects.create(key="test_key", value={"enabled": False})
        response = self.client.patch(
            f"/api/core/settings/{setting.key}/",
            {"value": {"enabled": True}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.setting.edited")
        self.assertEqual(kwargs["target_type"], "core.setting")
        self.assertEqual(kwargs["target_id"], setting.id)
        self.assertEqual(kwargs["user"], self.user)

    def test_patch_setting_captures_client_ip(self):
        setting = CoreSetting.objects.create(key="ip_key", value={"enabled": False})
        self.client.patch(
            f"/api/core/settings/{setting.key}/",
            {"value": {"enabled": True}},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_patch_nonexistent_setting_does_not_log(self):
        response = self.client.patch(
            "/api/core/settings/nonexistent/",
            {"value": {"enabled": True}},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.mock_log.assert_not_called()

    def test_get_does_not_log(self):
        CoreSetting.objects.create(key="read_only", value={"enabled": False})
        self.client.get("/api/core/settings/")
        self.mock_log.assert_not_called()

    def test_unauthenticated_does_not_log(self):
        self.client.logout()
        setting = CoreSetting.objects.create(key="anon_key", value={"enabled": False})
        response = self.client.patch(
            f"/api/core/settings/{setting.key}/",
            {"value": {"enabled": True}},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()
