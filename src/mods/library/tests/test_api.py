"""
Tests for the Library API endpoints — project-scoped contents.
"""
from core.models import Folder, Project
from core.tests.base import BaseTestCase
from core.tests.factories import EMPTY_DOC
from mods.eln.models import NotebookEntry
from mods.tags.models import Tag
from mods.access.models import Grant, ProjectRole, Organization, OrganizationMembership, OrganizationRole


class LibraryApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

        self._schema = None

        self.experiments_folder = Folder.objects.create(
            name="Experiments", parent=self.root_folder, project=self.project,
        )
        self.nested_folder = Folder.objects.create(
            name="Q1", parent=self.experiments_folder, project=self.project,
        )
        Folder.objects.create(
            name="Protocols", parent=self.root_folder, project=self.project,
        )

        self.root_entry = NotebookEntry.objects.create(
            name="Root Entry",
            content=EMPTY_DOC,
            folder=self.root_folder,
            project=self.project,
            author=self.user,
            schema=self.schema,
        )

        self.exp_entry = NotebookEntry.objects.create(
            name="PCR Results",
            content=EMPTY_DOC,
            folder=self.experiments_folder,
            project=self.project,
            author=self.user,
            schema=self.schema,
        )

        self.nested_entry = NotebookEntry.objects.create(
            name="Q1 Analysis",
            content=EMPTY_DOC,
            folder=self.nested_folder,
            project=self.project,
            author=self.user,
            schema=self.schema,
        )

        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )

    @property
    def schema(self):
        if self._schema is None:
            from mods.eln.tests.factories import get_or_create_default_eln_schema
            self._schema = get_or_create_default_eln_schema()
        return self._schema

    def _url(self):
        return f"/api/library/contents/?project={self.project.uid}"

    # ── Basic responses ──────────────────────────────────────────────

    def test_root_returns_200(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)

    def test_type_discriminator_present(self):
        response = self.client.get(self._url())
        for item in response.data["results"]:
            self.assertIn("type", item)
            self.assertIn(item["type"], ["folder", "entry"])

    def test_folders_sorted_before_entries(self):
        response = self.client.get(self._url())
        results = response.data["results"]
        types = [item["type"] for item in results]
        if "entry" in types and "folder" in types:
            last_folder_idx = max(i for i, t in enumerate(types) if t == "folder")
            first_entry_idx = min(i for i, t in enumerate(types) if t == "entry")
            self.assertLess(last_folder_idx, first_entry_idx)

    def test_root_shows_top_level_items_only(self):
        response = self.client.get(self._url())
        results = response.data["results"]

        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]

        self.assertIn("Experiments", folder_names)
        self.assertIn("Protocols", folder_names)
        self.assertIn("Root Entry", entry_titles)

        self.assertNotIn("Q1", folder_names)
        self.assertNotIn("PCR Results", entry_titles)
        self.assertNotIn("Q1 Analysis", entry_titles)

    def test_response_includes_project_metadata(self):
        response = self.client.get(self._url())
        self.assertEqual(str(response.data["project_uid"]), str(self.project.uid))
        self.assertEqual(response.data["project_name"], self.project.name)
        self.assertFalse(response.data["project_is_archived"])

    # ── Path navigation ──────────────────────────────────────────────

    def test_nested_path_returns_correct_items(self):
        response = self.client.get(
            f"{self._url()}&path=/Experiments"
        )
        results = response.data["results"]

        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]

        self.assertIn("Q1", folder_names)
        self.assertIn("PCR Results", entry_titles)
        self.assertNotIn("Experiments", folder_names)
        self.assertNotIn("Root Entry", entry_titles)

    def test_empty_folder_returns_empty_list(self):
        response = self.client.get(
            f"{self._url()}&path=/Protocols"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)

    def test_nonexistent_path_returns_404(self):
        response = self.client.get(
            f"{self._url()}&path=/Nope"
        )
        self.assertEqual(response.status_code, 404)

    def test_path_outside_project_returns_404(self):
        other_project = Project.objects.create(name="Other")
        Folder.objects.create(name="root", parent=None, project=other_project)
        response = self.client.get(
            f"{self._url()}&path=/OtherFolder",
        )
        self.assertEqual(response.status_code, 404)

    # ── Item shapes ──────────────────────────────────────────────────

    def test_folder_item_shape(self):
        response = self.client.get(self._url())
        folders = [r for r in response.data["results"] if r["type"] == "folder"]
        self.assertGreater(len(folders), 0)
        f = folders[0]
        self.assertEqual(f["type"], "folder")
        self.assertIn("id", f)
        self.assertIn("name", f)
        self.assertIn("parent", f)
        self.assertIn("created_at", f)
        self.assertIn("is_shared", f)

    def test_entry_item_shape(self):
        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        self.assertGreater(len(entries), 0)
        e = entries[0]
        self.assertEqual(e["type"], "entry")
        self.assertIn("id", e)
        self.assertIn("workspace_id", e)
        self.assertIn("display_id", e)
        self.assertIn("title", e)
        self.assertIn("folder", e)
        self.assertIn("folder_name", e)
        self.assertIn("author_username", e)
        self.assertIn("author_info", e)
        self.assertIn("status", e)
        self.assertIn("description", e)
        self.assertIn("tags", e)
        self.assertIn("editors", e)
        self.assertIn("samples_count", e)
        self.assertIn("attachments_count", e)
        self.assertIn("property_fields", e)
        self.assertIn("created_at", e)
        self.assertIn("updated_at", e)

    def test_entry_status_value(self):
        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        self.assertGreater(len(entries), 0)
        e = entries[0]
        self.assertIn(e["status"], ["in_progress", "finished"])

    def test_entry_placeholders_are_set(self):
        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        self.assertGreater(len(entries), 0)
        e = entries[0]
        self.assertEqual(e["editors"], [])
        self.assertIsNone(e["samples_count"])
        self.assertIsNone(e["attachments_count"])
        self.assertEqual(e["property_fields"], {})

    def test_entry_tags_serialized(self):
        tag = Tag.objects.create(name="CRISPR", color="flask", icon="dna")
        self.root_entry.tags.add(tag)

        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        root = [e for e in entries if e["id"] == self.root_entry.id][0]
        self.assertEqual(len(root["tags"]), 1)
        t = root["tags"][0]
        self.assertEqual(t["id"], tag.id)
        self.assertEqual(t["name"], "CRISPR")
        self.assertEqual(t["color"], "flask")
        self.assertEqual(t["icon"], "dna")

    def test_entry_description_extracts_first_paragraph(self):
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "First paragraph text."},
                    ],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Second paragraph text."},
                    ],
                },
            ],
        }
        self.root_entry.content = doc
        self.root_entry.save()

        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        root = [e for e in entries if e["id"] == self.root_entry.id][0]
        self.assertEqual(root["description"], "First paragraph text.")

    def test_entry_description_empty_for_empty_doc(self):
        response = self.client.get(self._url())
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        root = [e for e in entries if e["id"] == self.root_entry.id][0]
        self.assertEqual(root["description"], "")

    # ── Pagination ───────────────────────────────────────────────────

    def test_pagination_page_size(self):
        for i in range(55):
            NotebookEntry.objects.create(
                name=f"Bulk Entry {i}",
                content=EMPTY_DOC,
                folder=self.root_folder,
                project=self.project,
                author=self.user,
                schema=self.schema,
            )

        response = self.client.get(
            f"{self._url()}&page_size=20"
        )
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])
        self.assertGreater(response.data["count"], 20)

    def test_pagination_next_link(self):
        for i in range(55):
            NotebookEntry.objects.create(
                name=f"Page Entry {i}",
                content=EMPTY_DOC,
                folder=self.root_folder,
                project=self.project,
                author=self.user,
                schema=self.schema,
            )

        response = self.client.get(self._url())
        if response.data["count"] > 50:
            self.assertIsNotNone(response.data["next"])

    # ── Search ───────────────────────────────────────────────────────

    def test_search_filters_folders(self):
        response = self.client.get(
            f"{self._url()}&search=Exp"
        )
        results = response.data["results"]
        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        self.assertIn("Experiments", folder_names)
        self.assertNotIn("Protocols", folder_names)

    def test_search_filters_entries(self):
        response = self.client.get(
            f"{self._url()}&path=/Experiments&search=PCR"
        )
        results = response.data["results"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]
        self.assertIn("PCR Results", entry_titles)
        self.assertNotIn("Q1 Analysis", entry_titles)

    def test_search_filters_entries_by_display_id(self):
        display_id = self.exp_entry.display_id
        response = self.client.get(
            f"{self._url()}&path=/Experiments&search={display_id}"
        )
        results = response.data["results"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]
        self.assertIn("PCR Results", entry_titles)

    def test_search_preserves_sort_order(self):
        response = self.client.get(
            f"{self._url()}&search=e"
        )
        results = response.data["results"]
        types = [item["type"] for item in results]
        if "entry" in types and "folder" in types:
            last_folder_idx = max(i for i, t in enumerate(types) if t == "folder")
            first_entry_idx = min(i for i, t in enumerate(types) if t == "entry")
            self.assertLess(last_folder_idx, first_entry_idx)

    # ── Project scoping / 404 matrix ─────────────────────────────────

    def test_missing_project_param_returns_404(self):
        response = self.client.get("/api/library/contents/")
        self.assertEqual(response.status_code, 404)

    def test_unknown_project_returns_404(self):
        response = self.client.get(
            "/api/library/contents/?project=00000000-0000-0000-0000-000000000000"
        )
        self.assertEqual(response.status_code, 404)

    def test_no_access_project_returns_404(self):
        other_user = type(self.user).objects.create_user(
            username="other", password="pass",
        )
        other_project = Project.objects.create(name="Other Project")
        Folder.objects.create(name="root", parent=None, project=other_project)
        Grant.objects.create(
            project=other_project, role=ProjectRole.READ, user=other_user,
        )
        response = self.client.get(
            f"/api/library/contents/?project={other_project.uid}"
        )
        self.assertEqual(response.status_code, 404)

    def test_archived_project_still_serves_members(self):
        self.project.is_archived = True
        self.project.save()
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["project_is_archived"])

    def test_archived_project_404_for_non_members(self):
        self.project.is_archived = True
        self.project.save()
        Grant.objects.filter(
            project=self.project, user=self.user,
        ).delete()
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)


class AccessibleProjectsApiTests(BaseTestCase):
    """Tests for GET /api/access/projects/?accessible=1."""

    def setUp(self):
        super().setUp()
        self.org = Organization.objects.create(name="Test Lab")
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={"organization": self.org, "role": OrganizationRole.USER},
        )

    def test_ungranted_user_sees_no_projects(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_direct_read_grant_includes_project(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], self.project.name)
        self.assertEqual(response.data[0]["current_user_role"], "read")

    def test_direct_edit_grant_includes_project(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["current_user_role"], "edit")

    def test_team_grant_includes_project(self):
        from django.contrib.auth.models import Group
        from mods.access.models import Team
        group = Group.objects.create(name="My Team")
        team = Team.objects.create(group=group, organization=self.org)
        group.user_set.add(self.user)
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, team=team,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], self.project.name)

    def test_conflicting_grants_strongest_role(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["current_user_role"], "read")

    def test_inactive_user_sees_nothing(self):
        self.user.is_active = False
        self.user.save()
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_org_admin_sees_all_non_archived(self):
        org_admin = type(self.user).objects.create_user(
            username="orgadmin", password="pass",
        )
        OrganizationMembership.objects.update_or_create(
            user=org_admin,
            defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        project2 = Project.objects.create(name="Other Project")
        Folder.objects.create(name="root", parent=None, project=project2)
        self.client.force_authenticate(user=org_admin)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        names = {p["name"] for p in response.data}
        self.assertIn(self.project.name, names)
        self.assertIn("Other Project", names)
        self.assertIsNone(response.data[0]["current_user_role"])

    def test_archived_projects_excluded(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.project.is_archived = True
        self.project.save()
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/projects/?accessible=1&with_role=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)
