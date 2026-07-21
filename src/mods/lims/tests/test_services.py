from django.test import TestCase

from mods.lims.models import EntityType


# ── EntityType.icon field ─────────────────────────────────────────────

class EntityTypeIconTests(TestCase):
    """Tests for the EntityType.icon field."""

    def test_default_icon_is_test_tube(self):
        """EntityType.icon defaults to 🧪."""
        et = EntityType.objects.create(
            name="Default Icon", prefix="DEF", columns=[]
        )
        self.assertEqual(et.icon, "🧪")

    def test_custom_icon_survives_roundtrip(self):
        """Custom icon is persisted and retrieved correctly."""
        et = EntityType.objects.create(
            name="Blood", prefix="BLOOD", icon="🩸", columns=[]
        )
        et.refresh_from_db()
        self.assertEqual(et.icon, "🩸")

    def test_icon_in_serializer(self):
        """EntityTypeSerializer includes the icon field."""
        from mods.lims.serializers import EntityTypeSerializer

        et = EntityType.objects.create(
            name="DNA", prefix="DNA", icon="🧬", columns=[]
        )
        serializer = EntityTypeSerializer(et)
        self.assertIn("icon", serializer.data)
        self.assertEqual(serializer.data["icon"], "🧬")
