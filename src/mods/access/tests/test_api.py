"""Tests for Organization and People API endpoints."""

from django.test import TestCase
from rest_framework.test import APIClient

from mods.access.models import Organization
from mods.access.tests.factories import make_org, make_user


class OrganizationApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")

    def setUp(self):
        self.client = APIClient()

    def test_get_organization_returns_identity(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/organization/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Test Lab")
        self.assertIn("short_description", response.data)
        self.assertIn("address", response.data)
        self.assertIn("icon_key", response.data)
        self.assertIn("color_key", response.data)

    def test_get_organization_requires_auth(self):
        response = self.client.get("/api/access/organization/")
        self.assertEqual(response.status_code, 403)

    def test_patch_organization_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            "/api/access/organization/",
            {"name": "Updated Lab", "short_description": "New desc"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Updated Lab")
        self.assertEqual(response.data["short_description"], "New desc")

    def test_patch_organization_as_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            "/api/access/organization/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_organization_404_when_none_exists(self):
        Organization.objects.all().delete()
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/access/organization/")
        self.assertEqual(response.status_code, 404)


class PeopleApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user1 = make_user(
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

    def test_people_lists_active_users_only(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/access/people/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        usernames = {p["username"] for p in response.data}
        self.assertIn("admin", usernames)
        self.assertIn("alice", usernames)
        self.assertIn("bob", usernames)
        self.assertNotIn("charlie", usernames)

    def test_people_identifies_admins(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/access/people/")
        admin_entry = next(p for p in response.data if p["username"] == "admin")
        self.assertEqual(admin_entry["role"], "admin")
        user_entry = next(p for p in response.data if p["username"] == "alice")
        self.assertEqual(user_entry["role"], "user")

    def test_people_excludes_private_email(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/access/people/")
        for person in response.data:
            self.assertNotIn("email", person)

    def test_people_requires_auth(self):
        response = self.client.get("/api/access/people/")
        self.assertEqual(response.status_code, 403)

    def test_people_includes_user_fields(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/access/people/")
        alice = next(p for p in response.data if p["username"] == "alice")
        self.assertEqual(alice["first_name"], "Alice")
        self.assertEqual(alice["last_name"], "Alpha")
        self.assertIn("color", alice)
