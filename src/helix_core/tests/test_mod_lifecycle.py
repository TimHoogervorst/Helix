from django.test import TestCase
from rest_framework.test import APIClient

from helix_core.mod_system.lifecycle import (
    ModLifecycleError,
    ModLifecycleState,
    activate_mod,
    deactivate_mod,
    sync_mod_installations,
)
from helix_core.models import ActionLogEntry, ModInstallation
from helix_core.core.models import User
from bundled.access.access.models import Organization, OrganizationMembership, OrganizationRole


def manifest(mod_id, dependencies=(), artifacts=("frontend", "backend")):
    return {
        "id": mod_id,
        "displayName": mod_id,
        "version": "1.0.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": list(artifacts),
        "dependsOn": [
            {"id": dependency, "version": "^1.0.0"}
            for dependency in dependencies
        ],
    }


class ModLifecycleServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="admin")

    def test_new_external_mods_are_inactive_and_bundled_mods_are_active(self):
        sync_mod_installations(
            {
                "acme.inactive": manifest("acme.inactive"),
                "helix.bundled": manifest("helix.bundled"),
            },
            {"acme.inactive": "mods.inactive", "helix.bundled": "bundled.bundled"},
            bundled_ids={"helix.bundled"},
        )

        self.assertEqual(
            ModInstallation.objects.get(mod_id="acme.inactive").state,
            ModLifecycleState.INACTIVE,
        )
        self.assertEqual(
            ModInstallation.objects.get(mod_id="helix.bundled").state,
            ModLifecycleState.ACTIVE,
        )

    def test_activation_includes_dependencies_and_logs_one_platform_action(self):
        sync_mod_installations(
            {"acme.base": manifest("acme.base"), "acme.app": manifest("acme.app", ["acme.base"])},
            {"acme.base": "mods.base", "acme.app": "mods.app"},
        )

        changed = activate_mod("acme.app", self.user)

        self.assertEqual(changed, {"acme.base", "acme.app"})
        self.assertTrue(
            ModInstallation.objects.filter(
                mod_id__in=changed, desired_state=ModLifecycleState.ACTIVE
            ).count()
            == 2
        )
        self.assertEqual(ActionLogEntry.objects.count(), 1)
        self.assertEqual(ActionLogEntry.objects.get().action_type, "edited")

    def test_deactivation_cascades_to_dependents_atomically(self):
        sync_mod_installations(
            {"acme.base": manifest("acme.base"), "acme.app": manifest("acme.app", ["acme.base"])},
            {"acme.base": "mods.base", "acme.app": "mods.app"},
        )
        activate_mod("acme.app", self.user)

        changed = deactivate_mod("acme.base", self.user, cascade=True)

        self.assertEqual(changed, {"acme.base", "acme.app"})
        self.assertFalse(
            ModInstallation.objects.filter(
                mod_id__in=changed, desired_state=ModLifecycleState.ACTIVE
            ).exists()
        )

    def test_invalid_dependency_graph_is_not_saved(self):
        sync_mod_installations(
            {"acme.app": manifest("acme.app", ["missing.mod"])},
            {"acme.app": "mods.app"},
        )

        with self.assertRaises(ModLifecycleError):
            activate_mod("acme.app", self.user)

        installation = ModInstallation.objects.get(mod_id="acme.app")
        self.assertEqual(installation.desired_state, ModLifecycleState.INACTIVE)
        self.assertEqual(ActionLogEntry.objects.count(), 0)


class ModLifecycleApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="member")
        self.admin = User.objects.create_user(username="admin")
        organization = Organization.objects.create(name="Test Lab")
        OrganizationMembership.objects.create(
            user=self.admin, organization=organization, role=OrganizationRole.ADMIN
        )
        OrganizationMembership.objects.create(
            user=self.user, organization=organization, role=OrganizationRole.USER
        )
        sync_mod_installations(
            {"acme.app": manifest("acme.app")}, {"acme.app": "mods.app"}
        )

    def test_lifecycle_surface_is_organization_admin_only(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/mod-lifecycle/").status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/mod-lifecycle/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mods"][0]["state"], "inactive")
