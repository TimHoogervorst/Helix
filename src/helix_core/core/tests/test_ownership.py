"""Platform ownership invariants for Projects and Folders.

Content-mod entity ownership and endpoint cases remain with their owning Mods.
"""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from bundled.access.access.models import Grant, ProjectRole
from helix_core.core.models import Folder, Project, User


class FolderOwnershipTests(TestCase):
    def setUp(self):
        self.project_a = Project.objects.create(name="Project A")
        self.project_b = Project.objects.create(name="Project B")
        self.root_a = Folder.objects.create(
            name="Top Level", parent=None, project=self.project_a
        )
        self.root_b = Folder.objects.create(
            name="Top Level", parent=None, project=self.project_b
        )

    def test_folder_requires_project(self):
        with self.assertRaises(ValidationError):
            Folder.objects.create(name="Orphan", parent=None, project=None)

    def test_multiple_root_folders_are_allowed_within_a_project(self):
        second = Folder.objects.create(
            name="Another Root", parent=None, project=self.project_a
        )
        self.assertIsNone(second.parent_id)
        self.assertEqual(second.project_id, self.project_a.pk)

    def test_sibling_folder_names_are_unique(self):
        Folder.objects.create(
            name="Child", parent=self.root_a, project=self.project_a
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Folder.objects.create(
                    name="Child", parent=self.root_a, project=self.project_a
                )

    def test_root_folder_names_are_unique_per_project(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Folder.objects.create(
                    name=self.root_a.name, parent=None, project=self.project_a
                )

    def test_child_folder_inherits_parent_project(self):
        child = Folder.objects.create(
            name="Child", parent=self.root_a, project=self.project_a
        )
        self.assertEqual(child.parent_id, self.root_a.pk)
        self.assertEqual(child.project_id, self.project_a.pk)

    def test_api_can_create_root_folder_with_edit_grant(self):
        user = User.objects.create_user(username="creator", password="pass")
        Grant.objects.create(
            project=self.project_a, user=user, role=ProjectRole.EDIT
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            "/api/core/folders/",
            {"name": "API Root", "project": self.project_a.pk, "parent": None},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        folder = Folder.objects.get(pk=response.data["id"])
        self.assertEqual(folder.project_id, self.project_a.pk)
        self.assertIsNone(folder.parent_id)


class FolderMoveOwnershipTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="folder_editor", password="pass")
        self.project_a = Project.objects.create(name="Project A")
        self.project_b = Project.objects.create(name="Project B")
        self.root_a = Folder.objects.create(
            name="Root A", parent=None, project=self.project_a
        )
        self.root_b = Folder.objects.create(
            name="Root B", parent=None, project=self.project_b
        )
        self.folder = Folder.objects.create(
            name="Moving", parent=self.root_a, project=self.project_a
        )
        Grant.objects.create(
            project=self.project_a, user=self.user, role=ProjectRole.EDIT
        )
        Grant.objects.create(
            project=self.project_b, user=self.user, role=ProjectRole.EDIT
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_folder_can_move_within_project(self):
        new_parent = Folder.objects.create(
            name="New Parent", parent=self.root_a, project=self.project_a
        )

        response = self.client.patch(
            f"/api/core/folders/{self.folder.pk}/",
            {"parent": new_parent.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.parent_id, new_parent.pk)
        self.assertEqual(self.folder.project_id, self.project_a.pk)

    def test_cross_project_move_is_rejected_without_changing_ownership(self):
        response = self.client.patch(
            f"/api/core/folders/{self.folder.pk}/",
            {"parent": self.root_b.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.parent_id, self.root_a.pk)
        self.assertEqual(self.folder.project_id, self.project_a.pk)

    def test_project_deletion_cascades_to_its_folders(self):
        project_id = self.project_a.pk
        self.project_a.delete()

        self.assertFalse(Folder.objects.filter(project_id=project_id).exists())
        self.assertTrue(Folder.objects.filter(pk=self.root_b.pk).exists())
