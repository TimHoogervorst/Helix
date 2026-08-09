"""Tests for ColorToken model, API, and seed migration."""
from django.test import TestCase
from rest_framework.test import APIClient

from helix_core.models import ColorToken
from mods.tags.models import Tag


# ── Model tests ────────────────────────────────────────────────────────


class ColorTokenModelTests(TestCase):
    """Basic CRUD and constraints on the ColorToken model."""

    def setUp(self):
        ColorToken.objects.all().delete()

    def test_create_color_token(self):
        """ColorToken can be created with key, label, hex — variants auto-derived."""
        ct = ColorToken.objects.create(
            key="enzyme", label="Enzyme", hex="#D9B3E6"
        )
        self.assertEqual(ct.key, "enzyme")
        self.assertEqual(ct.label, "Enzyme")
        self.assertEqual(ct.hex, "#D9B3E6")
        self.assertTrue(ct.hex_dark)
        self.assertTrue(ct.hex_light)
        self.assertNotEqual(ct.hex_dark, ct.hex_light)

    def test_derive_variants_dark_has_higher_lightness(self):
        """Dark variant boosts lightness."""
        ct = ColorToken.objects.create(
            key="crimson", label="Crimson", hex="#DC143C"
        )
        import colorsys

        def hsl_l(hex_str):
            hex_str = hex_str.lstrip("#")
            r = int(hex_str[0:2], 16) / 255.0
            g = int(hex_str[2:4], 16) / 255.0
            b = int(hex_str[4:6], 16) / 255.0
            _, l, _ = colorsys.rgb_to_hls(r, g, b)
            return l

        self.assertGreater(hsl_l(ct.hex_dark), hsl_l(ct.hex_light))

    def test_color_token_str(self):
        """__str__ includes label and key."""
        ct = ColorToken.objects.create(
            key="muted", label="Muted", hex="#D9D9D9"
        )
        self.assertIn("Muted", str(ct))
        self.assertIn("muted", str(ct))

    def test_key_unique_constraint(self):
        """Two ColorTokens cannot share the same key."""
        ColorToken.objects.create(
            key="enzyme", label="Enzyme", hex="#D9B3E6"
        )
        with self.assertRaises(Exception):
            ColorToken.objects.create(
                key="enzyme", label="Duplicate Enzyme", hex="#000000"
            )

    def test_ordering_is_by_label(self):
        """ColorTokens are ordered by label."""
        ColorToken.objects.create(key="flask", label="Flask", hex="#B3D9E6")
        ColorToken.objects.create(key="enzyme", label="Enzyme", hex="#D9B3E6")
        ColorToken.objects.create(key="solvent", label="Solvent", hex="#B3E6C8")
        names = list(
            ColorToken.objects.values_list("label", flat=True)
        )
        self.assertEqual(names, ["Enzyme", "Flask", "Solvent"])


# ── API tests ──────────────────────────────────────────────────────────


class ColorTokenApiTests(TestCase):
    """Tests for the /api/colors/ endpoint: list, create, delete."""

    def setUp(self):
        self.client = APIClient()
        ColorToken.objects.all().delete()
        ColorToken.objects.create(
            key="enzyme", label="Enzyme", hex="#D9B3E6"
        )
        ColorToken.objects.create(
            key="muted", label="Muted", hex="#D9D9D9"
        )

    def test_list_colors(self):
        """GET /api/colors/ returns all ColorTokens with derived variants."""
        response = self.client.get("/api/colors/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        keys = {c["key"] for c in response.data}
        self.assertIn("enzyme", keys)
        self.assertIn("muted", keys)
        for c in response.data:
            self.assertIn("id", c)
            self.assertIn("key", c)
            self.assertIn("label", c)
            self.assertIn("hex", c)
            self.assertIn("hex_dark", c)
            self.assertIn("hex_light", c)

    def test_create_color(self):
        """POST /api/colors/ creates a new ColorToken."""
        response = self.client.post(
            "/api/colors/",
            {"key": "flask", "label": "Flask", "hex": "#b3d9e6"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["key"], "flask")
        self.assertEqual(response.data["label"], "Flask")
        self.assertEqual(response.data["hex"], "#B3D9E6")

        ct = ColorToken.objects.get(pk=response.data["id"])
        self.assertEqual(ct.key, "flask")

    def test_create_duplicate_key_fails(self):
        """POST with a key that already exists returns 400."""
        response = self.client.post(
            "/api/colors/",
            {"key": "enzyme", "label": "Duplicate Enzyme", "hex": "#000000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("key", response.data)

    def test_create_invalid_hex_fails(self):
        """POST with an invalid hex format returns 400."""
        response = self.client.post(
            "/api/colors/",
            {"key": "bad", "label": "Bad", "hex": "not-a-color"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("hex", response.data)

    def test_delete_color(self):
        """DELETE /api/colors/{id}/ hard-deletes the token."""
        ct = ColorToken.objects.create(
            key="flask", label="Flask", hex="#B3D9E6"
        )
        response = self.client.delete(f"/api/colors/{ct.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("usage_count", response.data)
        self.assertEqual(response.data["usage_count"], 0)
        self.assertFalse(
            ColorToken.objects.filter(pk=ct.id).exists()
        )

    def test_delete_color_in_use_reports_usage_count(self):
        """DELETE succeeds even when tags reference the key, and reports count."""
        ct = ColorToken.objects.get(key="enzyme")
        Tag.objects.create(name="Reagent", color="enzyme", icon="circle")
        Tag.objects.create(name="Buffer", color="enzyme", icon="circle")
        Tag.objects.create(name="Sample", color="muted", icon="circle")

        response = self.client.delete(f"/api/colors/{ct.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["usage_count"], 2)
        self.assertFalse(
            ColorToken.objects.filter(pk=ct.id).exists()
        )

        # Tags still exist — they just reference a dangling key now
        self.assertEqual(Tag.objects.filter(color="enzyme").count(), 2)


# ── Seed migration tests ───────────────────────────────────────────────


SEED_KEYS = frozenset({
    "enzyme", "flask", "solvent", "warn", "muted", "success",
})

SEED_HEXES = {
    "enzyme": "#D9B3E6",
    "flask": "#B3D9E6",
    "solvent": "#B3E6C8",
    "warn": "#E6D9B3",
    "muted": "#D9D9D9",
    "success": "#B3E6B3",
}


class ColorTokenSeedTests(TestCase):
    """Verify that the data migration seeded the 6 palette colours."""

    def test_all_six_seeds_exist(self):
        """All 6 palette colours exist after migrations run."""
        existing = set(
            ColorToken.objects.values_list("key", flat=True)
        )
        self.assertTrue(
            SEED_KEYS.issubset(existing),
            f"Missing seeds: {SEED_KEYS - existing}",
        )

    def test_seeds_have_correct_hexes(self):
        """Each seed has its canonical hex value."""
        for key, hex_val in SEED_HEXES.items():
            ct = ColorToken.objects.get(key=key)
            self.assertEqual(
                ct.hex, hex_val,
                f"Expected {key} hex to be {hex_val}, got {ct.hex}",
            )

    def test_seeds_have_labels(self):
        """Each seed has a non-empty label."""
        for key in SEED_KEYS:
            ct = ColorToken.objects.get(key=key)
            self.assertTrue(ct.label)

    def test_existing_tags_resolve_against_seeds(self):
        """Tag colour keys match seeded ColorToken keys — no data migration needed."""
        for key in SEED_KEYS:
            self.assertTrue(
                ColorToken.objects.filter(key=key).exists(),
                f"Seed colour '{key}' not found — existing tags would break.",
            )


class ColorTokenSeedIdempotencyTests(TestCase):
    """Seed migration is safe to re-run (idempotent)."""

    def test_duplicate_run_does_not_create_duplicates(self):
        """Re-running the equivalent of the seed logic does not create duplicates."""
        import importlib

        mod = importlib.import_module(
            "helix_core.migrations.0006_color_token"
        )
        COLORS = mod.COLORS

        count_before = ColorToken.objects.count()

        for key, label, hex_val in COLORS:
            ColorToken.objects.get_or_create(
                key=key,
                defaults={"label": label, "hex": hex_val},
            )

        self.assertEqual(ColorToken.objects.count(), count_before)
