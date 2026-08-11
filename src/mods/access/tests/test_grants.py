"""Tests for Grant model, API, role resolution, and Team deletion blocking."""

from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Folder, Project, User
from mods.access.models import (
    Grant,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    ProjectRole,
    Team,
)
from mods.access.policies import role


class GrantModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.user2 = User.objects.create_user(username="other", password="pass")
        self.project = Project.objects.create(name="Alpha")
        Group.objects.create(name="Alpha Team")
        self.group = Group.objects.create(name="Omega Team")
        self.team = Team.objects.create(
            group=self.group, organization=self.org,
        )

    # ── basic creation ────────────────────────────────────────────────────

    def test_create_grant_with_user(self):
        grant = Grant.objects.create(
            project=self.project,
            role=ProjectRole.READ,
            user=self.user,
        )
        self.assertEqual(grant.role, ProjectRole.READ)
        self.assertEqual(grant.user, self.user)
        self.assertIsNone(grant.team)

    def test_create_grant_with_team(self):
        grant = Grant.objects.create(
            project=self.project,
            role=ProjectRole.EDIT,
            team=self.team,
        )
        self.assertEqual(grant.role, ProjectRole.EDIT)
        self.assertEqual(grant.team, self.team)
        self.assertIsNone(grant.user)

    # ── validation ────────────────────────────────────────────────────────

    def test_clean_rejects_both_grantees(self):
        grant = Grant(
            project=self.project,
            role=ProjectRole.READ,
            user=self.user,
            team=self.team,
        )
        with self.assertRaises(ValidationError):
            grant.clean()

    def test_clean_rejects_no_grantee(self):
        grant = Grant(
            project=self.project,
            role=ProjectRole.READ,
        )
        with self.assertRaises(ValidationError):
            grant.clean()

    # ── uniqueness ────────────────────────────────────────────────────────

    def test_upsert_user_grant_replaces_role(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        Grant.objects.update_or_create(
            project=self.project,
            user=self.user,
            defaults={"role": ProjectRole.EDIT},
        )
        self.assertEqual(
            Grant.objects.filter(project=self.project, user=self.user).count(),
            1,
        )
        self.assertEqual(
            Grant.objects.get(
                project=self.project, user=self.user,
            ).role,
            ProjectRole.EDIT,
        )

    def test_upsert_team_grant_replaces_role(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=self.team,
        )
        Grant.objects.update_or_create(
            project=self.project,
            team=self.team,
            defaults={"role": ProjectRole.EDIT},
        )
        self.assertEqual(
            Grant.objects.filter(project=self.project, team=self.team).count(),
            1,
        )
        self.assertEqual(
            Grant.objects.get(
                project=self.project, team=self.team,
            ).role,
            ProjectRole.EDIT,
        )

    def test_different_users_can_have_grants_on_same_project(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user2,
        )
        self.assertEqual(
            Grant.objects.filter(project=self.project).count(), 2,
        )

    # ── team deletion blocking ────────────────────────────────────────────

    def test_team_blocked_from_deletion_when_grant_exists(self):
        Grant.objects.create(
            project=self.project,
            role=ProjectRole.READ,
            team=self.team,
        )
        self.assertTrue(self.team.blocked_from_deletion)

    def test_team_not_blocked_when_no_grants(self):
        self.assertFalse(self.team.blocked_from_deletion)

    # ── str ───────────────────────────────────────────────────────────────

    def test_str_with_user(self):
        grant = Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.assertIn(self.user.username, str(grant))
        self.assertIn("read", str(grant))
        self.assertIn(self.project.name, str(grant))

    def test_str_with_team(self):
        grant = Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team,
        )
        self.assertIn(self.team.name, str(grant))
        self.assertIn("edit", str(grant))
        self.assertIn(self.project.name, str(grant))

    # ── cascade ───────────────────────────────────────────────────────────

    def test_deleting_project_cascades_grants(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        project_id = self.project.pk
        Folder.objects.create(name="root", parent=None, project=self.project)
        self.project.delete()
        self.assertEqual(Grant.objects.filter(project_id=project_id).count(), 0)

    def test_deleting_user_cascades_grants(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        user_id = self.user.pk
        self.user.delete()
        self.assertEqual(Grant.objects.filter(user_id=user_id).count(), 0)


class GrantApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.user2 = User.objects.create_user(username="other", password="pass")
        admin_membership = OrganizationMembership.objects.get(user=self.admin)
        admin_membership.role = OrganizationRole.ADMIN
        admin_membership.save()
        self.project = Project.objects.create(name="Alpha")
        Folder.objects.create(name="root", parent=None, project=self.project)
        self.group = Group.objects.create(name="My Team")
        self.team = Team.objects.create(
            group=self.group, organization=self.org,
        )

    @property
    def _grants_url(self):
        return f"/api/access/projects/{self.project.pk}/grants/"

    def _grant_url(self, grant_pk):
        return f"/api/access/projects/{self.project.pk}/grants/{grant_pk}/"

    # ── list grants ───────────────────────────────────────────────────────

    def test_admin_can_list_grants(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._grants_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["role"], "read")
        self.assertEqual(response.data[0]["grantee_type"], "user")
        self.assertEqual(response.data[0]["grantee_name"], "regular")

    def test_regular_user_cannot_list_grants(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self._grants_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_list_grants(self):
        response = self.client.get(self._grants_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── create grant ──────────────────────────────────────────────────────

    def test_admin_can_create_user_grant(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._grants_url,
            {"role": "read", "user": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], "read")
        self.assertEqual(response.data["user"], self.user.pk)
        self.assertTrue(
            Grant.objects.filter(
                project=self.project, user=self.user, role=ProjectRole.READ,
            ).exists(),
        )

    def test_admin_can_create_team_grant(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._grants_url,
            {"role": "edit", "team": self.team.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], "edit")
        self.assertEqual(response.data["team"], self.team.pk)
        self.assertTrue(
            Grant.objects.filter(
                project=self.project, team=self.team, role=ProjectRole.EDIT,
            ).exists(),
        )

    def test_create_replaces_existing_user_grant(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            self._grants_url,
            {"role": "read", "user": self.user.pk},
            format="json",
        )
        response = self.client.post(
            self._grants_url,
            {"role": "edit", "user": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], "edit")
        self.assertEqual(
            Grant.objects.filter(
                project=self.project, user=self.user,
            ).count(),
            1,
        )

    def test_regular_user_cannot_create_grant(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self._grants_url,
            {"role": "read", "user": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_grant_fails_when_both_grantees(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._grants_url,
            {"role": "read", "user": self.user.pk, "team": self.team.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_grant_fails_when_no_grantee(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._grants_url,
            {"role": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_grant_fails_when_project_not_found(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/projects/999/grants/",
            {"role": "read", "user": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ── delete grant ──────────────────────────────────────────────────────

    def test_admin_can_delete_grant(self):
        grant = Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self._grant_url(grant.pk))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Grant.objects.filter(pk=grant.pk).exists())

    def test_regular_user_cannot_delete_grant(self):
        grant = Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(self._grant_url(grant.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_grant_404_when_not_found(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self._grant_url(999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_grant_404_when_project_not_found(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(
            "/api/access/projects/999/grants/1/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ── inactive user ─────────────────────────────────────────────────────

    def test_inactive_user_cannot_access_grants(self):
        inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        self.client.force_authenticate(user=inactive)
        response = self.client.get(self._grants_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RoleResolutionTests(TestCase):
    """Test access.role() using direct and Team Grants."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.user2 = User.objects.create_user(username="other", password="pass")
        self.inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        admin_membership = OrganizationMembership.objects.get(user=self.admin)
        admin_membership.role = OrganizationRole.ADMIN
        admin_membership.save()
        self.project = Project.objects.create(name="Alpha")
        Folder.objects.create(name="root", parent=None, project=self.project)
        self.group = Group.objects.create(name="My Team")
        self.team = Team.objects.create(
            group=self.group, organization=self.org,
        )
        self.group2 = Group.objects.create(name="Other Team")
        self.team2 = Team.objects.create(
            group=self.group2, organization=self.org,
        )

    # ── anonymous / inactive ──────────────────────────────────────────────

    def test_none_user_returns_none(self):
        self.assertIsNone(role(None, self.project))

    def test_anonymous_user_returns_none(self):
        anon = User(username="anon")
        self.assertIsNone(role(anon, self.project))

    def test_inactive_user_returns_none(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.inactive,
        )
        self.assertIsNone(role(self.inactive, self.project))

    # ── org admin ─────────────────────────────────────────────────────────

    def test_org_admin_returns_edit(self):
        self.assertEqual(role(self.admin, self.project), "edit")

    def test_org_admin_returns_edit_even_without_grant(self):
        self.assertEqual(role(self.admin, self.project), "edit")

    # ── no grant ──────────────────────────────────────────────────────────

    def test_regular_user_without_grant_returns_none(self):
        self.assertIsNone(role(self.user, self.project))

    def test_no_project_returns_none(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        self.assertIsNone(role(self.user, None))

    # ── direct grants ─────────────────────────────────────────────────────

    def test_direct_read_returns_read(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.assertEqual(role(self.user, self.project), "read")

    def test_direct_edit_returns_edit(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        self.assertEqual(role(self.user, self.project), "edit")

    # ── team grants ───────────────────────────────────────────────────────

    def test_team_read_returns_read(self):
        self.team.group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=self.team,
        )
        self.assertEqual(role(self.user, self.project), "read")

    def test_team_edit_returns_edit(self):
        self.team.group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team,
        )
        self.assertEqual(role(self.user, self.project), "edit")

    def test_team_grant_does_not_affect_non_member(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team,
        )
        self.assertIsNone(role(self.user, self.project))

    # ── strongest wins ────────────────────────────────────────────────────

    def test_direct_read_beats_no_team_grant(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.assertEqual(role(self.user, self.project), "read")

    def test_team_edit_wins_over_direct_read(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.team.group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team,
        )
        self.assertEqual(role(self.user, self.project), "edit")

    def test_direct_edit_wins_over_team_read(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        self.team.group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=self.team,
        )
        self.assertEqual(role(self.user, self.project), "edit")

    def test_multiple_team_grants_strongest_wins(self):
        self.team.group.user_set.add(self.user)
        self.team2.group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=self.team,
        )
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team2,
        )
        self.assertEqual(role(self.user, self.project), "edit")

    # ── inactive preserves grants but returns none ────────────────────────

    def test_inactive_with_grant_returns_none(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.inactive,
        )
        self.team.group.user_set.add(self.inactive)
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, team=self.team,
        )
        self.assertIsNone(role(self.inactive, self.project))

    def test_reactivation_restores_effective_role(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.inactive,
        )
        self.assertIsNone(role(self.inactive, self.project))
        self.inactive.is_active = True
        self.inactive.save()
        self.assertEqual(role(self.inactive, self.project), "read")

    # ── project_id as integer ─────────────────────────────────────────────

    def test_role_accepts_project_pk(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.assertEqual(role(self.user, self.project.pk), "read")


class TeamDeletionWithGrantTests(TestCase):
    """Team deletion blocked while Grants reference it."""

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        admin_membership = OrganizationMembership.objects.get(user=self.admin)
        admin_membership.role = OrganizationRole.ADMIN
        admin_membership.save()
        self.project = Project.objects.create(name="Alpha")
        Folder.objects.create(name="root", parent=None, project=self.project)
        self.group = Group.objects.create(name="My Team")
        self.team = Team.objects.create(
            group=self.group, organization=self.org,
        )

    def _create_team(self, name="Team"):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/access/teams/", {"name": name}, format="json",
        )
        return resp.data["id"]

    def test_team_with_grant_cannot_be_deleted(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=self.team,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/access/teams/{self.team.pk}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Team.objects.filter(pk=self.team.pk).exists())

    def test_team_without_grant_can_be_deleted(self):
        team_id = self._create_team("Disposable")
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
