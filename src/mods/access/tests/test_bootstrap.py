"""Tests for bootstrap behavior: Organization + Admin membership seeding."""

from django.test import TestCase

from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
    Team,
)
from core.models import Project, User
from mods.access.tests.factories import ensure_membership


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
        membership = ensure_membership(user, org, OrganizationRole.ADMIN)
        self.assertEqual(membership.role, OrganizationRole.ADMIN)
        self.assertEqual(membership.user, user)
        self.assertEqual(membership.organization, org)

    def test_no_default_team_or_project_created(self):
        Organization.objects.create(name="Helix Lab")
        User.objects.create_user(username="test", password="pass")
        self.assertEqual(Organization.objects.count(), 1)
        # The post_save signal auto-creates the User's OrganizationMembership.
        self.assertEqual(OrganizationMembership.objects.count(), 1)
        self.assertEqual(Team.objects.count(), 0)
        self.assertEqual(Project.objects.count(), 0)
