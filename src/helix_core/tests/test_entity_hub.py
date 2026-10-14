"""Platform integration contracts for the registered Entity Hub source."""

from rest_framework.test import APITestCase

from helix_core.core.models import Folder, Project, User
from helix_core.models import Schema, SchemaType
from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity


class EntityHubAPITests(APITestCase):
    """Exercise hub query wiring through a Platform-owned registered model."""

    @classmethod
    def setUpTestData(cls):
        from bundled.access.access.models import (
            Organization,
            OrganizationMembership,
            OrganizationRole,
        )
        from helix_core.tests.fixtures.external_mod.testing import register_external_mod_fixture

        register_external_mod_fixture()
        cls.user = User.objects.create_user(username="hub-user", password="pass")
        org = Organization.objects.create(name="Hub Organization")
        OrganizationMembership.objects.create(
            user=cls.user, organization=org, role=OrganizationRole.ADMIN
        )
        cls.schema_type = SchemaType.objects.create(
            display_name="Fixture Entity",
            workspace_id="fixture",
            model=("helix_core.tests.fixtures.external_mod.models."
                   "ConcreteTestEntity"),
            columns=[{"name": "sample_type", "type": "text"}],
        )
        cls.schema = Schema.objects.create(
            name="Default", prefix="FIX", schema_type=cls.schema_type,
            is_default=True,
            columns=[{"name": "sample_type", "type": "text"}],
        )
        cls.other_schema = Schema.objects.create(
            name="Alternate", prefix="ALT", schema_type=cls.schema_type,
            columns=[{"name": "sample_type", "type": "text"}],
        )
        cls.project = Project.objects.create(name="Hub Project")
        cls.folder = Folder.objects.create(
            name="Hub Folder", parent=None, project=cls.project
        )
        cls.entity = ConcreteTestEntity.objects.create(
            name="Fixture Alpha", author=cls.user, schema=cls.schema,
            source=cls.folder, properties={"sample_type": "A"},
        )
        cls.second_entity = ConcreteTestEntity.objects.create(
            name="Fixture Beta", author=cls.user, schema=cls.other_schema,
            source=cls.folder, properties={"sample_type": "B"},
        )
        cls.url = "/api/registry/entities/"

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_exposes_registered_rows_and_common_fields(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(
            {row["display_id"] for row in data["results"]},
            {self.entity.display_id, self.second_entity.display_id},
        )
        self.assertEqual((data["page"], data["size"]), (1, 50))
        columns = {column["key"]: column for column in data["available_columns"]}
        self.assertTrue({
            "display_id", "name", "schema_type_id", "project", "source",
            "status", "author", "created_at", "updated_at",
        }.issubset(columns))
        for column in columns.values():
            self.assertIsInstance(column["type"], str)
            self.assertIsInstance(column["filterable"], bool)
            self.assertIsNone(column["width"])
        self.assertEqual(columns["display_id"]["type"], "text")
        self.assertEqual(columns["status"]["type"], "dropdown")
        for row in data["results"]:
            self.assertEqual(row["workspace_id"], "fixture")
            self.assertEqual(row["schema_type_id"], "fixture.concretetestentity")
            self.assertTrue({
                "display_id", "name", "schema_type_id", "schema_type_display",
                "status", "author_username", "source", "source_type", "source_id",
            }.issubset(row))
            self.assertEqual(row["source"]["kind"], "folder")
            self.assertEqual(row["source_id"], self.folder.pk)

    def test_pagination_accepts_size_and_page_parameters(self):
        response = self.client.get(f"{self.url}?size=1&page=2")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["size"], 1)
        self.assertEqual(response.json()["page"], 2)
        self.assertEqual(len(response.json()["results"]), 1)

    def test_search_matches_names_and_display_ids_case_insensitively(self):
        for query in ("fixture alpha", self.entity.display_id.lower()):
            with self.subTest(query=query):
                response = self.client.get(f"{self.url}?search={query}")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["total"], 1)
                self.assertEqual(
                    response.json()["results"][0]["display_id"],
                    self.entity.display_id,
                )

    def test_schema_type_and_schema_filters_scope_registered_rows(self):
        response = self.client.get(f"{self.url}?schema_type=fixture.concretetestentity")
        self.assertEqual(response.json()["total"], 2)
        response = self.client.get(f"{self.url}?schema={self.schema.pk}")
        self.assertEqual(response.json()["total"], 1)
        self.assertEqual(
            response.json()["results"][0]["schema_id"], self.schema.pk
        )
        response = self.client.get(f"{self.url}?schema_type=fixture.unknown")
        self.assertEqual(response.json()["total"], 0)

    def test_status_filter_and_combined_search(self):
        ConcreteTestEntity.objects.create(
            name="Finished Fixture", author=self.user, schema=self.schema,
            source=self.folder, status="finished",
        )
        finished = self.client.get(f"{self.url}?status=finished").json()
        self.assertEqual(finished["total"], 1)
        self.assertEqual(finished["results"][0]["name"], "Finished Fixture")
        in_progress = self.client.get(f"{self.url}?status=in_progress").json()
        self.assertEqual(in_progress["total"], 2)
        combined = self.client.get(
            f"{self.url}?search=fixture&status=in_progress"
        ).json()
        self.assertEqual(combined["total"], 2)

    def test_property_filter_composes_with_schema_and_search(self):
        response = self.client.get(
            f"{self.url}?schema={self.schema.pk}&f=sample_type:A&search=alpha"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 1)
        row = response.json()["results"][0]
        self.assertEqual(row["display_id"], self.entity.display_id)
        self.assertEqual(row["_expanded"]["sample_type"], "A")
        wrong_schema = self.client.get(
            f"{self.url}?schema={self.other_schema.pk}&search=alpha"
        ).json()
        self.assertEqual(wrong_schema["total"], 0)

    def test_sorting_uses_requested_name_and_project_fields(self):
        response = self.client.get(f"{self.url}?sort=name")
        names = [row["name"] for row in response.json()["results"]]
        self.assertEqual(names, sorted(names))

        project_a = Project.objects.create(name="Alpha Project")
        project_b = Project.objects.create(name="Beta Project")
        folder_a = Folder.objects.create(name="A Folder", parent=None, project=project_a)
        folder_b = Folder.objects.create(name="B Folder", parent=None, project=project_b)
        ConcreteTestEntity.objects.create(
            name="Project B", author=self.user, schema=self.schema, source=folder_b,
        )
        ConcreteTestEntity.objects.create(
            name="Project A", author=self.user, schema=self.schema, source=folder_a,
        )
        data = self.client.get(f"{self.url}?sort=project__name").json()
        project_names = [row["project_name"] for row in data["results"] if row["project_name"]]
        self.assertEqual(project_names, sorted(project_names))

    def test_schema_columns_and_expanded_properties_are_returned(self):
        response = self.client.get(f"{self.url}?schema={self.schema.pk}")
        row = response.json()["results"][0]
        self.assertEqual(row["_expanded"]["sample_type"], "A")
        schema_columns = {
            column["key"] for column in response.json()["available_columns"]
            if column["source"] == "schema"
        }
        self.assertEqual(schema_columns, {"sample_type"})

        partial_schema = Schema.objects.create(
            name="Partial", prefix="PART", schema_type=self.schema_type,
            columns=[
                {"name": "known_field", "type": "text"},
                {"name": "unknown_field", "type": "text"},
            ],
        )
        ConcreteTestEntity.objects.create(
            name="Partial Fixture", author=self.user, schema=partial_schema,
            source=self.folder, properties={"known_field": "present"},
        )
        row = self.client.get(f"{self.url}?schema={partial_schema.pk}").json()["results"][0]
        self.assertEqual(row["_expanded"]["known_field"], "present")
        self.assertNotIn("unknown_field", row["_expanded"])
        unexpanded = self.client.get(self.url).json()["results"]
        self.assertTrue(all(row["_expanded"] is None for row in unexpanded))

    def test_empty_registered_source_population_returns_no_results(self):
        ConcreteTestEntity.objects.all().delete()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 0)
        self.assertEqual(response.json()["results"], [])
