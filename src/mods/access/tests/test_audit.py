"""Tests for the access-administration audit trail (issue #474).

Every access-administration mutation — Grants, Folder Shares, Teams,
Projects, Organization edits — produces exactly one Action Log Entry
after success with the expected action type and identifying metadata.
Denials, failed mutations, and read checks produce nothing, and an
audit-write failure never blocks the operation (fail-open).
"""

from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Project
from mods.access.models import (
    FolderShare,
    Grant,
    ProjectRole,
    ShareLevel,
    Team,
)
from mods.access.tests.factories import add_child_folder, make_org, make_project, make_user

LOG_ACTION_PATH = "mods.access.views.log_action"


# ── helpers ────────────────────────────────────────────────────────────────


def _log_kwargs(mock_log):
    """Extract the kwargs of the single log_action call."""
    return mock_log.call_args.kwargs


class _AuditTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")

    def setUp(self):
        self.client = APIClient()
        self._patcher = patch(LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()
        self.mock_log.return_value = None
        self.client.force_authenticate(user=self.admin)

    def tearDown(self):
        self._patcher.stop()


# ── Organization ───────────────────────────────────────────────────────────


class OrganizationAuditTests(_AuditTestBase):
    def test_edit_organization_logs_edited(self):
        response = self.client.patch(
            "/api/access/organization/",
            {"name": "Renamed Lab"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.organization.edited")
        self.assertEqual(kwargs["target_type"], "access.organization")
        self.assertEqual(kwargs["target_id"], self.org.id)
        self.assertEqual(kwargs["user"], self.admin)
        self.assertEqual(kwargs["metadata"], {"name": "Renamed Lab"})

    def test_denied_org_edit_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            "/api/access/organization/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_log.assert_not_called()

    def test_org_read_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/organization/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_not_called()


# ── Teams ──────────────────────────────────────────────────────────────────


class TeamAuditTests(_AuditTestBase):
    def _create_team(self, name="Alpha Team"):
        return self.client.post(
            "/api/access/teams/", {"name": name}, format="json",
        )

    def test_create_team_logs_created(self):
        response = self._create_team()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.team.created")
        self.assertEqual(kwargs["target_type"], "access.team")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["metadata"], {"name": "Alpha Team"})

    def test_edit_team_logs_edited(self):
        team_id = self._create_team().data["id"]
        self.mock_log.reset_mock()
        response = self.client.patch(
            f"/api/access/teams/{team_id}/",
            {"icon_key": "flask"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.team.edited")
        self.assertEqual(kwargs["target_id"], team_id)

    def test_delete_team_logs_deleted(self):
        team_id = self._create_team("Doomed").data["id"]
        self.mock_log.reset_mock()
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.team.deleted")
        self.assertEqual(kwargs["target_id"], team_id)
        self.assertEqual(kwargs["metadata"], {"name": "Doomed"})

    def test_add_member_logs_team_edited_with_member(self):
        team_id = self._create_team().data["id"]
        self.mock_log.reset_mock()
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.team.edited")
        self.assertEqual(kwargs["target_type"], "access.team")
        self.assertEqual(kwargs["target_id"], team_id)
        self.assertEqual(kwargs["metadata"]["member_id"], self.user.id)
        self.assertEqual(kwargs["metadata"]["member_username"], "regular")
        self.assertIs(kwargs["metadata"]["member_added"], True)

    def test_remove_member_logs_team_edited_with_member(self):
        team = Team.objects.create(
            group=Group.objects.create(name="Alpha Team"),
            organization=self.org,
        )
        team.group.user_set.add(self.user)
        response = self.client.post(
            f"/api/access/teams/{team.id}/remove_member/",
            {"user_id": self.user.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.team.edited")
        self.assertEqual(kwargs["metadata"]["member_id"], self.user.id)
        self.assertEqual(kwargs["metadata"]["member_username"], "regular")
        self.assertIs(kwargs["metadata"]["member_added"], False)

    def test_denied_team_create_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/access/teams/", {"name": "Hacked"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_log.assert_not_called()


# ── Projects ───────────────────────────────────────────────────────────────


class ProjectAuditTests(_AuditTestBase):
    def _create_project(self, name="Alpha"):
        return self.client.post(
            "/api/access/projects/", {"name": name}, format="json",
        )

    def test_create_project_logs_created(self):
        response = self._create_project()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.project.created")
        self.assertEqual(kwargs["target_type"], "access.project")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["metadata"], {"name": "Alpha"})

    def test_rename_project_logs_edited(self):
        project_id = self._create_project().data["id"]
        self.mock_log.reset_mock()
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.project.edited")
        self.assertEqual(kwargs["target_id"], project_id)
        self.assertEqual(kwargs["metadata"]["name"], "Renamed")
        self.assertIs(kwargs["metadata"]["is_archived"], False)

    def test_archive_project_logs_edited(self):
        project_id = self._create_project("To Archive").data["id"]
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.project.edited")
        self.assertIs(kwargs["metadata"]["is_archived"], True)

    def test_restore_project_logs_edited(self):
        project_id = self._create_project("To Restore").data["id"]
        self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True},
            format="json",
        )
        self.mock_log.reset_mock()
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.project.edited")
        self.assertIs(kwargs["metadata"]["is_archived"], False)

    def test_delete_project_logs_deleted(self):
        project_id = self._create_project("Doomed").data["id"]
        self.mock_log.reset_mock()
        response = self.client.delete(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.project.deleted")
        self.assertEqual(kwargs["target_id"], project_id)
        self.assertEqual(kwargs["metadata"], {"name": "Doomed"})

    def test_denied_project_create_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/access/projects/", {"name": "Hacked"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_log.assert_not_called()

    def test_project_read_writes_nothing(self):
        project_id = self._create_project().data["id"]
        self.mock_log.reset_mock()
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_not_called()


# ── Grants ─────────────────────────────────────────────────────────────────


class GrantAuditTests(_AuditTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.project = make_project("Alpha")

    def _grants_url(self):
        return f"/api/access/projects/{self.project.id}/grants/"

    def test_create_user_grant_logs_created(self):
        response = self.client.post(
            self._grants_url(),
            {"user": self.user.id, "role": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.grant.created")
        self.assertEqual(kwargs["target_type"], "access.grant")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["metadata"]["project"], self.project.id)
        self.assertEqual(kwargs["metadata"]["grantee_type"], "user")
        self.assertEqual(kwargs["metadata"]["grantee_id"], self.user.id)
        self.assertEqual(kwargs["metadata"]["grantee_name"], "regular")
        self.assertEqual(kwargs["metadata"]["role"], "read")

    def test_create_team_grant_logs_created(self):
        team = Team.objects.create(
            group=Group.objects.create(name="Omega Team"),
            organization=self.org,
        )
        response = self.client.post(
            self._grants_url(),
            {"team": team.id, "role": "edit"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.grant.created")
        self.assertEqual(kwargs["metadata"]["grantee_type"], "team")
        self.assertEqual(kwargs["metadata"]["grantee_id"], team.id)
        self.assertEqual(kwargs["metadata"]["grantee_name"], "Omega Team")
        self.assertEqual(kwargs["metadata"]["role"], "edit")

    def test_grant_role_change_logs_edited(self):
        Grant.objects.create(
            project=self.project,
            role=ProjectRole.READ,
            user=self.user,
        )
        response = self.client.post(
            self._grants_url(),
            {"user": self.user.id, "role": "edit"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.grant.edited")
        self.assertEqual(kwargs["metadata"]["grantee_id"], self.user.id)
        self.assertEqual(kwargs["metadata"]["role"], "edit")

    def test_delete_grant_logs_deleted(self):
        grant = Grant.objects.create(
            project=self.project,
            role=ProjectRole.READ,
            user=self.user,
        )
        response = self.client.delete(
            f"/api/access/projects/{self.project.id}/grants/{grant.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.grant.deleted")
        self.assertEqual(kwargs["target_id"], grant.id)
        self.assertEqual(kwargs["metadata"]["grantee_type"], "user")
        self.assertEqual(kwargs["metadata"]["grantee_id"], self.user.id)
        self.assertEqual(kwargs["metadata"]["role"], "read")

    def test_denied_grant_create_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self._grants_url(),
            {"user": self.user.id, "role": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_log.assert_not_called()

    def test_failed_grant_create_writes_nothing(self):
        response = self.client.post(
            self._grants_url(),
            {"role": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.mock_log.assert_not_called()


# ── Folder Shares ──────────────────────────────────────────────────────────


class FolderShareAuditTests(_AuditTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.project_a = make_project("Project A")
        cls.project_b = make_project("Project B")
        cls.folder = add_child_folder(cls.project_a, "Shared Folder")

    def _shares_url(self):
        return f"/api/access/projects/{self.project_b.id}/folder_shares/"

    def _share_url(self, share_pk):
        return f"/api/access/folder_shares/{share_pk}/"

    def test_create_share_logs_created(self):
        response = self.client.post(
            self._shares_url(),
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.folder_share.created")
        self.assertEqual(kwargs["target_type"], "access.folder_share")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["metadata"]["source_folder"], self.folder.pk)
        self.assertEqual(kwargs["metadata"]["target_project"], self.project_b.id)
        self.assertEqual(kwargs["metadata"]["level"], "read")

    def test_level_change_logs_edited(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        response = self.client.patch(
            self._share_url(share.id),
            {"level": "read_write"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.folder_share.edited")
        self.assertEqual(kwargs["target_id"], share.id)
        self.assertEqual(kwargs["metadata"]["level"], "read_write")

    def test_revoke_share_logs_deleted(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        response = self.client.delete(self._share_url(share.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "access.folder_share.deleted")
        self.assertEqual(kwargs["target_id"], share.id)
        self.assertEqual(kwargs["metadata"]["source_folder"], self.folder.pk)
        self.assertEqual(kwargs["metadata"]["target_project"], self.project_b.id)
        self.assertEqual(kwargs["metadata"]["level"], "read")

    def test_denied_share_create_writes_nothing(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self._shares_url(),
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_log.assert_not_called()


# ── Fail-open ──────────────────────────────────────────────────────────────


class AuditFailOpenTests(_AuditTestBase):
    def test_audit_write_failure_does_not_block_project_create(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        response = self.client.post(
            "/api/access/projects/", {"name": "Still Created"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Project.objects.filter(name="Still Created").count(), 1)

    def test_audit_write_failure_does_not_block_grant_create(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        project = make_project("Alpha")
        response = self.client.post(
            f"/api/access/projects/{project.id}/grants/",
            {"user": self.user.id, "role": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Grant.objects.filter(project=project, user=self.user).count(),
            1,
        )

    def test_audit_write_failure_does_not_block_org_edit(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        response = self.client.patch(
            "/api/access/organization/",
            {"name": "Still Edited"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.org.refresh_from_db()
        self.assertEqual(self.org.name, "Still Edited")

    def test_audit_write_failure_does_not_block_team_member_add(self):
        self.mock_log.side_effect = RuntimeError("audit table down")
        response = self.client.post(
            "/api/access/teams/", {"name": "Alpha Team"}, format="json",
        )
        team_id = response.data["id"]
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        team = Team.objects.get(pk=team_id)
        self.assertTrue(team.group.user_set.filter(pk=self.user.id).exists())
