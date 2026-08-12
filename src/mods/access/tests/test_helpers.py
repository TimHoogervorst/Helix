"""Tests for the shared access helpers: effective_role and accessible_project_ids."""

from django.contrib.auth.models import Group
from django.test import TestCase

from core.models import Folder, Project, User
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
from mods.access.policies import accessible_project_ids, effective_role


def _ensure_membership(user, org, role):
    mem, _ = OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": role},
    )
    return mem


def _make_project_with_root(name, **kwargs):
    project = Project.objects.create(name=name, **kwargs)
    Folder.objects.create(name="root", parent=None, project=project)
    return project


def _add_child_folder(project, name, parent_name="root"):
    parent = Folder.objects.get(project=project, name=parent_name)
    return Folder.objects.create(name=name, parent=parent, project=project)


def _add_grandchild_folder(project, name, child_name):
    parent = Folder.objects.get(project=project, name=child_name, parent__isnull=False)
    return Folder.objects.create(name=name, parent=parent, project=project)


class EffectiveRoleTests(TestCase):
    """Test effective_role() across the full actor matrix."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.reader = User.objects.create_user(username="reader", password="pass")
        self.editor = User.objects.create_user(username="editor", password="pass")
        self.team_user = User.objects.create_user(username="team_user", password="pass")
        self.superuser = User.objects.create_superuser(
            username="superuser", password="pass",
        )
        self.inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.reader, self.org, OrganizationRole.USER)
        _ensure_membership(self.editor, self.org, OrganizationRole.USER)
        _ensure_membership(self.team_user, self.org, OrganizationRole.USER)
        _ensure_membership(self.inactive, self.org, OrganizationRole.USER)
        OrganizationMembership.objects.filter(user=self.superuser).delete()

        self.project = _make_project_with_root("Source Project")
        self.folder = _add_child_folder(self.project, "Shared Folder")
        self.descendant = _add_grandchild_folder(self.project, "Deep", "Shared Folder")
        self.outside = _add_child_folder(self.project, "Outside Folder")

    def test_anonymous_returns_none(self):
        self.assertIsNone(effective_role(None, self.folder))
        anon = User(username="anon")
        self.assertIsNone(effective_role(anon, self.folder))

    def test_inactive_user_returns_none(self):
        self.assertIsNone(effective_role(self.inactive, self.folder))

    def test_active_user_without_grants_returns_none(self):
        self.assertIsNone(effective_role(self.reader, self.folder))

    def test_direct_read_returns_read(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.reader,
        )
        self.assertEqual(effective_role(self.reader, self.folder), "read")

    def test_direct_edit_returns_edit(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.editor,
        )
        self.assertEqual(effective_role(self.editor, self.folder), "edit")

    def test_team_read_returns_read(self):
        group = Group.objects.create(name="Reader Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.project, team=team, role=ProjectRole.READ,
        )
        self.assertEqual(effective_role(self.team_user, self.folder), "read")

    def test_team_edit_returns_edit(self):
        group = Group.objects.create(name="Editor Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.project, team=team, role=ProjectRole.EDIT,
        )
        self.assertEqual(effective_role(self.team_user, self.folder), "edit")

    def test_conflicting_grants_edit_wins(self):
        group = Group.objects.create(name="Mixed Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.team_user,
        )
        Grant.objects.create(
            project=self.project, team=team, role=ProjectRole.EDIT,
        )
        self.assertEqual(effective_role(self.team_user, self.folder), "edit")

    def test_org_admin_returns_edit(self):
        self.assertEqual(effective_role(self.admin, self.folder), "edit")

    def test_org_admin_returns_edit_even_without_grants(self):
        self.assertFalse(Grant.objects.filter(user=self.admin).exists())
        self.assertEqual(effective_role(self.admin, self.folder), "edit")

    def test_superuser_returns_edit(self):
        self.assertEqual(effective_role(self.superuser, self.folder), "edit")

    def test_superuser_returns_edit_without_grants_or_membership(self):
        self.assertFalse(Grant.objects.filter(user=self.superuser).exists())
        self.assertFalse(
            OrganizationMembership.objects.filter(user=self.superuser).exists()
        )
        self.assertEqual(effective_role(self.superuser, self.folder), "edit")


class EffectiveRoleShareTests(TestCase):
    """Test effective_role() across Folder Share paths."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.reader = User.objects.create_user(username="reader", password="pass")
        self.editor = User.objects.create_user(username="editor", password="pass")
        self.other = User.objects.create_user(username="other", password="pass")
        self.superuser = User.objects.create_superuser(
            username="superuser", password="pass",
        )
        _ensure_membership(self.reader, self.org, OrganizationRole.USER)
        _ensure_membership(self.editor, self.org, OrganizationRole.USER)
        _ensure_membership(self.other, self.org, OrganizationRole.USER)
        OrganizationMembership.objects.filter(user=self.superuser).delete()

        self.source_project = _make_project_with_root("Source Project")
        self.target_project = _make_project_with_root("Target Project")

        self.shared_folder = _add_child_folder(self.source_project, "Shared Folder")
        self.descendant = _add_grandchild_folder(self.source_project, "Deep", "Shared Folder")
        self.outside = _add_child_folder(self.source_project, "Outside Folder")

    def _share(self, level=ShareLevel.READ):
        return FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target_project,
            level=level,
        )

    def test_share_derived_read(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.READ, user=self.reader,
        )
        self._share(ShareLevel.READ)
        self.assertEqual(effective_role(self.reader, self.descendant), "read")

    def test_read_share_with_edit_target_still_read(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ)
        self.assertEqual(effective_role(self.editor, self.descendant), "read")

    def test_share_derived_read_write_for_target_editor(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.editor, self.descendant), "edit")

    def test_read_write_share_with_read_target_is_read(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.READ, user=self.reader,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.reader, self.descendant), "read")

    def test_no_target_role_denies_access(self):
        self._share(ShareLevel.READ_WRITE)
        self.assertIsNone(effective_role(self.other, self.descendant))

    def test_no_share_denies_access(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self.assertIsNone(effective_role(self.editor, self.descendant))

    def test_subtree_coverage_extends_to_descendants(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.READ, user=self.reader,
        )
        self._share(ShareLevel.READ)
        self.assertEqual(effective_role(self.reader, self.descendant), "read")

    def test_resource_outside_subtree_not_accessible(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertIsNone(effective_role(self.editor, self.outside))

    def test_read_cap_on_shared_top_level_folder(self):
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.editor, self.shared_folder), "read")

    def test_superuser_bypasses_share_path(self):
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.superuser, self.descendant), "edit")

    def test_entry_inside_subtree_edit_for_target_editor(self):
        from mods.eln.models import NotebookEntry
        from mods.eln.tests.factories import get_or_create_default_eln_schema

        schema = get_or_create_default_eln_schema()
        entry = NotebookEntry.objects.create(
            name="Entry", content={"type": "doc"}, folder=self.descendant,
            author=self.reader, schema=schema,
        )
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.editor, entry), "edit")

    def test_entity_inside_subtree_edit_for_target_editor(self):
        from mods.lims.models import Entity

        schema_type, _ = SchemaType.objects.get_or_create(
            display_name="Test", workspace_id="lims", model="mods.lims.models.Entity",
        )
        schema, _ = Schema.objects.get_or_create(
            name="DNA", prefix="DNA", schema_type=schema_type,
        )
        entity = Entity.objects.create(
            name="Sample", schema=schema, folder=self.descendant, author=self.reader,
        )
        Grant.objects.create(
            project=self.target_project, role=ProjectRole.EDIT, user=self.editor,
        )
        self._share(ShareLevel.READ_WRITE)
        self.assertEqual(effective_role(self.editor, entity), "edit")


class AccessibleProjectIdsTests(TestCase):
    """Test accessible_project_ids() — the batch list-context helper."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.team_user = User.objects.create_user(username="team_user", password="pass")
        self.superuser = User.objects.create_superuser(
            username="superuser", password="pass",
        )
        self.inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.user, self.org, OrganizationRole.USER)
        _ensure_membership(self.team_user, self.org, OrganizationRole.USER)
        _ensure_membership(self.inactive, self.org, OrganizationRole.USER)
        OrganizationMembership.objects.filter(user=self.superuser).delete()

        self.project_a = _make_project_with_root("Project A")
        self.project_b = _make_project_with_root("Project B")
        self.project_c = _make_project_with_root("Project C")

    def test_anonymous_returns_empty(self):
        self.assertEqual(accessible_project_ids(None), set())
        anon = User(username="anon")
        self.assertEqual(accessible_project_ids(anon), set())

    def test_inactive_returns_empty(self):
        self.assertEqual(accessible_project_ids(self.inactive), set())

    def test_user_without_grants_returns_empty(self):
        self.assertEqual(accessible_project_ids(self.user), set())

    def test_direct_read_grant_included(self):
        Grant.objects.create(
            project=self.project_a, role=ProjectRole.READ, user=self.user,
        )
        self.assertEqual(accessible_project_ids(self.user), {self.project_a.pk})

    def test_direct_edit_grant_included(self):
        Grant.objects.create(
            project=self.project_b, role=ProjectRole.EDIT, user=self.user,
        )
        self.assertEqual(accessible_project_ids(self.user), {self.project_b.pk})

    def test_multiple_direct_grants_included(self):
        Grant.objects.create(
            project=self.project_a, role=ProjectRole.READ, user=self.user,
        )
        Grant.objects.create(
            project=self.project_b, role=ProjectRole.EDIT, user=self.user,
        )
        self.assertEqual(
            accessible_project_ids(self.user),
            {self.project_a.pk, self.project_b.pk},
        )

    def test_team_grant_included(self):
        group = Group.objects.create(name="Access Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.project_c, team=team, role=ProjectRole.READ,
        )
        self.assertEqual(
            accessible_project_ids(self.team_user), {self.project_c.pk},
        )

    def test_direct_and_team_combined(self):
        group = Group.objects.create(name="Combo Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.project_a, role=ProjectRole.READ, user=self.team_user,
        )
        Grant.objects.create(
            project=self.project_c, team=team, role=ProjectRole.EDIT,
        )
        self.assertEqual(
            accessible_project_ids(self.team_user),
            {self.project_a.pk, self.project_c.pk},
        )

    def test_org_admin_returns_all_projects(self):
        self.assertEqual(
            accessible_project_ids(self.admin),
            {self.project_a.pk, self.project_b.pk, self.project_c.pk},
        )

    def test_superuser_returns_all_projects(self):
        self.assertFalse(Grant.objects.filter(user=self.superuser).exists())
        self.assertEqual(
            accessible_project_ids(self.superuser),
            {self.project_a.pk, self.project_b.pk, self.project_c.pk},
        )
