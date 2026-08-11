"""Tests for bootstrap behavior: Organization + Admin membership seeding."""

from django.test import TestCase

from core.models import User
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)


class BootstrapTests(TestCase):
    def test_fresh_deployment_has_exactly_one_organization(self):
        org = Organization.objects.create(name="Helix Lab")
        self.assertEqual(Organization.objects.count(), 1)
        self.assertEqual(org.name, "Helix Lab")

    def test_seed_superuser_promoted_to_admin(self):
        org = Organization.objects.create(name="Helix Lab")
        user = User.objects.create_superuser(
            username="seedadmin", password="pass",
        )
        membership = OrganizationMembership.objects.create(
            user=user, organization=org, role=OrganizationRole.ADMIN,
        )
        self.assertEqual(membership.role, OrganizationRole.ADMIN)
        self.assertEqual(membership.user, user)
        self.assertEqual(membership.organization, org)

    def test_no_default_team_or_project_created(self):
        Organization.objects.create(name="Helix Lab")
        User.objects.create_user(username="test", password="pass")
        self.assertEqual(Organization.objects.count(), 1)
        self.assertEqual(OrganizationMembership.objects.count(), 0)
