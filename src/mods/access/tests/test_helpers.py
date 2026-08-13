"""Tests for the shared access helpers: effective_role and accessible_project_ids."""

from django.contrib.auth.models import Group
from django.test import TestCase

from core.models import User
from helix_core.models import Schema, SchemaType
from mods.access.models import (
    FolderShare,
    Grant,
    OrganizationMembership,
    ProjectRole,
    ShareLevel,
    Team,
)
from mods.access.policies import accessible_project_ids, effective_role
from mods.access.tests.factories import (
    add_child_folder,
    add_grandchild_folder,
    make_org,
    make_project,
    make_superuser,
    make_user,
)


class EffectiveRoleTests(TestCase):
    """Test effective_role() across the full actor matrix."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.reader = make_user("reader", cls.org, "user")
        cls.editor = make_user("editor", cls.org, "user")
        cls.team_user = make_user("team_user", cls.org, "user")
        cls.superuser = make_superuser("superuser")
        cls.inactive = make_user("inactive", cls.org, "user", is_active=False)

        cls.project = make_project("Source Project")
        cls.folder = add_child_folder(cls.project, "Shared Folder")
        cls.descendant = add_grandchild_folder(cls.project, "Deep", "Shared Folder")
        cls.outside = add_child_folder(cls.project, "Outside Folder")

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

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.reader = make_user("reader", cls.org, "user")
        cls.editor = make_user("editor", cls.org, "user")
        cls.other = make_user("other", cls.org, "user")
        cls.superuser = make_superuser("superuser")

        cls.source_project = make_project("Source Project")
        cls.target_project = make_project("Target Project")

        cls.shared_folder = add_child_folder(cls.source_project, "Shared Folder")
        cls.descendant = add_grandchild_folder(cls.source_project, "Deep", "Shared Folder")
        cls.outside = add_child_folder(cls.source_project, "Outside Folder")

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

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")
        cls.team_user = make_user("team_user", cls.org, "user")
        cls.superuser = make_superuser("superuser")
        cls.inactive = make_user("inactive", cls.org, "user", is_active=False)

        cls.project_a = make_project("Project A")
        cls.project_b = make_project("Project B")
        cls.project_c = make_project("Project C")

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
