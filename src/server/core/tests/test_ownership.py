"""Tests for Project ownership invariants on Folder, Entry, and Entity.

Covers creation consistency, same-Project moves, mismatched ownership,
protected roots, and cross-Project move rejection paths.
"""
from django.db import transaction
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, Project, User
from helix_core.models import SchemaType, Schema
from mods.access.models import Grant, ProjectRole
from mods.eln.models import NotebookEntry
from mods.lims.models import Entity


def _create_project(name="Test Project"):
    return Project.objects.create(name=name)


def _create_root(project):
    return project.create_root_folder()


def _create_eln_schema():
    schema_type, _ = SchemaType.objects.get_or_create(
        model="mods.eln.models.NotebookEntry",
        defaults={"display_name": "ELN Entry", "workspace_id": "eln"},
    )
    schema, _ = Schema.objects.get_or_create(
        schema_type=schema_type,
        is_default=True,
        defaults={"name": "Default", "prefix": "E"},
    )
    return schema


def _create_lims_schema():
    schema_type, _ = SchemaType.objects.get_or_create(
        model="mods.lims.models.Entity",
        defaults={"display_name": "Entity", "workspace_id": "lims"},
    )
    schema, _ = Schema.objects.get_or_create(
        schema_type=schema_type,
        is_default=True,
        defaults={"name": "Default", "prefix": "ENT"},
    )
    return schema


class FolderOwnershipTests(TestCase):
    """Each Folder belongs to exactly one Project."""

    def setUp(self):
        self.project_a = _create_project("Project A")
        self.project_b = _create_project("Project B")
        self.root_a = _create_root(self.project_a)
        self.root_b = _create_root(self.project_b)

    def test_folder_must_have_project(self):
        from django.core.exceptions import ValidationError
        from django.db import IntegrityError
        try:
            Folder.objects.create(name="No Project", parent=None, project=None)
            self.fail("Expected IntegrityError")
        except IntegrityError:
            pass

    def test_project_root_is_parent_null_folder(self):
        self.assertIsNone(self.root_a.parent_id)
        self.assertEqual(self.root_a.project_id, self.project_a.id)

    def test_only_one_root_per_project(self):
        from django.core.exceptions import ValidationError
        duplicate = Folder(name="dup", parent=None, project=self.project_a)
        with self.assertRaises((Exception, ValidationError)):
            duplicate.full_clean()
            duplicate.save()

    def test_child_folder_inherits_project_from_parent(self):
        child = Folder.objects.create(
            name="Child", parent=self.root_a, project=self.project_a,
        )
        self.assertEqual(child.project_id, self.project_a.id)
        self.assertEqual(child.parent_id, self.root_a.id)

    def test_api_root_folder_creation_uses_hidden_root_as_parent(self):
        user = User.objects.create_user(username="creator", password="pass")
        Grant.objects.create(
            project=self.project_a, user=user, role=ProjectRole.EDIT,
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            "/api/core/folders/",
            {"name": "Child", "project": self.project_a.id, "parent": None},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["parent"], self.root_a.id)
        self.assertEqual(response.data["project"], self.project_a.id)
        self.assertEqual(
            Folder.objects.filter(project=self.project_a, parent__isnull=True).count(),
            1,
        )


class HiddenRootProtectionTests(TestCase):
    """Hidden Project roots cannot be renamed, moved, or deleted."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="test", password="pass")
        self.project = _create_project("Test")
        self.root = _create_root(self.project)
        Grant.objects.create(
            project=self.project, user=self.user, role=ProjectRole.EDIT,
        )
        self.client.force_authenticate(user=self.user)

    def test_hidden_root_cannot_be_renamed(self):
        response = self.client.patch(
            f"/api/core/folders/{self.root.id}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_hidden_root_cannot_be_moved(self):
        child = Folder.objects.create(
            name="Child", parent=self.root, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{self.root.id}/",
            {"parent": child.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_hidden_root_cannot_be_deleted(self):
        response = self.client.delete(f"/api/core/folders/{self.root.id}/")
        self.assertEqual(response.status_code, 403)

    def test_non_hidden_folder_can_be_renamed(self):
        child = Folder.objects.create(
            name="Child", parent=self.root, project=self.project,
        )
        response = self.client.patch(
            f"/api/core/folders/{child.id}/",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Renamed")

    def test_non_hidden_folder_can_be_deleted(self):
        child = Folder.objects.create(
            name="Child", parent=self.root, project=self.project,
        )
        response = self.client.delete(f"/api/core/folders/{child.id}/")
        self.assertEqual(response.status_code, 204)


class EntryOwnershipTests(TestCase):
    """Entry project is derived from folder and validated on write."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="test", password="pass")
        self.project_a = _create_project("Project A")
        self.project_b = _create_project("Project B")
        self.root_a = _create_root(self.project_a)
        self.root_b = _create_root(self.project_b)
        self.folder_a = Folder.objects.create(
            name="Folder A", parent=self.root_a, project=self.project_a,
        )
        self.folder_b = Folder.objects.create(
            name="Folder B", parent=self.root_b, project=self.project_b,
        )
        self.schema = _create_eln_schema()
        Grant.objects.create(
            project=self.project_a, user=self.user, role=ProjectRole.EDIT,
        )
        self.client.force_authenticate(user=self.user)

    def test_create_entry_derives_project_from_folder(self):
        entry = NotebookEntry.objects.create(
            name="Test Entry",
            content={"type": "doc", "content": []},
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.folder_a.project,
        )
        self.assertEqual(entry.project_id, self.project_a.id)
        self.assertEqual(entry.folder_id, self.folder_a.id)

    def test_create_entry_api_derives_project(self):
        response = self.client.post(
            "/api/eln/entries/",
            {"name": "API Entry", "content": {"type": "doc", "content": []},
             "folder": self.folder_a.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["project"], self.project_a.id)

    def test_move_within_same_project_works(self):
        entry = NotebookEntry.objects.create(
            name="Movable",
            content={"type": "doc", "content": []},
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        other_folder = Folder.objects.create(
            name="Other", parent=self.root_a, project=self.project_a,
        )
        response = self.client.patch(
            f"/api/eln/entries/{entry.display_id}/",
            {"folder": other_folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["folder"], other_folder.id)

    def test_cross_project_move_rejected(self):
        entry = NotebookEntry.objects.create(
            name="Stuck",
            content={"type": "doc", "content": []},
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        response = self.client.patch(
            f"/api/eln/entries/{entry.display_id}/",
            {"folder": self.folder_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("folder", response.data)

    def test_cross_project_move_rejected_for_orm(self):
        entry = NotebookEntry.objects.create(
            name="OrmStuck",
            content={"type": "doc", "content": []},
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        entry.folder = self.folder_b
        entry.save()
        entry.refresh_from_db()
        self.assertEqual(entry.folder_id, self.folder_b.id)
        self.assertEqual(entry.project_id, self.project_a.id)


class EntityOwnershipTests(TestCase):
    """Entity project is derived from folder and validated on write."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="test", password="pass")
        self.project_a = _create_project("Project A")
        self.project_b = _create_project("Project B")
        self.root_a = _create_root(self.project_a)
        self.root_b = _create_root(self.project_b)
        self.folder_a = Folder.objects.create(
            name="Folder A", parent=self.root_a, project=self.project_a,
        )
        self.folder_b = Folder.objects.create(
            name="Folder B", parent=self.root_b, project=self.project_b,
        )
        self.schema = _create_lims_schema()
        Grant.objects.create(
            project=self.project_a, user=self.user, role=ProjectRole.EDIT,
        )
        self.client.force_authenticate(user=self.user)

    def test_create_entity_derives_project_from_folder(self):
        entity = Entity.objects.create(
            name="Test Entity",
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.folder_a.project,
        )
        self.assertEqual(entity.project_id, self.project_a.id)
        self.assertEqual(entity.folder_id, self.folder_a.id)

    def test_create_entity_api_derives_project(self):
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "API Entity", "folder": self.folder_a.id,
             "schema": self.schema.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["project"], self.project_a.id)

    def test_move_within_same_project_works(self):
        entity = Entity.objects.create(
            name="Movable",
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        other_folder = Folder.objects.create(
            name="Other", parent=self.root_a, project=self.project_a,
        )
        response = self.client.patch(
            f"/api/lims/entities/{entity.display_id}/",
            {"folder": other_folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["folder"], other_folder.id)

    def test_cross_project_move_rejected(self):
        entity = Entity.objects.create(
            name="Stuck",
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        response = self.client.patch(
            f"/api/lims/entities/{entity.display_id}/",
            {"folder": self.folder_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("folder", response.data)

    def test_cross_project_move_rejected_for_orm(self):
        entity = Entity.objects.create(
            name="OrmStuck",
            folder=self.folder_a,
            author=self.user,
            schema=self.schema,
            project=self.project_a,
        )
        entity.folder = self.folder_b
        entity.save()
        entity.refresh_from_db()
        self.assertEqual(entity.folder_id, self.folder_b.id)
        self.assertEqual(entity.project_id, self.project_a.id)


class FolderMoveRejectionTests(TestCase):
    """Folders cannot be moved across Projects."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="test", password="pass")
        self.project_a = _create_project("Project A")
        self.project_b = _create_project("Project B")
        self.root_a = _create_root(self.project_a)
        self.root_b = _create_root(self.project_b)
        self.folder_a = Folder.objects.create(
            name="Folder A", parent=self.root_a, project=self.project_a,
        )
        Grant.objects.create(
            project=self.project_a, user=self.user, role=ProjectRole.EDIT,
        )
        Grant.objects.create(
            project=self.project_b, user=self.user, role=ProjectRole.EDIT,
        )
        self.client.force_authenticate(user=self.user)

    def test_cross_project_folder_move_rejected(self):
        response = self.client.patch(
            f"/api/core/folders/{self.folder_a.id}/",
            {"parent": self.root_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)
        self.folder_a.refresh_from_db()
        self.assertEqual(self.folder_a.parent_id, self.root_a.id)
        self.assertEqual(self.folder_a.project_id, self.project_a.id)

    def test_same_project_folder_move_works(self):
        new_parent = Folder.objects.create(
            name="NewParent", parent=self.root_a, project=self.project_a,
        )
        response = self.client.patch(
            f"/api/core/folders/{self.folder_a.id}/",
            {"parent": new_parent.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["parent"], new_parent.id)


class ProjectDeletionCascadesTests(TestCase):
    """Deleting a Project cascades to its Folders, Entries, and Entities."""

    def setUp(self):
        self.user = User.objects.create_user(username="test", password="pass")
        self.project = _create_project("Test")
        self.root = _create_root(self.project)
        self.folder = Folder.objects.create(
            name="Stuff", parent=self.root, project=self.project,
        )
        self.eln_schema = _create_eln_schema()
        self.lims_schema = _create_lims_schema()

    def test_delete_project_cascades_to_entries(self):
        NotebookEntry.objects.create(
            name="Entry",
            content={"type": "doc", "content": []},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            project=self.project,
        )
        self.assertEqual(NotebookEntry.objects.count(), 1)
        self.project.delete()
        self.assertEqual(NotebookEntry.objects.count(), 0)

    def test_delete_project_cascades_to_entities(self):
        Entity.objects.create(
            name="Entity",
            folder=self.folder,
            author=self.user,
            schema=self.lims_schema,
            project=self.project,
        )
        self.assertEqual(Entity.objects.count(), 1)
        self.project.delete()
        self.assertEqual(Entity.objects.count(), 0)

    def test_delete_project_cascades_to_folders(self):
        self.assertEqual(Folder.objects.count(), 2)
        self.project.delete()
        self.assertEqual(Folder.objects.count(), 0)
