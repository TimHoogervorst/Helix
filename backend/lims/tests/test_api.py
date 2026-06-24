"""
Tests for the LIMS API endpoints.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, User
from lims.models import EntityType, Entity


class LimsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")
        EntityType.objects.create(name="DNA")
        EntityType.objects.create(name="Chemical")

    def test_list_entity_types(self):
        """GET returns the seeded types."""
        response = self.client.get("/api/lims/entity-types/")
        self.assertEqual(response.status_code, 200)
        names = {et["name"] for et in response.data}
        self.assertIn("DNA", names)
        self.assertIn("Chemical", names)

    def test_list_entities_empty(self):
        """GET returns empty list."""
        response = self.client.get("/api/lims/entities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_create_entity_not_allowed(self):
        """POST to read-only endpoint returns 405 Method Not Allowed."""
        dna_type = EntityType.objects.get(name="DNA")
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Sample A", "entity_type": dna_type.id},
        )
        self.assertEqual(response.status_code, 405)
