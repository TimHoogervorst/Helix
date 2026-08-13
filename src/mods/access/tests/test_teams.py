"""Tests for Team model, API, and authorization."""

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from mods.access.models import Organization, Team
from mods.access.tests.factories import make_org, make_user


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
        team = Team(organization=self.org)
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
        team = Team(organization=self.org)
        self.assertEqual(team.name, "")


class TeamApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user(
            "alice", cls.org, "user",
            first_name="Alice", last_name="Alpha",
        )
        cls.user2 = make_user(
            "bob", cls.org, "user",
            first_name="Bob", last_name="Beta",
        )
        cls.inactive = make_user("charlie", cls.org, "user", is_active=False)

    def setUp(self):
        self.client = APIClient()

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
    """Actor-matrix tests for Team endpoints, consolidated via subTest."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")
        cls.inactive = make_user("inactive", cls.org, "user", is_active=False)

    def setUp(self):
        self.client = APIClient()

    def _create_team(self, name="Team"):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/access/teams/",
            {"name": name},
            format="json",
        )
        return resp.data["id"]

    def _authenticate(self, actor):
        self.client.force_authenticate(
            user=getattr(self, actor) if actor else None,
        )

    def test_list_teams_matrix(self):
        cases = [(None, 403), ("user", 200), ("inactive", 200)]
        for actor, expected in cases:
            with self.subTest(actor=actor):
                self._authenticate(actor)
                response = self.client.get("/api/access/teams/")
                self.assertEqual(response.status_code, expected)

    def test_create_team_matrix(self):
        cases = [(None, 403), ("user", 403), ("admin", 201)]
        for actor, expected in cases:
            with self.subTest(actor=actor):
                self._authenticate(actor)
                response = self.client.post(
                    "/api/access/teams/", {"name": "T"}, format="json",
                )
                self.assertEqual(response.status_code, expected)

    def test_patch_team_matrix(self):
        cases = [("user", 403), ("admin", 200)]
        for actor, expected in cases:
            with self.subTest(actor=actor):
                team_id = self._create_team(f"Patch-{actor}")
                self._authenticate(actor)
                response = self.client.patch(
                    f"/api/access/teams/{team_id}/",
                    {"name": "X"},
                    format="json",
                )
                self.assertEqual(response.status_code, expected)

    def test_delete_team_matrix(self):
        cases = [("user", 403), ("admin", 204)]
        for actor, expected in cases:
            with self.subTest(actor=actor):
                team_id = self._create_team(f"Delete-{actor}")
                self._authenticate(actor)
                response = self.client.delete(f"/api/access/teams/{team_id}/")
                self.assertEqual(response.status_code, expected)

    def test_add_member_matrix(self):
        cases = [("user", 403), ("admin", 200)]
        for actor, expected in cases:
            with self.subTest(actor=actor):
                team_id = self._create_team(f"Member-{actor}")
                self._authenticate(actor)
                response = self.client.post(
                    f"/api/access/teams/{team_id}/add_member/",
                    {"user_id": self.user.pk},
                    format="json",
                )
                self.assertEqual(response.status_code, expected)
