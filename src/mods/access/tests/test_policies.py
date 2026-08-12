"""Tests for Core Action authorization policies and the policy API."""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Folder, User
from mods.access.models import (
    Grant,
    OrganizationMembership,
    ProjectRole,
)
from mods.access.policies import (
    can,
    get_policy_matrix,
    role,
)
from mods.access.tests.factories import (
    make_org,
    make_project,
    make_superuser,
    make_user,
)


class RoleFunctionTests(TestCase):
    """Test access.role() — the effective Project Role resolver."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")
        cls.superuser = make_superuser("superuser")
        cls.inactive = make_user("inactive", cls.org, "user", is_active=False)

    def test_none_user_returns_none(self):
        self.assertIsNone(role(None))

    def test_anonymous_user_returns_none(self):
        anon = User(username="anon")
        self.assertIsNone(role(anon))

    def test_inactive_user_returns_none(self):
        self.assertIsNone(role(self.inactive))

    def test_org_admin_returns_edit(self):
        self.assertEqual(role(self.admin), "edit")

    def test_superuser_returns_edit(self):
        self.assertEqual(role(self.superuser), "edit")

    def test_superuser_returns_edit_without_grants_or_membership(self):
        self.assertFalse(Grant.objects.filter(user=self.superuser).exists())
        self.assertFalse(
            OrganizationMembership.objects.filter(user=self.superuser).exists()
        )
        self.assertEqual(role(self.superuser), "edit")

    def test_regular_user_without_grants_returns_none(self):
        self.assertIsNone(role(self.user))


class CanFunctionTests(TestCase):
    """Test access.can() — the authorization evaluator."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, "admin")
        cls.user = make_user("regular", cls.org, "user")
        cls.superuser = make_superuser("superuser")
        cls.project = make_project("Alpha")

    def setUp(self):
        self.anon = User(username="anon")

    def _resource(self):
        """Return a resource with project_id for project_resource checks."""
        root = Folder.objects.filter(
            project=self.project, parent__isnull=True,
        ).first()
        return Folder.objects.create(
            name="child", parent=root, project=self.project,
        )

    def test_anonymous_cannot_do_anything(self):
        self.assertFalse(can(self.anon, "read"))
        self.assertFalse(can(self.anon, "created"))
        self.assertFalse(can(None, "read"))

    def test_org_admin_can_do_everything(self):
        self.assertTrue(can(self.admin, "read"))
        self.assertTrue(can(self.admin, "created"))
        self.assertTrue(can(self.admin, "edited"))
        self.assertTrue(can(self.admin, "deleted"))

    def test_superuser_can_do_everything(self):
        self.assertTrue(can(self.superuser, "read"))
        self.assertTrue(can(self.superuser, "created"))
        self.assertTrue(can(self.superuser, "edited"))
        self.assertTrue(can(self.superuser, "deleted"))

    def test_authenticated_user_can_read_public_resources(self):
        self.assertTrue(can(self.user, "read"))

    def test_authenticated_user_can_mutate_public_resources(self):
        self.assertTrue(can(self.user, "created"))
        self.assertTrue(can(self.user, "edited"))
        self.assertTrue(can(self.user, "deleted"))

    def test_unknown_action_verb_returns_false(self):
        self.assertFalse(can(self.user, "unknown_verb"))

    def test_custom_action_resolves_mapped_core_verb(self):
        """Custom Actions inherit their mapped Core Action policy."""
        from helix_core.mod_system.registry import registry
        from mods.eln.models import ElnAction

        saved_models = dict(registry._action_models)
        saved_custom = {
            mod: dict(actions)
            for mod, actions in registry._custom_actions.items()
        }
        try:
            registry._action_models.clear()
            registry._custom_actions.clear()
            registry.register_action_model("eln", ElnAction)
            registry.register_custom_action(
                mod_id="eln",
                action_id="eln.entry.registered",
                label="Entry Registered",
                core="created",
                target_model="mods.eln.models.NotebookEntry",
            )
            self.assertTrue(can(self.user, "eln.entry.registered"))
        finally:
            registry._action_models.clear()
            registry._action_models.update(saved_models)
            registry._custom_actions.clear()
            for mod, actions in saved_custom.items():
                registry._custom_actions[mod] = dict(actions)

    def test_admin_can_perform_org_admin_mutations(self):
        self.assertTrue(can(self.admin, "created"))

    def test_superuser_can_perform_org_admin_mutations(self):
        self.assertTrue(can(self.superuser, "created", resource=self.org))

    # ── project resource with Grants ──────────────────────────────────────

    def test_user_without_grant_cannot_read_project_resource(self):
        resource = self._resource()
        self.assertFalse(can(self.user, "read", resource=resource))

    def test_user_with_read_grant_can_read_project_resource(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        resource = self._resource()
        self.assertTrue(can(self.user, "read", resource=resource))

    def test_user_with_read_grant_cannot_edit_project_resource(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        resource = self._resource()
        self.assertFalse(can(self.user, "created", resource=resource))

    def test_user_with_edit_grant_can_edit_project_resource(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.EDIT, user=self.user,
        )
        resource = self._resource()
        self.assertTrue(can(self.user, "created", resource=resource))
        self.assertTrue(can(self.user, "edited", resource=resource))
        self.assertTrue(can(self.user, "deleted", resource=resource))

    def test_user_with_read_grant_cannot_create_org_admin_resource(self):
        Grant.objects.create(
            project=self.project, role=ProjectRole.READ, user=self.user,
        )
        self.assertFalse(can(self.user, "created", resource=self.org))

    def test_superuser_without_grants_can_read_and_edit_project_resource(self):
        self.assertFalse(Grant.objects.filter(user=self.superuser).exists())
        resource = self._resource()
        self.assertTrue(can(self.superuser, "read", resource=resource))
        self.assertTrue(can(self.superuser, "edited", resource=resource))
        self.assertTrue(can(self.superuser, "deleted", resource=resource))


class GetPolicyMatrixTests(TestCase):
    """Test get_policy_matrix() returns the hardcoded matrix."""

    def test_returns_non_empty_list(self):
        matrix = get_policy_matrix()
        self.assertIsInstance(matrix, list)
        self.assertGreater(len(matrix), 0)

    def test_each_entry_has_required_keys(self):
        matrix = get_policy_matrix()
        for entry in matrix:
            self.assertIn("id", entry)
            self.assertIn("core_action", entry)
            self.assertIn("resource", entry)
            self.assertIn("resource_label", entry)
            self.assertIn("required_level", entry)

    def test_entries_cover_all_four_core_actions(self):
        matrix = get_policy_matrix()
        core_actions = {entry["core_action"] for entry in matrix}
        self.assertIn("read", core_actions)
        self.assertIn("created", core_actions)
        self.assertIn("edited", core_actions)
        self.assertIn("deleted", core_actions)


class PolicyApiTests(TestCase):
    """Tests for GET /api/access/policies/."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.user = make_user("regular", cls.org, "user")

    def setUp(self):
        self.client = APIClient()

    def test_policies_endpoint_returns_list(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/policies/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertGreater(len(response.data), 0)

    def test_policies_endpoint_requires_auth(self):
        response = self.client.get("/api/access/policies/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_policies_each_entry_has_required_keys(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/access/policies/")
        for entry in response.data:
            self.assertIn("id", entry)
            self.assertIn("core_action", entry)
            self.assertIn("resource", entry)
            self.assertIn("resource_label", entry)
            self.assertIn("required_level", entry)
