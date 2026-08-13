"""
Access enforcement tests for LIMS entity mutations (issue #476).

Exercises the actor matrix — anonymous, no-grant, Read, Edit, Team-derived
Edit, Organization Admin, sharee Editor under a Read + Write share, and
inactive users — across entity create/update/delete, batch resolution,
and batch registration.  Moves are clamped to the shared subtree and
cross-Project moves stay rejected.
"""
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from core.models import Folder, Project, User
from core.tests.base import BaseTestCase
from helix_core.models import Schema, SchemaType
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
from mods.lims.models import Entity

BATCH_REGISTER_URL = "/api/lims/entities/batch-register/"


class _LimsAccessMixin:
    """Shared schema + actor setup for LIMS access tests."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.org = Organization.objects.create(name="LIMS Lab")
        self.schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

        self.editor = User.objects.create_user(username="ent_ed", password="pass")
        self.reader = User.objects.create_user(username="ent_rd", password="pass")
        self.no_grant = User.objects.create_user(username="ent_ng", password="pass")
        self.org_admin = User.objects.create_user(username="ent_ad", password="pass")
        self.sharee = User.objects.create_user(username="ent_sh", password="pass")
        self.inactive = User.objects.create_user(
            username="ent_inact", password="pass", is_active=False,
        )

        OrganizationMembership.objects.update_or_create(
            user=self.org_admin,
            defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        for user in (self.editor, self.reader, self.no_grant, self.sharee, self.inactive):
            OrganizationMembership.objects.update_or_create(
                user=user,
                defaults={"organization": self.org, "role": OrganizationRole.USER},
            )

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.source_project = Project.objects.create(name="Source Project")
        self.source_root = Folder.objects.create(
            name="root", parent=None, project=self.source_project,
        )
        self.shared_folder = Folder.objects.create(
            name="Shared", parent=self.source_root, project=self.source_project,
        )
        self.shared_child = Folder.objects.create(
            name="Deep", parent=self.shared_folder, project=self.source_project,
        )
        self.outside_folder = Folder.objects.create(
            name="Outside", parent=self.source_root, project=self.source_project,
        )

        self.target_project = Project.objects.create(name="Target Project")
        Folder.objects.create(name="root", parent=None, project=self.target_project)
        Grant.objects.create(project=self.target_project, user=self.sharee, role=ProjectRole.EDIT)
        FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=ShareLevel.READ_WRITE,
        )
        Grant.objects.create(project=self.source_project, user=self.editor, role=ProjectRole.EDIT)

    def _make_entity(self, folder=None, author=None):
        return Entity.objects.create(
            name="Sample",
            schema=self.schema,
            folder=folder or self.folder,
            author=author or self.editor,
            properties={},
        )

    def _make_team_editor(self, username, project):
        team_user = User.objects.create_user(username=username, password="pass")
        OrganizationMembership.objects.update_or_create(
            user=team_user,
            defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        group = Group.objects.create(name=f"team_{username}")
        team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(project=project, team=team, role=ProjectRole.EDIT)
        return team_user


# ── Entity create ─────────────────────────────────────────────────────────────


class EntityCreateAccessTests(_LimsAccessMixin, BaseTestCase):
    """Entity creation requires Edit on the destination folder's Project."""

    def setUp(self):
        super().setUp()
        self.url = "/api/lims/entities/"

    def _create(self, user, folder=None):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(
            self.url,
            {"name": "New Sample", "schema": self.schema.id, "folder": (folder or self.folder).id},
            format="json",
        )

    def test_editor_can_create(self):
        self.assertEqual(self._create(self.editor).status_code, 201)

    def test_org_admin_can_create(self):
        self.assertEqual(self._create(self.org_admin).status_code, 201)

    def test_team_derived_edit_can_create(self):
        team_user = self._make_team_editor("create_team", self.project)
        self.assertEqual(self._create(team_user).status_code, 201)

    def test_read_user_cannot_create(self):
        response = self._create(self.reader)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Entity.objects.count(), 0)

    def test_no_grant_user_cannot_create(self):
        self.assertEqual(self._create(self.no_grant).status_code, 403)

    def test_unauthenticated_cannot_create(self):
        client = APIClient()
        response = client.post(
            self.url,
            {"name": "Anon", "schema": self.schema.id, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_inactive_user_cannot_create(self):
        self.assertEqual(self._create(self.inactive).status_code, 403)

    def test_read_write_sharee_can_create_inside_subtree(self):
        self.assertEqual(self._create(self.sharee, self.shared_child).status_code, 201)

    def test_read_write_sharee_cannot_create_outside_subtree(self):
        response = self._create(self.sharee, self.outside_folder)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Entity.objects.count(), 0)


# ── Entity update ─────────────────────────────────────────────────────────────


class EntityUpdateAccessTests(_LimsAccessMixin, BaseTestCase):
    """Entity updates require Edit; folder moves clamp to the shared subtree."""

    def setUp(self):
        super().setUp()
        self.entity = self._make_entity(folder=self.shared_child, author=self.sharee)
        self.url = f"/api/lims/entities/{self.entity.display_id}/"

    def _patch(self, user, data):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.patch(self.url, data, format="json")

    def test_editor_can_update(self):
        self.assertEqual(self._patch(self.editor, {"name": "Renamed"}).status_code, 200)

    def test_org_admin_can_update(self):
        self.assertEqual(self._patch(self.org_admin, {"name": "By Admin"}).status_code, 200)

    def test_team_derived_edit_can_update(self):
        team_user = self._make_team_editor("update_team", self.source_project)
        self.assertEqual(self._patch(team_user, {"name": "By Team"}).status_code, 200)

    def test_read_user_cannot_update(self):
        response = self._patch(self.reader, {"name": "Hacked"})
        self.assertEqual(response.status_code, 403)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.name, "Sample")

    def test_no_grant_user_cannot_update(self):
        self.assertEqual(self._patch(self.no_grant, {"name": "Hacked"}).status_code, 403)

    def test_unauthenticated_cannot_update(self):
        client = APIClient()
        self.assertEqual(
            client.patch(self.url, {"name": "Anon"}, format="json").status_code, 403,
        )

    def test_read_write_sharee_can_update_inside_subtree(self):
        self.assertEqual(self._patch(self.sharee, {"name": "By Sharee"}).status_code, 200)

    def test_read_write_sharee_can_move_within_subtree(self):
        inner_folder = Folder.objects.create(
            name="Inner", parent=self.shared_child, project=self.source_project,
        )
        response = self._patch(self.sharee, {"folder": inner_folder.id})
        self.assertEqual(response.status_code, 200)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.folder_id, inner_folder.id)

    def test_read_write_sharee_cannot_move_outside_subtree(self):
        response = self._patch(self.sharee, {"folder": self.outside_folder.id})
        self.assertEqual(response.status_code, 400)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.folder_id, self.shared_child.id)

    def test_cross_project_move_rejected(self):
        other_project = Project.objects.create(name="Elsewhere")
        other_root = Folder.objects.create(name="root", parent=None, project=other_project)
        other_folder = Folder.objects.create(name="Other", parent=other_root, project=other_project)
        Grant.objects.create(project=other_project, user=self.editor, role=ProjectRole.EDIT)
        response = self._patch(self.editor, {"folder": other_folder.id})
        self.assertEqual(response.status_code, 400)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.folder_id, self.shared_child.id)


# ── Entity delete ─────────────────────────────────────────────────────────────


class EntityDeleteAccessTests(_LimsAccessMixin, BaseTestCase):
    """Entity deletion requires Edit."""

    def setUp(self):
        super().setUp()
        self.entity = self._make_entity(folder=self.folder)
        self.url = f"/api/lims/entities/{self.entity.display_id}/"

    def _delete(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.delete(self.url)

    def test_editor_can_delete(self):
        self.assertEqual(self._delete(self.editor).status_code, 204)
        self.assertEqual(Entity.objects.count(), 0)

    def test_org_admin_can_delete(self):
        self.assertEqual(self._delete(self.org_admin).status_code, 204)

    def test_team_derived_edit_can_delete(self):
        team_user = self._make_team_editor("delete_team", self.project)
        self.assertEqual(self._delete(team_user).status_code, 204)

    def test_read_user_cannot_delete(self):
        response = self._delete(self.reader)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Entity.objects.filter(id=self.entity.id).exists())

    def test_no_grant_user_cannot_delete(self):
        self.assertEqual(self._delete(self.no_grant).status_code, 403)

    def test_unauthenticated_cannot_delete(self):
        client = APIClient()
        self.assertEqual(client.delete(self.url).status_code, 403)

    def test_read_write_sharee_can_delete_inside_subtree(self):
        entity = self._make_entity(folder=self.shared_child, author=self.sharee)
        client = APIClient()
        client.force_authenticate(user=self.sharee)
        self.assertEqual(
            client.delete(f"/api/lims/entities/{entity.display_id}/").status_code, 204,
        )

    def test_read_write_sharee_cannot_delete_outside_subtree(self):
        client = APIClient()
        client.force_authenticate(user=self.sharee)
        self.assertEqual(
            client.delete(f"/api/lims/entities/{self.entity.display_id}/").status_code, 403,
        )


# ── Batch resolution ──────────────────────────────────────────────────────────


class EntityBatchAccessTests(_LimsAccessMixin, BaseTestCase):
    """Batch resolution requires Edit on every resolved entity."""

    def setUp(self):
        super().setUp()
        self.entity = self._make_entity(folder=self.shared_child, author=self.sharee)
        self.url = "/api/lims/entities/batch/"

    def _batch(self, user, ids=None):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(
            self.url, {"ids": ids or [self.entity.display_id]}, format="json",
        )

    def test_editor_can_resolve(self):
        response = self._batch(self.editor)
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data[self.entity.display_id])

    def test_org_admin_can_resolve(self):
        self.assertEqual(self._batch(self.org_admin).status_code, 200)

    def test_read_write_sharee_can_resolve_inside_subtree(self):
        self.assertEqual(self._batch(self.sharee).status_code, 200)

    def test_read_user_cannot_resolve(self):
        self.assertEqual(self._batch(self.reader).status_code, 403)

    def test_no_grant_user_cannot_resolve(self):
        self.assertEqual(self._batch(self.no_grant).status_code, 403)

    def test_unauthenticated_cannot_resolve(self):
        client = APIClient()
        response = client.post(
            self.url, {"ids": [self.entity.display_id]}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_editor_resolving_uneditable_entity_rejected(self):
        response = self._batch(self.sharee, ids=[self.entity.display_id, "NONEXIST1"])
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["NONEXIST1"])


# ── Batch registration ────────────────────────────────────────────────────────


class BatchRegisterAccessTests(_LimsAccessMixin, BaseTestCase):
    """Batch registration enforces the same Edit rule as single mutations."""

    def setUp(self):
        super().setUp()
        self.entity = self._make_entity(folder=self.shared_child, author=self.sharee)

    def _register(self, user, rows):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": rows},
            format="json",
        )

    def test_editor_can_create_row(self):
        response = self._register(self.editor, [
            {"entity_id": None, "name": "Batch A", "values": {}, "folder_id": self.folder.id},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_editor_can_update_row(self):
        response = self._register(self.editor, [
            {"entity_id": self.entity.id, "name": "Updated", "values": {}},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.name, "Updated")

    def test_org_admin_can_register(self):
        response = self._register(self.org_admin, [
            {"entity_id": None, "name": "Batch B", "values": {}, "folder_id": self.folder.id},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_team_derived_edit_can_register(self):
        team_user = self._make_team_editor("register_team", self.project)
        response = self._register(team_user, [
            {"entity_id": None, "name": "Batch C", "values": {}, "folder_id": self.folder.id},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_read_user_create_row_rejected_403(self):
        response = self._register(self.reader, [
            {"entity_id": None, "name": "Sneaky", "values": {}, "folder_id": self.folder.id},
        ])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Entity.objects.count(), 1)

    def test_read_user_update_row_rejected_403(self):
        response = self._register(self.reader, [
            {"entity_id": self.entity.id, "name": "Sneaky", "values": {}},
        ])
        self.assertEqual(response.status_code, 403)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.name, "Sample")

    def test_no_grant_user_rejected_403(self):
        response = self._register(self.no_grant, [
            {"entity_id": None, "name": "Sneaky", "values": {}, "folder_id": self.folder.id},
        ])
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_rejected(self):
        client = APIClient()
        response = client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "Anon", "values": {}, "folder_id": self.folder.id},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_sharee_can_register_inside_subtree(self):
        response = self._register(self.sharee, [
            {"entity_id": None, "name": "Shared Batch", "values": {}, "folder_id": self.shared_child.id},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_sharee_cannot_register_outside_subtree(self):
        response = self._register(self.sharee, [
            {"entity_id": None, "name": "Outside Batch", "values": {}, "folder_id": self.outside_folder.id},
        ])
        self.assertEqual(response.status_code, 403)

    def test_request_with_any_uneditable_row_rejected(self):
        response = self._register(self.sharee, [
            {"entity_id": None, "name": "Good Row", "values": {}, "folder_id": self.shared_child.id},
            {"entity_id": None, "name": "Bad Row", "values": {}, "folder_id": self.outside_folder.id},
        ])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Entity.objects.count(), 1)

    def test_missing_target_row_is_data_error_not_403(self):
        response = self._register(self.editor, [
            {"entity_id": 999999, "name": "Ghost", "values": {}},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "entity_id")
