"""Tests for Core Action authorization policies and the policy API."""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import User
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from mods.access.policies import (
    can,
    get_policy_matrix,
    role,
)


def _ensure_membership(user, org, role):
    """Create or update a membership, avoiding signal collision."""
    mem, _ = OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": role},
    )
    return mem


class RoleFunctionTests(TestCase):
    """Test access.role() — the effective Project Role resolver."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.user, self.org, OrganizationRole.USER)
        _ensure_membership(self.inactive, self.org, OrganizationRole.USER)

    def test_none_user_returns_none(self):
        self.assertIsNone(role(None))

    def test_anonymous_user_returns_none(self):
        anon = User(username="anon")
        self.assertIsNone(role(anon))

    def test_inactive_user_returns_none(self):
        self.assertIsNone(role(self.inactive))

    def test_org_admin_returns_edit(self):
        self.assertEqual(role(self.admin), "edit")

    def test_regular_user_without_grants_returns_none(self):
        self.assertIsNone(role(self.user))


class CanFunctionTests(TestCase):
    """Test access.can() — the authorization evaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.admin = User.objects.create_user(username="admin", password="pass")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.anon = User(username="anon")
        _ensure_membership(self.admin, self.org, OrganizationRole.ADMIN)
        _ensure_membership(self.user, self.org, OrganizationRole.USER)

    def test_anonymous_cannot_do_anything(self):
        self.assertFalse(can(self.anon, "read"))
        self.assertFalse(can(self.anon, "created"))
        self.assertFalse(can(None, "read"))

    def test_org_admin_can_do_everything(self):
        self.assertTrue(can(self.admin, "read"))
        self.assertTrue(can(self.admin, "created"))
        self.assertTrue(can(self.admin, "edited"))
        self.assertTrue(can(self.admin, "deleted"))

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

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.user = User.objects.create_user(username="regular", password="pass")
        _ensure_membership(self.user, self.org, OrganizationRole.USER)

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
