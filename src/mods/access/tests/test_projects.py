"""Tests for Project API endpoints — CRUD, archive, and permissions."""

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, Project
from mods.access.tests.factories import make_org, make_user


class ProjectApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")

    def setUp(self):
        self.client = APIClient()

    def _create_project(self, name="Test Project"):
        self.client.force_authenticate(user=self.admin)
        return self.client.post(
            "/api/access/projects/", {"name": name}, format="json",
        )

    # ── creation ──────────────────────────────────────────────────────────

    def test_admin_can_create_project(self):
        response = self._create_project()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Test Project")
        self.assertIn("uid", response.data)
        self.assertFalse(response.data["is_archived"])

    def test_creating_project_creates_no_folders(self):
        response = self._create_project()
        self.assertEqual(response.status_code, 201)
        project_id = response.data["id"]
        self.assertFalse(Folder.objects.filter(project_id=project_id).exists())

    def test_creating_project_is_atomic(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/projects/",
            {"name": ""},  # empty name should fail validation
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Project.objects.count(), 0)

    def test_regular_user_cannot_create_project(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/access/projects/", {"name": "Hacked"}, format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Project.objects.count(), 0)

    def test_anonymous_cannot_create_project(self):
        response = self.client.post(
            "/api/access/projects/", {"name": "Anon"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_project_can_have_multiple_top_level_folders(self):
        response = self._create_project()
        project = Project.objects.get(pk=response.data["id"])
        Folder.objects.create(name="first", parent=None, project=project)
        Folder.objects.create(name="second", parent=None, project=project)
        self.assertEqual(
            Folder.objects.filter(project=project, parent__isnull=True).count(),
            2,
        )

    # ── listing ───────────────────────────────────────────────────────────

    def test_any_user_can_list_projects(self):
        self._create_project("Alpha")
        self._create_project("Beta")
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        names = {p["name"] for p in response.data}
        self.assertIn("Alpha", names)
        self.assertIn("Beta", names)

    def test_listing_excludes_archived_by_default(self):
        r1 = self._create_project("Active")
        r2 = self._create_project("Archived")
        self.client.force_authenticate(user=self.admin)
        self.client.patch(
            f"/api/access/projects/{r2.data['id']}/",
            {"is_archived": True}, format="json",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/")
        self.assertEqual(response.status_code, 200)
        names = {p["name"] for p in response.data}
        self.assertIn("Active", names)
        self.assertNotIn("Archived", names)

    def test_listing_includes_archived_when_requested(self):
        self._create_project("Active")
        r2 = self._create_project("Archived")
        self.client.force_authenticate(user=self.admin)
        self.client.patch(
            f"/api/access/projects/{r2.data['id']}/",
            {"is_archived": True}, format="json",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?include_archived=1")
        self.assertEqual(response.status_code, 200)
        names = {p["name"] for p in response.data}
        self.assertIn("Active", names)
        self.assertIn("Archived", names)

    def test_listing_requires_auth(self):
        response = self.client.get("/api/access/projects/")
        self.assertEqual(response.status_code, 403)

    # ── detail ────────────────────────────────────────────────────────────

    def test_any_user_can_get_project_detail(self):
        response = self._create_project("Detail")
        project_id = response.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Detail")

    def test_get_project_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/999/")
        self.assertEqual(response.status_code, 404)

    # ── rename ────────────────────────────────────────────────────────────

    def test_admin_can_rename_project(self):
        response = self._create_project("Original")
        project_id = response.data["id"]
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"name": "Renamed"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Renamed")

    def test_rename_preserves_uid(self):
        response = self._create_project("Original")
        project_id = response.data["id"]
        original_uid = response.data["uid"]
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"name": "Renamed"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["uid"], original_uid)

    def test_regular_user_cannot_rename_project(self):
        response = self._create_project("Original")
        project_id = response.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"name": "Hacked"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── icon and color ────────────────────────────────────────────────────

    def test_admin_can_set_icon_and_color(self):
        response = self._create_project("Colored")
        project_id = response.data["id"]
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"icon_key": "flask", "color_key": "crimson"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["icon_key"], "flask")
        self.assertEqual(response.data["color_key"], "crimson")

    def test_regular_user_cannot_recolor_project(self):
        response = self._create_project("Colored")
        project_id = response.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"icon_key": "hacked"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── archive and restore ───────────────────────────────────────────────

    def test_admin_can_archive_project(self):
        response = self._create_project("To Archive")
        project_id = response.data["id"]
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_archived"])

    def test_admin_can_restore_project(self):
        response = self._create_project("To Restore")
        project_id = response.data["id"]
        self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True}, format="json",
        )
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": False}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_archived"])

    def test_regular_user_cannot_archive_project(self):
        response = self._create_project("Safe")
        project_id = response.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_archiving_does_not_create_a_folder(self):
        response = self._create_project("Archive Me")
        project_id = response.data["id"]
        self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True}, format="json",
        )
        self.assertFalse(Folder.objects.filter(project_id=project_id).exists())

    def test_archived_project_still_accessible_via_direct_get(self):
        response = self._create_project("Still Here")
        project_id = response.data["id"]
        self.client.patch(
            f"/api/access/projects/{project_id}/",
            {"is_archived": True}, format="json",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Still Here")

    # ── delete ────────────────────────────────────────────────────────────

    def test_admin_can_delete_project(self):
        response = self._create_project("To Delete")
        project_id = response.data["id"]
        response = self.client.delete(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Project.objects.filter(pk=project_id).count(), 0)

    def test_regular_user_cannot_delete_project(self):
        response = self._create_project("Safe")
        project_id = response.data["id"]
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f"/api/access/projects/{project_id}/")
        self.assertEqual(response.status_code, 403)

    def test_delete_project_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete("/api/access/projects/999/")
        self.assertEqual(response.status_code, 404)

    # ── bootstrap / fresh boot ────────────────────────────────────────────

    def test_fresh_boot_creates_no_default_project(self):
        self.assertEqual(Project.objects.filter(name="Untitled Project").count(), 0)


class ProjectModelTests(TestCase):
    def test_project_uid_is_auto_generated(self):
        project = Project.objects.create(name="Test")
        self.assertIsNotNone(project.uid)
        self.assertIsInstance(str(project.uid), str)

    def test_project_uids_are_unique(self):
        Project.objects.create(name="A")
        Project.objects.create(name="B")
        uids = list(Project.objects.values_list("uid", flat=True))
        self.assertEqual(len(uids), len(set(uids)))

    def test_project_uid_is_immutable(self):
        project = Project.objects.create(name="Test")
        original_uid = project.uid
        project.name = "Renamed"
        project.save()
        project.refresh_from_db()
        self.assertEqual(project.uid, original_uid)

    def test_project_name_is_renameable(self):
        project = Project.objects.create(name="Old")
        project.name = "New"
        project.save()
        project.refresh_from_db()
        self.assertEqual(project.name, "New")

    def test_project_str_returns_name(self):
        project = Project.objects.create(name="Acme Project")
        self.assertEqual(str(project), "Acme Project")

    def test_project_archive_flag_defaults_false(self):
        project = Project.objects.create(name="Test")
        project.refresh_from_db()
        self.assertFalse(project.is_archived)

    def test_project_icon_and_color_default_empty(self):
        project = Project.objects.create(name="Test")
        self.assertEqual(project.icon_key, "")
        self.assertEqual(project.color_key, "")
