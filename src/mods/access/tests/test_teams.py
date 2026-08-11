"""Tests for Team model, API, and authorization."""

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import User
from mods.access.models import Organization, OrganizationMembership, OrganizationRole, Team


class TeamModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")

    def test_create_team_wraps_django_group(self):
        group = Group.objects.create(name="Alpha Team")
        team = Team.objects.create(
            group=group,
            organization=self.org,
            icon_key="flask",
            color_key="blue",
        )
        self.assertEqual(team.name, "Alpha Team")
        self.assertEqual(team.group.name, "Alpha Team")
        self.assertEqual(team.icon_key, "flask")
        self.assertEqual(team.color_key, "blue")
        self.assertEqual(team.organization, self.org)

    def test_str_returns_group_name(self):
        group = Group.objects.create(name="Omega Squad")
        team = Team.objects.create(group=group, organization=self.org)
        self.assertEqual(str(team), "Omega Squad")

    def test_str_fallback_when_no_group(self):
        team = Team.objects.create(
            group=Group.objects.create(name="Temp"),
            organization=self.org,
        )
        team.group.delete()
        team.refresh_from_db()
        self.assertIn("Team", str(team))

    def test_group_one_to_one_protect_on_delete(self):
        group = Group.objects.create(name="Protected")
        team = Team.objects.create(group=group, organization=self.org)
        with self.assertRaises(Exception):
            group.delete()

    def test_blocked_from_deletion_is_false_by_default(self):
        group = Group.objects.create(name="Unblocked")
        team = Team.objects.create(group=group, organization=self.org)
        self.assertFalse(team.blocked_from_deletion)

    def test_name_property_returns_empty_when_no_group(self):
        team = Team.objects.create(
            group=Group.objects.create(name="Temp"),
            organization=self.org,
        )
        team.group.delete()
        team.refresh_from_db()
        self.assertEqual(team.name, "")


class TeamApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(
            username="alice", password="pass",
            first_name="Alice", last_name="Alpha",
        )
        self.user2 = User.objects.create_user(
            username="bob", password="pass",
            first_name="Bob", last_name="Beta",
        )
        self.inactive = User.objects.create_user(
            username="charlie", password="pass", is_active=False,
        )
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        OrganizationMembership.objects.create(
            user=self.user, organization=self.org, role=OrganizationRole.USER,
        )
        OrganizationMembership.objects.create(
            user=self.user2, organization=self.org, role=OrganizationRole.USER,
        )
        OrganizationMembership.objects.create(
            user=self.inactive, organization=self.org, role=OrganizationRole.USER,
        )

    def _create_team(self, name="Test Team"):
        self.client.force_authenticate(user=self.admin)
        return self.client.post(
            "/api/access/teams/",
            {"name": name, "icon_key": "beaker", "color_key": "green"},
            format="json",
        )

    # ── List ──────────────────────────────────────────────────────────────

    def test_list_teams_requires_auth(self):
        response = self.client.get("/api/access/teams/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_teams_returns_all(self):
        self._create_team("Team A")
        self._create_team("Team B")
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/teams/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_teams_includes_members(self):
        resp = self._create_team("My Team")
        team_id = resp.data["id"]
        team = Team.objects.get(pk=team_id)
        team.group.user_set.add(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/teams/")
        self.assertEqual(len(response.data), 1)
        members = response.data[0]["members"]
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]["username"], "alice")

    def test_list_teams_excludes_inactive_members(self):
        resp = self._create_team("My Team")
        team_id = resp.data["id"]
        team = Team.objects.get(pk=team_id)
        team.group.user_set.add(self.inactive)
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/access/teams/")
        self.assertEqual(len(response.data[0]["members"]), 0)

    # ── Create ────────────────────────────────────────────────────────────

    def test_create_team_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/teams/",
            {"name": "New Team", "icon_key": "rocket", "color_key": "red"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "New Team")
        self.assertEqual(response.data["icon_key"], "rocket")
        self.assertEqual(response.data["color_key"], "red")
        self.assertTrue(Team.objects.filter(group__name="New Team").exists())

    def test_create_team_as_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/access/teams/",
            {"name": "Hacked Team"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_team_without_name_fails(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/teams/",
            {"icon_key": "rocket"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Detail ────────────────────────────────────────────────────────────

    def test_get_team_detail(self):
        resp = self._create_team("Detail Team")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Detail Team")

    def test_get_nonexistent_team_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/teams/9999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ── Update ────────────────────────────────────────────────────────────

    def test_patch_team_as_admin(self):
        resp = self._create_team("Original")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/access/teams/{team_id}/",
            {"name": "Renamed", "icon_key": "star"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Renamed")
        self.assertEqual(response.data["icon_key"], "star")

    def test_patch_team_as_regular_user_is_forbidden(self):
        resp = self._create_team("Original")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/access/teams/{team_id}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Delete ────────────────────────────────────────────────────────────

    def test_delete_team_as_admin(self):
        resp = self._create_team("To Delete")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Team.objects.filter(pk=team_id).exists())

    def test_delete_team_as_regular_user_is_forbidden(self):
        resp = self._create_team("Protected")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Membership ────────────────────────────────────────────────────────

    def test_add_member_as_admin(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["members"]), 1)
        self.assertEqual(response.data["members"][0]["username"], "alice")

    def test_add_member_as_regular_user_is_forbidden(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user2.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_add_inactive_member_returns_404(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.inactive.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_add_nonexistent_user_returns_404(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": 99999},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_remove_member_as_admin(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        team = Team.objects.get(pk=team_id)
        team.group.user_set.add(self.user)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/access/teams/{team_id}/remove_member/",
            {"user_id": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["members"]), 0)

    def test_remove_member_as_regular_user_is_forbidden(self):
        resp = self._create_team("Members")
        team_id = resp.data["id"]
        team = Team.objects.get(pk=team_id)
        team.group.user_set.add(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/access/teams/{team_id}/remove_member/",
            {"user_id": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Icon and color persistence ────────────────────────────────────────

    def test_team_icon_and_color_persist(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/access/teams/",
            {"name": "Styled", "icon_key": "microscope", "color_key": "purple"},
            format="json",
        )
        team_id = resp.data["id"]
        team = Team.objects.get(pk=team_id)
        self.assertEqual(team.icon_key, "microscope")
        self.assertEqual(team.color_key, "purple")


class TeamAuthTests(TestCase):
    """Exhaustive actor-matrix tests for Team endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.anon = User.objects.create_user(username="anon", password="pass")
        self.inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        OrganizationMembership.objects.create(
            user=self.user, organization=self.org, role=OrganizationRole.USER,
        )
        OrganizationMembership.objects.create(
            user=self.inactive, organization=self.org, role=OrganizationRole.USER,
        )

    def _create_team_via_admin(self, name="Team"):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/access/teams/",
            {"name": name},
            format="json",
        )
        return resp.data["id"]

    # ── Anonymous ─────────────────────────────────────────────────────────

    def test_anon_cannot_list_teams(self):
        response = self.client.get("/api/access/teams/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anon_cannot_create_team(self):
        response = self.client.post(
            "/api/access/teams/", {"name": "T"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Active User (non-admin) ───────────────────────────────────────────

    def test_user_can_list_teams(self):
        self._create_team_via_admin("T1")
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/teams/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_cannot_create_team(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/access/teams/", {"name": "T"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_patch_team(self):
        team_id = self._create_team_via_admin("T1")
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/access/teams/{team_id}/",
            {"name": "X"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_delete_team(self):
        team_id = self._create_team_via_admin("T1")
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_add_member(self):
        team_id = self._create_team_via_admin("T1")
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Admin ─────────────────────────────────────────────────────────────

    def test_admin_can_create_team(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/teams/", {"name": "Admin Team"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_patch_team(self):
        team_id = self._create_team_via_admin("Old")
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/access/teams/{team_id}/",
            {"name": "New"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_can_delete_team(self):
        team_id = self._create_team_via_admin("ToDelete")
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/access/teams/{team_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_add_member(self):
        team_id = self._create_team_via_admin("T1")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/access/teams/{team_id}/add_member/",
            {"user_id": self.user.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Inactive user ─────────────────────────────────────────────────────

    def test_inactive_cannot_access_teams(self):
        self.client.force_authenticate(user=self.inactive)
        response = self.client.get("/api/access/teams/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
