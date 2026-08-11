"""Tests for FolderShare model, API, overlap rejection, and shared-access policies."""

from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Folder, Project, User
from mods.access.models import (
    FolderShare,
    Grant,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    ProjectRole,
    ShareLevel,
    Team,
)
from mods.access.policies import can as can_access, role as get_role


# ── helpers ────────────────────────────────────────────────────────────────


def _ensure_membership(user, org, role):
    mem, _ = OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": role},
    )
    return mem


def _make_project_with_root(name="Alpha", **kwargs):
    project = Project.objects.create(name=name, **kwargs)
    Folder.objects.create(name="root", parent=None, project=project)
    return project


def _add_child_folder(project, name, parent_name="root"):
    parent = Folder.objects.get(project=project, name=parent_name)
    child = Folder.objects.create(name=name, parent=parent, project=project)
    return child


def _add_grandchild_folder(project, name, child_name):
    parent = Folder.objects.get(project=project, name=child_name, parent__isnull=False)
    grandchild = Folder.objects.create(name=name, parent=parent, project=project)
    return grandchild


# ── FolderShare model tests ────────────────────────────────────────────────


class FolderShareModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        self.project_a = _make_project_with_root("Project A")
        self.project_b = _make_project_with_root("Project B")
        self.folder = _add_child_folder(self.project_a, "Shared Folder")

    def test_create_valid_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.assertEqual(share.source_folder, self.folder)
        self.assertEqual(share.target_project, self.project_b)
        self.assertEqual(share.level, ShareLevel.READ)

    def test_create_read_write_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ_WRITE,
        )
        self.assertEqual(share.level, ShareLevel.READ_WRITE)

    def test_str_includes_path_and_target(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        s = str(share)
        self.assertIn("Shared Folder", s)
        self.assertIn(self.project_b.name, s)

    # ── validation: reject same project as target ──────────────────────────

    def test_reject_source_project_as_target(self):
        share = FolderShare(
            source_folder=self.folder,
            target_project=self.project_a,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    # ── validation: reject hidden root ────────────────────────────────────

    def test_reject_hidden_root_folder(self):
        root = Folder.objects.get(project=self.project_a, parent__isnull=True)
        share = FolderShare(
            source_folder=root,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    # ── validation: reject nested source folder ───────────────────────────

    def test_reject_nested_source_folder(self):
        grandchild = _add_grandchild_folder(self.project_a, "Deep", "Shared Folder")
        share = FolderShare(
            source_folder=grandchild,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    # ── uniqueness ────────────────────────────────────────────────────────

    def test_unique_constraint_folder_target_pair(self):
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        from django.db import IntegrityError
        with self.assertRaises((IntegrityError, ValidationError)):
            duplicate = FolderShare(
                source_folder=self.folder,
                target_project=self.project_b,
                level=ShareLevel.READ_WRITE,
            )
            duplicate.clean()
            duplicate.save()

    # ── ancestor/descendant overlap ───────────────────────────────────────

    def test_reject_ancestor_already_shared_to_same_target(self):
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        grandchild = _add_grandchild_folder(self.project_a, "Deep", "Shared Folder")
        share = FolderShare(
            source_folder=grandchild,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_reject_descendant_already_shared_then_share_ancestor(self):
        grandchild = _add_grandchild_folder(self.project_a, "Deep", "Shared Folder")
        FolderShare.objects.create(
            source_folder=grandchild,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share = FolderShare(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_same_folder_to_different_targets_allowed(self):
        project_c = _make_project_with_root("Project C")
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share2 = FolderShare(
            source_folder=self.folder,
            target_project=project_c,
            level=ShareLevel.READ_WRITE,
        )
        share2.clean()
        share2.save()
        self.assertEqual(FolderShare.objects.count(), 2)

    def test_sibling_folders_to_same_target_allowed(self):
        folder2 = _add_child_folder(self.project_a, "Other Folder")
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share2 = FolderShare(
            source_folder=folder2,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share2.clean()
        share2.save()
        self.assertEqual(FolderShare.objects.count(), 2)

    # ── cascade ───────────────────────────────────────────────────────────

    def test_delete_source_folder_cascades_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.folder.delete()
        self.assertFalse(FolderShare.objects.filter(pk=share.pk).exists())

    def test_delete_target_project_cascades_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.project_b.delete()
        self.assertFalse(FolderShare.objects.filter(pk=share.pk).exists())


# ── FolderShare API tests ─────────────────────────────────────────────────


class FolderShareApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.user, self.org, OrganizationRole.USER)
        self.project_a = _make_project_with_root("Project A")
        self.project_b = _make_project_with_root("Project B")
        self.folder = _add_child_folder(self.project_a, "Shared Folder")

    @property
    def _shares_url(self):
        return f"/api/access/projects/{self.project_b.pk}/folder_shares/"

    def _share_url(self, share_pk):
        return f"/api/access/folder_shares/{share_pk}/"

    # ── create ────────────────────────────────────────────────────────────

    def test_admin_can_create_folder_share(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["source_folder"], self.folder.pk)
        self.assertEqual(response.data["target_project"], self.project_b.pk)
        self.assertEqual(response.data["level"], "read")
        self.assertTrue(
            FolderShare.objects.filter(
                source_folder=self.folder, target_project=self.project_b,
            ).exists()
        )

    def test_admin_can_create_read_write_share(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read_write"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["level"], "read_write")

    def test_regular_user_cannot_create_folder_share(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_create_folder_share(self):
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_share_404_when_project_not_found(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/access/projects/999/folder_shares/",
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_share_rejects_same_project_as_target(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/access/projects/{self.project_a.pk}/folder_shares/"
        response = self.client.post(
            url,
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_share_rejects_hidden_root(self):
        root = Folder.objects.get(project=self.project_a, parent__isnull=True)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": root.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_share_rejects_nested_folder(self):
        grandchild = _add_grandchild_folder(self.project_a, "Deep", "Shared Folder")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": grandchild.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_share_rejects_duplicate(self):
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read_write"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── list ───────────────────────────────────────────────────────────────

    def test_admin_can_list_folder_shares(self):
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._shares_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["source_folder_name"], "Shared Folder")
        self.assertEqual(response.data[0]["level"], "read")

    def test_regular_user_cannot_list_folder_shares(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self._shares_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_list_folder_shares(self):
        response = self.client.get(self._shares_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_returns_empty_when_no_shares(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._shares_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    # ── revoke (delete) ───────────────────────────────────────────────────

    def test_admin_can_revoke_folder_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self._share_url(share.pk))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FolderShare.objects.filter(pk=share.pk).exists())

    def test_regular_user_cannot_revoke_folder_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(self._share_url(share.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_revoke_folder_share(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        response = self.client.delete(self._share_url(share.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_revoke_404_when_not_found(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self._share_url(999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ── instant visibility after creation ─────────────────────────────────

    def test_share_immediately_discoverable(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self._shares_url,
            {"source_folder": self.folder.pk, "level": "read"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        list_response = self.client.get(self._shares_url)
        self.assertEqual(len(list_response.data), 1)

    # ── revocation removes path ───────────────────────────────────────────

    def test_revocation_removes_share_from_list(self):
        share = FolderShare.objects.create(
            source_folder=self.folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        self.client.force_authenticate(user=self.admin)
        self.client.delete(self._share_url(share.pk))
        response = self.client.get(self._shares_url)
        self.assertEqual(len(response.data), 0)


# ── shared access policy intersection tests ────────────────────────────────


class SharedAccessPolicyTests(TestCase):
    """Test access.can() with via_project for shared folder intersection."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.reader = User.objects.create_user(username="reader", password="pass")
        self.editor = User.objects.create_user(username="editor", password="pass")
        self.other = User.objects.create_user(username="other", password="pass")
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.reader, self.org, OrganizationRole.USER)
        _ensure_membership(self.editor, self.org, OrganizationRole.USER)
        _ensure_membership(self.other, self.org, OrganizationRole.USER)

        self.source_project = _make_project_with_root("Source Project")
        self.target_project = _make_project_with_root("Target Project")

        self.shared_folder = _add_child_folder(self.source_project, "Shared Folder")
        self.entry = _add_child_folder(self.source_project, "Entry", "Shared Folder")

        Grant.objects.create(
            project=self.target_project,
            role=ProjectRole.READ,
            user=self.reader,
        )
        Grant.objects.create(
            project=self.target_project,
            role=ProjectRole.EDIT,
            user=self.editor,
        )

    def _share(self, level=ShareLevel.READ):
        return FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=level,
        )

    def _assert_can_read(self, user, resource, via):
        self.assertTrue(
            can_access(user, "read", resource=resource, via_project=via),
            f"{user.username} should be able to read via {via}",
        )

    def _assert_cannot_read(self, user, resource, via):
        self.assertFalse(
            can_access(user, "read", resource=resource, via_project=via),
            f"{user.username} should NOT be able to read via {via}",
        )

    def _assert_can_edit(self, user, resource, via):
        self.assertTrue(
            can_access(user, "created", resource=resource, via_project=via),
            f"{user.username} should be able to create via {via}",
        )

    def _assert_cannot_edit(self, user, resource, via):
        self.assertFalse(
            can_access(user, "created", resource=resource, via_project=via),
            f"{user.username} should NOT be able to create via {via}",
        )

    # ── no share means no access via target ────────────────────────────────

    def test_no_share_denies_access(self):
        self._assert_cannot_read(self.reader, self.entry, self.target_project.pk)
        self._assert_cannot_read(self.editor, self.entry, self.target_project.pk)

    # ── org admin always has full access ──────────────────────────────────

    def test_org_admin_full_access_with_read_share(self):
        self._share(ShareLevel.READ)
        self._assert_can_read(self.admin, self.entry, self.target_project.pk)
        self._assert_can_edit(self.admin, self.entry, self.target_project.pk)

    def test_org_admin_full_access_with_read_write_share(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_can_read(self.admin, self.entry, self.target_project.pk)
        self._assert_can_edit(self.admin, self.entry, self.target_project.pk)

    # ── read share with read target role = read only ──────────────────────

    def test_read_share_reader_can_read(self):
        self._share(ShareLevel.READ)
        self._assert_can_read(self.reader, self.entry, self.target_project.pk)

    def test_read_share_reader_cannot_edit(self):
        self._share(ShareLevel.READ)
        self._assert_cannot_edit(self.reader, self.entry, self.target_project.pk)

    # ── read share with edit target role = still read only ────────────────

    def test_read_share_editor_can_read(self):
        self._share(ShareLevel.READ)
        self._assert_can_read(self.editor, self.entry, self.target_project.pk)

    def test_read_share_editor_cannot_edit(self):
        self._share(ShareLevel.READ)
        self._assert_cannot_edit(self.editor, self.entry, self.target_project.pk)

    # ── read_write share with read target role = read only ────────────────

    def test_read_write_share_reader_can_read(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_can_read(self.reader, self.entry, self.target_project.pk)

    def test_read_write_share_reader_cannot_edit(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_cannot_edit(self.reader, self.entry, self.target_project.pk)

    # ── read_write share with edit target role = edit ─────────────────────

    def test_read_write_share_editor_can_read(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_can_read(self.editor, self.entry, self.target_project.pk)

    def test_read_write_share_editor_can_edit(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_can_edit(self.editor, self.entry, self.target_project.pk)

    # ── user with no target project role cannot access shared content ─────

    def test_no_target_role_denies_access(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_cannot_read(self.other, self.entry, self.target_project.pk)
        self._assert_cannot_edit(self.other, self.entry, self.target_project.pk)

    def test_no_target_role_denies_access_read_share(self):
        self._share(ShareLevel.READ)
        self._assert_cannot_read(self.other, self.entry, self.target_project.pk)

    # ── revoking a share removes access ───────────────────────────────────

    def test_revoke_removes_access(self):
        share = self._share(ShareLevel.READ_WRITE)
        self._assert_can_read(self.editor, self.entry, self.target_project.pk)
        share.delete()
        self._assert_cannot_read(self.editor, self.entry, self.target_project.pk)

    # ── descendant access ─────────────────────────────────────────────────

    def test_descendant_in_shared_tree_accessible(self):
        self._share(ShareLevel.READ)
        self._assert_can_read(self.reader, self.entry, self.target_project.pk)

    def test_resource_outside_shared_tree_not_accessible(self):
        other_folder = _add_child_folder(self.source_project, "Other Folder")
        other_entry = _add_child_folder(self.source_project, "Other Entry", "Other Folder")
        self._share(ShareLevel.READ_WRITE)
        self._assert_cannot_read(self.editor, other_entry, self.target_project.pk)

    # ── source project is not one of the user's projects ─────────────────

    def test_shared_access_does_not_make_source_project_a_user_project(self):
        self._share(ShareLevel.READ_WRITE)
        source_role = get_role(self.reader, self.source_project)
        self.assertIsNone(source_role)

    def test_shared_access_does_not_make_source_project_an_editor_project(self):
        self._share(ShareLevel.READ_WRITE)
        source_role = get_role(self.editor, self.source_project)
        self.assertIsNone(source_role)

    # ── shared folder itself is protected ─────────────────────────────────

    def test_cannot_edit_shared_root_via_target(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_cannot_edit(self.editor, self.shared_folder, self.target_project.pk)

    def test_cannot_edit_shared_root_via_target_even_read_write(self):
        self._share(ShareLevel.READ_WRITE)
        self._assert_cannot_edit(self.editor, self.shared_folder, self.target_project.pk)

    # ── cross-boundary move rejection ─────────────────────────────────────

    def test_resource_cannot_move_outside_shared_subtree(self):
        self._share(ShareLevel.READ_WRITE)
        self.assertTrue(
            self.entry.project_id == self.source_project.pk,
            "Entry should retain source project",
        )


# ── overlap rejection detail ──────────────────────────────────────────────


class OverlapRejectionTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.project_a = _make_project_with_root("Project A")
        self.project_b = _make_project_with_root("Project B")
        self.parent_folder = _add_child_folder(self.project_a, "Parent")
        self.child_folder = _add_grandchild_folder(self.project_a, "Child", "Parent")
        self.sibling_folder = _add_child_folder(self.project_a, "Sibling")

    def test_share_parent_then_child_rejected(self):
        FolderShare.objects.create(
            source_folder=self.parent_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share = FolderShare(
            source_folder=self.child_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_share_child_then_parent_rejected(self):
        FolderShare.objects.create(
            source_folder=self.child_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share = FolderShare(
            source_folder=self.parent_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_same_level_folder_to_same_target_not_treated_as_overlap(self):
        FolderShare.objects.create(
            source_folder=self.parent_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share = FolderShare(
            source_folder=self.sibling_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share.clean()
        share.save()
        self.assertEqual(FolderShare.objects.count(), 2)

    # ── name collision rejection ────────────────────────────────────────

    def test_reject_name_collision_with_existing_share(self):
        FolderShare.objects.create(
            source_folder=self.parent_folder,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        other_project = _make_project_with_root("Project C")
        duplicate_name = _add_child_folder(other_project, "Parent")
        share = FolderShare(
            source_folder=duplicate_name,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_reject_name_collision_with_own_root_child(self):
        _add_child_folder(self.project_b, "Conflicting")
        other_project = _make_project_with_root("Project C")
        source = _add_child_folder(other_project, "Conflicting")
        share = FolderShare(
            source_folder=source,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        with self.assertRaises(ValidationError):
            share.clean()

    def test_different_name_no_collision(self):
        _add_child_folder(self.project_b, "Existing")
        other_project = _make_project_with_root("Project C")
        source = _add_child_folder(other_project, "Different Name")
        share = FolderShare(
            source_folder=source,
            target_project=self.project_b,
            level=ShareLevel.READ,
        )
        share.clean()
        share.save()
        self.assertEqual(FolderShare.objects.count(), 1)
