"""
Tests for Folder and CoreSetting API endpoints — action logging.

Exercises ActionLoggingMixin on FolderViewSet and CoreSettingViewSet.
"""
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import CoreSetting, Folder, Project, User
from core.tests.base import BaseTestCase
from mods.access.models import Organization, OrganizationMembership, OrganizationRole

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
        org = Organization.objects.create(name="Test Lab")
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={"organization": org, "role": OrganizationRole.ADMIN},
        )
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
        org = Organization.objects.create(name="Test Lab")
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={"organization": org, "role": OrganizationRole.ADMIN},
        )
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


# ── Folder rename validation tests ──────────────────────────────────────────


class FolderRenameValidationTests(BaseTestCase):
    """Test that renaming folders enforces the root-level name uniqueness invariant."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_reject_root_level_name_collision_with_own_child(self):
        Folder.objects.create(
            name="ExistingChild", parent=self.root_folder, project=self.project,
        )
        target = Folder.objects.create(
            name="Target", parent=self.root_folder, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{target.id}/",
            {"name": "ExistingChild"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_reject_root_level_name_collision_with_incoming_share(self):
        from mods.access.models import FolderShare, Organization, OrganizationMembership, OrganizationRole, ShareLevel

        org = Organization.objects.create(name="Test Org")
        other_user = User.objects.create_user(username="other", password="pass")
        OrganizationMembership.objects.create(user=self.user, organization=org, role=OrganizationRole.ADMIN)

        other_project = Project.objects.create(name="Other Project")
        Folder.objects.create(name="root", parent=None, project=other_project)
        shared_source = Folder.objects.create(
            name="SharedIn", parent=Folder.objects.get(project=other_project, parent__isnull=True),
            project=other_project,
        )

        target = Folder.objects.create(
            name="Target", parent=self.root_folder, project=self.project,
        )

        FolderShare.objects.create(
            source_folder=shared_source,
            target_project=self.project,
            level=ShareLevel.READ,
        )

        response = self.client.patch(
            f"/api/core/folders/{target.id}/",
            {"name": "SharedIn"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_allow_descendant_rename_unconstrained(self):
        child = Folder.objects.create(
            name="ChildFolder", parent=self.folder, project=self.project,
        )
        sibling = Folder.objects.create(
            name="Sibling", parent=self.folder, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{child.id}/",
            {"name": "Sibling"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        child.refresh_from_db()
        self.assertEqual(child.name, "Sibling")

    def test_allow_root_level_rename_when_no_collision(self):
        target = Folder.objects.create(
            name="OriginalName", parent=self.root_folder, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{target.id}/",
            {"name": "NewUniqueName"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.name, "NewUniqueName")

    def test_rename_does_not_self_collide(self):
        """Renaming a folder to its own name should not trigger a collision."""
        target = Folder.objects.create(
            name="KeepMe", parent=self.root_folder, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{target.id}/",
            {"name": "KeepMe"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)


# ── Folder rename access enforcement tests ──────────────────────────────────


class FolderRenameAccessTests(TestCase):
    """Test that folder PATCH enforces Edit access across the full actor matrix."""

    def setUp(self):
        from django.contrib.auth.models import Group
        from mods.access.models import (
            FolderShare,
            Grant,
            Organization,
            OrganizationMembership,
            OrganizationRole,
            ProjectRole,
            ShareLevel,
            Team,
        )

        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")

        self.admin = User.objects.create_user(username="admin", password="pass")
        self.editor = User.objects.create_user(username="editor", password="pass")
        self.reader = User.objects.create_user(username="reader", password="pass")
        self.other = User.objects.create_user(username="other", password="pass")

        OrganizationMembership.objects.update_or_create(
            user=self.admin, defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.editor, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.reader, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.other, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )

        self.project = Project.objects.create(name="Test Project")
        self.root = Folder.objects.create(name="root", parent=None, project=self.project)
        self.folder = Folder.objects.create(name="MyFolder", parent=self.root, project=self.project)
        self.child = Folder.objects.create(name="ChildFolder", parent=self.folder, project=self.project)

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.source_project = Project.objects.create(name="Source Project")
        Folder.objects.create(name="root", parent=None, project=self.source_project)
        self.shared_folder = Folder.objects.create(
            name="SharedFolder", parent=Folder.objects.get(project=self.source_project, parent__isnull=True),
            project=self.source_project,
        )
        self.shared_child = Folder.objects.create(
            name="SharedChild", parent=self.shared_folder, project=self.source_project,
        )

        self.target_project = Project.objects.create(name="Target Project")
        Folder.objects.create(name="root", parent=None, project=self.target_project)
        Grant.objects.create(project=self.target_project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.target_project, user=self.reader, role=ProjectRole.READ)

        self.rw_share = FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=ShareLevel.READ_WRITE,
        )

        self.ShareLevel = ShareLevel
        self.ProjectRole = ProjectRole
        self.FolderShare = FolderShare
        self.Grant = Grant

    def _assert_403(self, user, folder):
        self.client.force_authenticate(user=user)
        response = self.client.patch(
            f"/api/core/folders/{folder.id}/",
            {"name": "HackedName"},
            format="json",
        )
        self.assertEqual(response.status_code, 403, f"{user.username} should be denied")

    def _assert_200(self, user, folder, new_name="NewName"):
        self.client.force_authenticate(user=user)
        response = self.client.patch(
            f"/api/core/folders/{folder.id}/",
            {"name": new_name},
            format="json",
        )
        self.assertEqual(response.status_code, 200, f"{user.username} should be allowed")
        folder.refresh_from_db()
        self.assertEqual(folder.name, new_name)

    def test_read_user_cannot_rename(self):
        self._assert_403(self.reader, self.folder)

    def test_edit_user_can_rename(self):
        self._assert_200(self.editor, self.folder, "RenamedByEditor")

    def test_org_admin_can_rename(self):
        self._assert_200(self.admin, self.folder, "RenamedByAdmin")

    def test_team_derived_edit_can_rename(self):
        from mods.access.models import Grant, ProjectRole, Team
        from django.contrib.auth.models import Group

        group = Group.objects.create(name="editor_team")
        self.editor.groups.add(group)
        team = Team.objects.create(
            group=group,
            organization=self.org,
        )
        Grant.objects.create(project=self.project, team=team, role=ProjectRole.EDIT)
        self._assert_200(self.editor, self.folder, "RenamedByTeamEdit")

    def test_sharee_with_read_write_can_rename_descendant(self):
        self._assert_200(self.editor, self.shared_child, "RenamedDescendant")

    def test_sharee_with_read_cannot_rename_descendant(self):
        self.FolderShare.objects.filter(
            source_folder=self.shared_folder, target_project=self.target_project,
        ).update(level=self.ShareLevel.READ)
        self._assert_403(self.reader, self.shared_child)

    def test_sharee_cannot_rename_shared_top_level_folder(self):
        self._assert_403(self.editor, self.shared_folder)

    def test_owner_can_rename_shared_top_level_folder(self):
        self.Grant.objects.create(project=self.source_project, user=self.editor, role=self.ProjectRole.EDIT)
        self._assert_200(self.editor, self.shared_folder, "RenamedShared")

    def test_user_with_no_access_cannot_rename(self):
        self._assert_403(self.other, self.folder)

    def test_unauthenticated_cannot_rename(self):
        self.client.logout()
        response = self.client.patch(
            f"/api/core/folders/{self.folder.id}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


# ── Folder delete access enforcement tests ──────────────────────────────────


class FolderDeleteAccessTests(TestCase):
    """Test that folder DELETE enforces Edit access across the full actor matrix."""

    def setUp(self):
        from django.contrib.auth.models import Group
        from mods.access.models import (
            FolderShare,
            Grant,
            Organization,
            OrganizationMembership,
            OrganizationRole,
            ProjectRole,
            ShareLevel,
            Team,
        )

        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")

        self.admin = User.objects.create_user(username="del_admin", password="pass")
        self.editor = User.objects.create_user(username="del_editor", password="pass")
        self.reader = User.objects.create_user(username="del_reader", password="pass")
        self.other = User.objects.create_user(username="del_other", password="pass")

        OrganizationMembership.objects.update_or_create(
            user=self.admin, defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.editor, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.reader, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.other, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )

        self.project = Project.objects.create(name="Delete Test Project")
        self.root = Folder.objects.create(name="root", parent=None, project=self.project)
        self.folder = Folder.objects.create(name="MyFolder", parent=self.root, project=self.project)
        self.child = Folder.objects.create(name="ChildFolder", parent=self.folder, project=self.project)
        self.grandchild = Folder.objects.create(name="Grandchild", parent=self.child, project=self.project)

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.source_project = Project.objects.create(name="Source Project")
        Folder.objects.create(name="root", parent=None, project=self.source_project)
        self.shared_folder = Folder.objects.create(
            name="SharedFolder", parent=Folder.objects.get(project=self.source_project, parent__isnull=True),
            project=self.source_project,
        )
        self.shared_child = Folder.objects.create(
            name="SharedChild", parent=self.shared_folder, project=self.source_project,
        )

        self.target_project = Project.objects.create(name="Target Project")
        Folder.objects.create(name="root", parent=None, project=self.target_project)
        Grant.objects.create(project=self.target_project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.target_project, user=self.reader, role=ProjectRole.READ)

        self.rw_share = FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=ShareLevel.READ_WRITE,
        )

        self.ShareLevel = ShareLevel
        self.ProjectRole = ProjectRole
        self.FolderShare = FolderShare
        self.Grant = Grant

    def _assert_403(self, user, folder):
        self.client.force_authenticate(user=user)
        response = self.client.delete(f"/api/core/folders/{folder.id}/")
        self.assertEqual(response.status_code, 403, f"{user.username} should be denied")
        folder.refresh_from_db()

    def _assert_204(self, user, folder):
        self.client.force_authenticate(user=user)
        response = self.client.delete(f"/api/core/folders/{folder.id}/")
        self.assertEqual(response.status_code, 204, f"{user.username} should be allowed")
        self.assertFalse(Folder.objects.filter(id=folder.id).exists())

    # ── Basic actor matrix ──

    def test_read_user_cannot_delete(self):
        self._assert_403(self.reader, self.folder)

    def test_edit_user_can_delete(self):
        self._assert_204(self.editor, self.folder)

    def test_org_admin_can_delete(self):
        self._assert_204(self.admin, self.folder)

    def test_team_derived_edit_can_delete(self):
        from mods.access.models import Grant, OrganizationMembership, OrganizationRole, ProjectRole, Team
        from django.contrib.auth.models import Group

        team_user = User.objects.create_user(username="team_del", password="pass")
        OrganizationMembership.objects.update_or_create(
            user=team_user, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        group = Group.objects.create(name="Delete Team")
        team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(project=self.project, team=team, role=ProjectRole.EDIT)
        self._assert_204(team_user, self.folder)

    def test_user_with_no_access_cannot_delete(self):
        self._assert_403(self.other, self.folder)

    def test_unauthenticated_cannot_delete(self):
        self.client.logout()
        response = self.client.delete(f"/api/core/folders/{self.folder.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Folder.objects.filter(id=self.folder.id).exists())

    # ── Hidden root protection ──

    def test_hidden_root_cannot_be_deleted(self):
        self._assert_403(self.admin, self.root)

    # ── Shared folder path ──

    def test_sharee_with_read_write_can_delete_descendant(self):
        self._assert_204(self.editor, self.shared_child)

    def test_sharee_with_read_cannot_delete_descendant(self):
        self.FolderShare.objects.filter(
            source_folder=self.shared_folder, target_project=self.target_project,
        ).update(level=self.ShareLevel.READ)
        self._assert_403(self.reader, self.shared_child)

    def test_sharee_cannot_delete_shared_top_level_folder(self):
        self._assert_403(self.editor, self.shared_folder)

    def test_owner_can_delete_shared_folder(self):
        self.Grant.objects.create(project=self.source_project, user=self.editor, role=self.ProjectRole.EDIT)
        self._assert_204(self.editor, self.shared_folder)

    # ── Recursive CASCADE ──

    def test_deleting_folder_cascades_to_children(self):
        children_count = Folder.objects.filter(parent=self.folder).count()
        self.assertGreater(children_count, 0)
        self._assert_204(self.editor, self.folder)
        self.assertFalse(Folder.objects.filter(parent_id=self.folder.id).exists())

    def test_deleting_folder_cascades_to_grandchildren(self):
        self._assert_204(self.editor, self.child)
        self.assertFalse(Folder.objects.filter(id=self.grandchild.id).exists())

    # ── Share revocation on delete ──

    def test_deleting_shared_folder_cascades_its_shares(self):
        self.Grant.objects.create(project=self.source_project, user=self.editor, role=self.ProjectRole.EDIT)
        share_count_before = self.FolderShare.objects.filter(source_folder=self.shared_folder).count()
        self.assertGreater(share_count_before, 0)
        self._assert_204(self.editor, self.shared_folder)
        self.assertEqual(
            self.FolderShare.objects.filter(source_folder_id=self.shared_folder.id).count(),
            0,
        )


# ── Folder create access enforcement tests ───────────────────────────────────


class FolderCreateAccessTests(TestCase):
    """Folder creation requires Edit on the destination Folder's Project."""

    def setUp(self):
        from django.contrib.auth.models import Group
        from mods.access.models import (
            FolderShare,
            Grant,
            Organization,
            OrganizationMembership,
            OrganizationRole,
            ProjectRole,
            ShareLevel,
            Team,
        )

        self.client = APIClient()
        self.org = Organization.objects.create(name="Create Lab")

        self.admin = User.objects.create_user(username="create_admin", password="pass")
        self.editor = User.objects.create_user(username="create_editor", password="pass")
        self.reader = User.objects.create_user(username="create_reader", password="pass")
        self.other = User.objects.create_user(username="create_other", password="pass")
        self.sharee = User.objects.create_user(username="create_sharee", password="pass")

        OrganizationMembership.objects.update_or_create(
            user=self.admin, defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        for user in (self.editor, self.reader, self.other, self.sharee):
            OrganizationMembership.objects.update_or_create(
                user=user, defaults={"organization": self.org, "role": OrganizationRole.USER},
            )

        self.project = Project.objects.create(name="Create Project")
        self.root = Folder.objects.create(name="root", parent=None, project=self.project)
        self.folder = Folder.objects.create(name="MyFolder", parent=self.root, project=self.project)

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.source_project = Project.objects.create(name="Create Source")
        source_root = Folder.objects.create(name="root", parent=None, project=self.source_project)
        self.shared_folder = Folder.objects.create(
            name="Shared", parent=source_root, project=self.source_project,
        )
        self.shared_child = Folder.objects.create(
            name="Deep", parent=self.shared_folder, project=self.source_project,
        )
        self.outside_folder = Folder.objects.create(
            name="Outside", parent=source_root, project=self.source_project,
        )

        self.target_project = Project.objects.create(name="Create Target")
        Folder.objects.create(name="root", parent=None, project=self.target_project)
        Grant.objects.create(project=self.target_project, user=self.sharee, role=ProjectRole.EDIT)
        FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=ShareLevel.READ_WRITE,
        )

    def _create(self, user, parent):
        self.client.force_authenticate(user=user)
        return self.client.post(
            "/api/core/folders/",
            {"name": "New Folder", "parent": parent.id, "project": parent.project.id},
            format="json",
        )

    def test_edit_user_can_create(self):
        self.assertEqual(self._create(self.editor, self.folder).status_code, 201)

    def test_org_admin_can_create(self):
        self.assertEqual(self._create(self.admin, self.folder).status_code, 201)

    def test_team_derived_edit_can_create(self):
        from django.contrib.auth.models import Group
        from mods.access.models import (
            Grant,
            OrganizationMembership,
            OrganizationRole,
            ProjectRole,
            Team,
        )

        team_user = User.objects.create_user(username="create_team", password="pass")
        OrganizationMembership.objects.update_or_create(
            user=team_user, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        group = Group.objects.create(name="Create Folder Team")
        team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(project=self.project, team=team, role=ProjectRole.EDIT)
        self.assertEqual(self._create(team_user, self.folder).status_code, 201)

    def test_read_user_cannot_create(self):
        response = self._create(self.reader, self.folder)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Folder.objects.filter(name="New Folder").count(), 0)

    def test_user_with_no_access_cannot_create(self):
        self.assertEqual(self._create(self.other, self.folder).status_code, 403)

    def test_unauthenticated_cannot_create(self):
        self.client.logout()
        response = self.client.post(
            "/api/core/folders/",
            {"name": "Hacked", "parent": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_read_write_sharee_can_create_inside_subtree(self):
        self.assertEqual(self._create(self.sharee, self.shared_child).status_code, 201)

    def test_read_write_sharee_cannot_create_outside_subtree(self):
        response = self._create(self.sharee, self.outside_folder)
        self.assertEqual(response.status_code, 403)

    def test_read_write_sharee_cannot_create_in_shared_top_level(self):
        response = self._create(self.sharee, self.shared_folder)
        self.assertEqual(response.status_code, 403)


# ── Folder move access enforcement tests ─────────────────────────────────────


class FolderMoveAccessTests(TestCase):
    """Folder moves reject cross-Project moves and clamp to the shared subtree."""

    def setUp(self):
        from django.contrib.auth.models import Group
        from mods.access.models import (
            FolderShare,
            Grant,
            Organization,
            OrganizationMembership,
            OrganizationRole,
            ProjectRole,
            ShareLevel,
            Team,
        )

        self.client = APIClient()
        self.org = Organization.objects.create(name="Move Lab")

        self.admin = User.objects.create_user(username="move_admin", password="pass")
        self.editor = User.objects.create_user(username="move_editor", password="pass")
        self.reader = User.objects.create_user(username="move_reader", password="pass")
        self.sharee = User.objects.create_user(username="move_sharee", password="pass")

        OrganizationMembership.objects.update_or_create(
            user=self.admin, defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        for user in (self.editor, self.reader, self.sharee):
            OrganizationMembership.objects.update_or_create(
                user=user, defaults={"organization": self.org, "role": OrganizationRole.USER},
            )

        self.project = Project.objects.create(name="Move Project")
        self.root = Folder.objects.create(name="root", parent=None, project=self.project)
        self.folder = Folder.objects.create(name="MyFolder", parent=self.root, project=self.project)
        self.other_folder = Folder.objects.create(name="Other", parent=self.root, project=self.project)

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.source_project = Project.objects.create(name="Move Source")
        source_root = Folder.objects.create(name="root", parent=None, project=self.source_project)
        self.shared_folder = Folder.objects.create(
            name="Shared", parent=source_root, project=self.source_project,
        )
        self.shared_child = Folder.objects.create(
            name="Deep", parent=self.shared_folder, project=self.source_project,
        )
        self.movable = Folder.objects.create(
            name="Movable", parent=self.shared_child, project=self.source_project,
        )
        self.outside_folder = Folder.objects.create(
            name="Outside", parent=source_root, project=self.source_project,
        )

        self.target_project = Project.objects.create(name="Move Target")
        Folder.objects.create(name="root", parent=None, project=self.target_project)
        Grant.objects.create(project=self.target_project, user=self.sharee, role=ProjectRole.EDIT)
        self.rw_share = FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=ShareLevel.READ_WRITE,
        )

    def _move(self, user, folder, new_parent):
        self.client.force_authenticate(user=user)
        return self.client.patch(
            f"/api/core/folders/{folder.id}/",
            {"parent": new_parent.id},
            format="json",
        )

    def test_cross_project_move_rejected(self):
        other_project = Project.objects.create(name="Elsewhere")
        other_root = Folder.objects.create(name="root", parent=None, project=other_project)
        response = self._move(self.editor, self.folder, other_root)
        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.project_id, self.project.id)

    def test_direct_editor_can_move_within_project(self):
        response = self._move(self.editor, self.folder, self.other_folder)
        self.assertEqual(response.status_code, 200)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.parent_id, self.other_folder.id)

    def test_org_admin_can_move_within_project(self):
        response = self._move(self.admin, self.folder, self.other_folder)
        self.assertEqual(response.status_code, 200)

    def test_read_user_cannot_move(self):
        response = self._move(self.reader, self.folder, self.other_folder)
        self.assertEqual(response.status_code, 403)

    def test_sharee_can_move_inside_subtree(self):
        response = self._move(self.sharee, self.movable, self.shared_child)
        self.assertEqual(response.status_code, 200)
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.parent_id, self.shared_child.id)

    def test_sharee_cannot_move_outside_subtree(self):
        response = self._move(self.sharee, self.movable, self.outside_folder)
        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.parent_id, self.shared_child.id)

    def test_sharee_cannot_move_to_project_root(self):
        source_root = Folder.objects.get(project=self.source_project, parent=None)
        response = self._move(self.sharee, self.movable, source_root)
        self.assertEqual(response.status_code, 400)

    def test_sharee_cannot_move_shared_top_level_folder(self):
        source_root = Folder.objects.get(project=self.source_project, parent=None)
        response = self._move(self.sharee, self.shared_folder, source_root)
        self.assertEqual(response.status_code, 403)
