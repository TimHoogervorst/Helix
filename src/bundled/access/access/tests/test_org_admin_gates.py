"""HTTP authorization tests for organization-admin-only operations."""

from rest_framework.test import APIClient

from bundled.access.access.models import Organization, OrganizationMembership, OrganizationRole
from bundled.access.access.tests.api_base import AccessApiTestCase
from helix_core.core.models import User


class OrganizationAdminGateTests(AccessApiTestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Lab")
        self.user = User.objects.create_user(username="regular", password="pass")
        self.admin = User.objects.create_user(username="orgadmin", password="pass")
        OrganizationMembership.objects.update_or_create(
            user=self.admin,
            defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={"organization": self.org, "role": OrganizationRole.USER},
        )

    def test_catalog_mutations_reject_non_admin(self):
        cases = [
            "/api/schemas/",
            "/api/core/settings/test/",
            "/api/access/teams/",
        ]
        for url in cases:
            with self.subTest(url=url):
                self.client.force_authenticate(user=self.user)
                response = self.client.post(url, {}, format="json")
                self.assertEqual(response.status_code, 403)

    def test_bulk_wipes_require_admin_and_allow_admin(self):
        urls = [
            "/api/schemas/delete_all/",
            "/api/delete-everything/",
        ]
        for url in urls:
            with self.subTest(url=url):
                self.client.force_authenticate(user=self.user)
                self.assertEqual(self.client.delete(url).status_code, 403)

                self.client.force_authenticate(user=self.admin)
                self.assertEqual(self.client.delete(url).status_code, 200)

    def test_bulk_wipes_reject_anonymous(self):
        self.client.force_authenticate(user=None)
        for url in (
            "/api/schemas/delete_all/",
            "/api/delete-everything/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.delete(url).status_code, 403)
