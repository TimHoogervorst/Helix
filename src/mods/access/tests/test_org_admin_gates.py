"""HTTP authorization tests for organization-admin-only operations."""

from core.tests.base import BaseTestCase
from mods.access.models import Organization, OrganizationMembership, OrganizationRole
from core.models import User


class OrganizationAdminGateTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.org = Organization.objects.create(name="Test Lab")
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
            "/api/dropdowns/",
            "/api/colors/",
            "/api/icons/",
            "/api/eln/protocols/",
            "/api/core/settings/test/",
        ]
        for url in cases:
            with self.subTest(url=url):
                self.client.force_authenticate(user=self.user)
                response = self.client.post(url, {}, format="json")
                self.assertEqual(response.status_code, 403)

    def test_bulk_wipes_require_admin_and_allow_admin(self):
        urls = [
            "/api/lims/entities/delete_all/",
            "/api/eln/entries/delete_all/",
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
            "/api/lims/entities/delete_all/",
            "/api/eln/entries/delete_all/",
            "/api/schemas/delete_all/",
            "/api/delete-everything/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.delete(url).status_code, 403)
