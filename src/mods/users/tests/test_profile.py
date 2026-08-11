"""Tests for profile API endpoints and registration with email."""

from core.models import CoreSetting, User
from core.tests.base import BaseTestCase
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from mods.users.models import Affiliation, Publication, Recognition


class MeEndpointTests(BaseTestCase):
    """Tests for GET/PATCH /api/core/me/ with profile data."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_get_me_returns_profile_json(self):
        """GET /api/core/me/ returns profile JSON and nested list arrays."""
        self.user.profile = {"title": "Dr.", "position": "Researcher"}
        self.user.save()

        response = self.client.get("/api/core/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["title"], "Dr.")
        self.assertEqual(response.data["profile"]["position"], "Researcher")
        self.assertIn("affiliations", response.data)
        self.assertIn("publications", response.data)
        self.assertIn("recognitions", response.data)

    def test_get_me_profile_defaults_to_empty_dict(self):
        """New user without profile data returns empty profile dict."""
        response = self.client.get("/api/core/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"], {})

    def test_get_me_includes_organization_role(self):
        """GET /api/core/me/ includes organization_role field."""
        response = self.client.get("/api/core/me/")
        self.assertIn("organization_role", response.data)
        self.assertIsNone(response.data["organization_role"])

    def test_get_me_organization_role_reflects_membership(self):
        """GET /api/core/me/ returns the user's organization role."""
        org = Organization.objects.create(name="Test Lab")
        OrganizationMembership.objects.create(
            user=self.user, organization=org, role=OrganizationRole.ADMIN,
        )
        response = self.client.get("/api/core/me/")
        self.assertEqual(response.data["organization_role"], "admin")

    def test_patch_me_updates_profile(self):
        """PATCH /api/core/me/ with a profile blob persists correctly."""
        response = self.client.patch(
            "/api/core/me/",
            {"profile": {"title": "Prof.", "bio": "Hello"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["title"], "Prof.")
        self.assertEqual(response.data["profile"]["bio"], "Hello")

        # Verify database state
        self.user.refresh_from_db()
        self.assertEqual(self.user.profile["title"], "Prof.")

    def test_patch_me_updates_username(self):
        """PATCH /api/core/me/ can update username."""
        response = self.client.patch(
            "/api/core/me/",
            {"username": "newusername"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "newusername")
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "newusername")

    def test_patch_me_updates_email(self):
        """PATCH /api/core/me/ can update email."""
        response = self.client.patch(
            "/api/core/me/",
            {"email": "new@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_get_me_includes_nested_lists(self):
        """GET /me/ returns nested affiliation/publication/recognition lists."""
        aff = Affiliation.objects.create(
            user=self.user, institution="Test Lab", order=0,
        )
        pub = Publication.objects.create(
            user=self.user, title="Test Paper", order=0,
        )
        rec = Recognition.objects.create(
            user=self.user, title="Test Award", order=0,
        )

        response = self.client.get("/api/core/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["affiliations"]), 1)
        self.assertEqual(response.data["affiliations"][0]["institution"], "Test Lab")
        self.assertEqual(len(response.data["publications"]), 1)
        self.assertEqual(response.data["publications"][0]["title"], "Test Paper")
        self.assertEqual(len(response.data["recognitions"]), 1)
        self.assertEqual(response.data["recognitions"][0]["title"], "Test Award")


class AffiliationApiTests(BaseTestCase):
    """Tests for CRUD on /api/core/me/affiliations/."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_list_affiliations_empty(self):
        """GET returns empty list when user has no affiliations."""
        response = self.client.get("/api/core/me/affiliations/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_create_affiliation(self):
        """POST creates an affiliation and returns it."""
        response = self.client.post(
            "/api/core/me/affiliations/",
            {"institution": "Helix Institute", "role": "Postdoc"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["institution"], "Helix Institute")
        self.assertEqual(response.data["role"], "Postdoc")
        self.assertEqual(Affiliation.objects.count(), 1)
        aff = Affiliation.objects.first()
        self.assertEqual(aff.user, self.user)

    def test_partial_update_affiliation(self):
        """PATCH updates a single field on an affiliation."""
        aff = Affiliation.objects.create(
            user=self.user, institution="Old Name", order=0,
        )

        response = self.client.patch(
            f"/api/core/me/affiliations/{aff.id}/",
            {"institution": "New Name"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["institution"], "New Name")
        aff.refresh_from_db()
        self.assertEqual(aff.institution, "New Name")

    def test_destroy_affiliation(self):
        """DELETE removes an affiliation."""
        aff = Affiliation.objects.create(
            user=self.user, institution="To Delete", order=0,
        )

        response = self.client.delete(f"/api/core/me/affiliations/{aff.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(Affiliation.objects.count(), 0)

    def test_list_only_returns_own_affiliations(self):
        """User A does not see User B's affiliations."""
        other = User.objects.create_user(username="other", password="pass")
        Affiliation.objects.create(user=other, institution="Other Lab", order=0)

        response = self.client.get("/api/core/me/affiliations/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_cannot_access_other_users_affiliation(self):
        """User A cannot modify User B's affiliation."""
        other = User.objects.create_user(username="other", password="pass")
        aff = Affiliation.objects.create(user=other, institution="Other Lab", order=0)

        response = self.client.patch(
            f"/api/core/me/affiliations/{aff.id}/",
            {"institution": "Hacked"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        aff.refresh_from_db()
        self.assertEqual(aff.institution, "Other Lab")


class PublicationApiTests(BaseTestCase):
    """Tests for CRUD on /api/core/me/publications/."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_list_empty(self):
        """GET returns empty list."""
        response = self.client.get("/api/core/me/publications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_create_publication(self):
        """POST creates a publication."""
        response = self.client.post(
            "/api/core/me/publications/",
            {"title": "My Paper", "journal": "Nature", "year": 2024},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "My Paper")
        self.assertEqual(Publication.objects.count(), 1)

    def test_partial_update_publication(self):
        """PATCH updates a publication."""
        pub = Publication.objects.create(
            user=self.user, title="Old Title", order=0,
        )

        response = self.client.patch(
            f"/api/core/me/publications/{pub.id}/",
            {"title": "New Title"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "New Title")

    def test_destroy_publication(self):
        """DELETE removes a publication."""
        pub = Publication.objects.create(
            user=self.user, title="To Delete", order=0,
        )

        response = self.client.delete(f"/api/core/me/publications/{pub.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(Publication.objects.count(), 0)

    def test_cannot_access_other_users_publication(self):
        """User A gets 404 on User B's publication."""
        other = User.objects.create_user(username="other", password="pass")
        pub = Publication.objects.create(user=other, title="Other Paper", order=0)

        response = self.client.get(f"/api/core/me/publications/{pub.id}/")

        self.assertEqual(response.status_code, 404)


class RecognitionApiTests(BaseTestCase):
    """Tests for CRUD on /api/core/me/recognitions/."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_list_empty(self):
        """GET returns empty list."""
        response = self.client.get("/api/core/me/recognitions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_create_recognition(self):
        """POST creates a recognition."""
        response = self.client.post(
            "/api/core/me/recognitions/",
            {"title": "Best Paper Award", "issuer": "ACM", "date": "2024"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "Best Paper Award")
        self.assertEqual(Recognition.objects.count(), 1)

    def test_partial_update_recognition(self):
        """PATCH updates a recognition."""
        rec = Recognition.objects.create(
            user=self.user, title="Old Award", order=0,
        )

        response = self.client.patch(
            f"/api/core/me/recognitions/{rec.id}/",
            {"title": "New Award"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "New Award")

    def test_destroy_recognition(self):
        """DELETE removes a recognition."""
        rec = Recognition.objects.create(
            user=self.user, title="To Delete", order=0,
        )

        response = self.client.delete(f"/api/core/me/recognitions/{rec.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(Recognition.objects.count(), 0)

    def test_cannot_access_other_users_recognition(self):
        """User A gets 404 on User B's recognition."""
        other = User.objects.create_user(username="other", password="pass")
        rec = Recognition.objects.create(user=other, title="Other Award", order=0)

        response = self.client.get(f"/api/core/me/recognitions/{rec.id}/")

        self.assertEqual(response.status_code, 404)


class RegisterWithEmailTests(BaseTestCase):
    """Tests for POST /api/core/register/ with required email."""

    def setUp(self):
        super().setUp()
        CoreSetting.objects.create(key="allow_self_registration", value=True)

    def test_register_with_email_succeeds(self):
        """POST with username, email, password returns 201."""
        response = self.client.post(
            "/api/core/register/",
            {"username": "newuser", "email": "new@example.com", "password": "Str0ng!Pass"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["username"], "newuser")
        user = User.objects.get(username="newuser")
        self.assertEqual(user.email, "new@example.com")

    def test_register_missing_email_returns_validation_error(self):
        """POST without email returns 400."""
        response = self.client.post(
            "/api/core/register/",
            {"username": "newuser", "password": "Str0ng!Pass"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_register_duplicate_email_returns_validation_error(self):
        """POST with an email already in use returns 400."""
        User.objects.create_user(
            username="existing", email="taken@example.com", password="pass",
        )

        response = self.client.post(
            "/api/core/register/",
            {"username": "newuser", "email": "taken@example.com", "password": "Str0ng!Pass"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
