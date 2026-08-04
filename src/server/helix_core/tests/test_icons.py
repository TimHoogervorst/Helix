"""Tests for IconLibraryEntry model, API, SVG sanitization, and seed migration."""
from django.test import TestCase
from rest_framework.test import APIClient

from helix_core.models import IconLibraryEntry
from mods.tags.models import Tag


# ── SVG snippets for sanitization tests ────────────────────────────────

_SVG_CLEAN = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<circle cx="12" cy="12" r="10" fill="#D9B3E6"/>'
    "</svg>"
)

_SVG_WITH_SCRIPT = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<script>alert("xss")</script>'
    '<circle cx="12" cy="12" r="10"/>'
    "</svg>"
)

_SVG_WITH_ONCLICK = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<circle cx="12" cy="12" r="10" onclick="alert(1)"/>'
    "</svg>"
)

_SVG_WITH_EXTERNAL_HREF = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<use href="http://evil.com/bad.svg#x"/>'
    "</svg>"
)

_SVG_NO_VIEWBOX = (
    '<svg xmlns="http://www.w3.org/2000/svg">'
    '<circle cx="12" cy="12" r="10"/>'
    "</svg>"
)

_SVG_WITH_WIDTH_HEIGHT = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
    'width="100" height="100">'
    '<circle cx="12" cy="12" r="10"/>'
    "</svg>"
)

_SVG_NOT_SVG = "<html><body>not an svg</body></html>"

_SVG_INTERNAL_REF = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<defs><circle id="c" cx="12" cy="12" r="10"/></defs>'
    '<use href="#c"/>'
    "</svg>"
)


# ── Model tests ────────────────────────────────────────────────────────


class IconLibraryEntryModelTests(TestCase):
    def setUp(self):
        IconLibraryEntry.objects.all().delete()

    def test_create_lucide_entry(self):
        entry = IconLibraryEntry.objects.create(
            key="test-tube", label="Test Tube",
            kind="lucide", token="test-tube",
        )
        self.assertEqual(entry.key, "test-tube")
        self.assertEqual(entry.label, "Test Tube")
        self.assertEqual(entry.kind, "lucide")
        self.assertEqual(entry.token, "test-tube")
        self.assertEqual(entry.svg, "")

    def test_create_custom_entry(self):
        entry = IconLibraryEntry.objects.create(
            key="petri-dish", label="Petri Dish",
            kind="custom", svg=_SVG_CLEAN,
        )
        self.assertEqual(entry.key, "petri-dish")
        self.assertEqual(entry.kind, "custom")
        self.assertEqual(entry.token, "")
        self.assertIn("<svg", entry.svg)

    def test_str_includes_label_and_key(self):
        entry = IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        self.assertIn("DNA", str(entry))
        self.assertIn("dna", str(entry))

    def test_key_unique(self):
        IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        with self.assertRaises(Exception):
            IconLibraryEntry.objects.create(
                key="dna", label="Duplicate", kind="lucide", token="dna",
            )

    def test_ordering_by_label(self):
        IconLibraryEntry.objects.create(
            key="leaf", label="Leaf", kind="lucide", token="leaf",
        )
        IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        IconLibraryEntry.objects.create(
            key="circle", label="Circle", kind="lucide", token="circle",
        )
        labels = list(IconLibraryEntry.objects.values_list("label", flat=True))
        self.assertEqual(labels, ["Circle", "DNA", "Leaf"])


# ── API tests ──────────────────────────────────────────────────────────


class IconLibraryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        IconLibraryEntry.objects.all().delete()

    # ── List ──────────────────────────────────────────────────────────

    def test_list_empty(self):
        response = self.client.get("/api/icons/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_list_populated(self):
        IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        IconLibraryEntry.objects.create(
            key="circle", label="Circle", kind="lucide", token="circle",
        )
        response = self.client.get("/api/icons/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        keys = {e["key"] for e in response.data}
        self.assertIn("dna", keys)
        self.assertIn("circle", keys)
        for e in response.data:
            self.assertIn("id", e)
            self.assertIn("key", e)
            self.assertIn("label", e)
            self.assertIn("kind", e)

    # ── Create Lucide ─────────────────────────────────────────────────

    def test_create_lucide_entry(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "test-tube", "label": "Test Tube", "kind": "lucide", "token": "test-tube"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["key"], "test-tube")
        self.assertEqual(response.data["kind"], "lucide")
        self.assertEqual(response.data["token"], "test-tube")
        self.assertEqual(response.data["svg"], "")
        self.assertEqual(IconLibraryEntry.objects.count(), 1)

    def test_create_lucide_missing_token_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "test-tube", "label": "Test Tube", "kind": "lucide"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("token", response.data)

    def test_create_lucide_with_svg_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "test-tube", "label": "Test Tube", "kind": "lucide",
             "token": "test-tube", "svg": _SVG_CLEAN},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_create_duplicate_key_rejected(self):
        IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        response = self.client.post(
            "/api/icons/",
            {"key": "dna", "label": "Duplicate DNA", "kind": "lucide", "token": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("key", response.data)

    # ── Create Custom SVG ─────────────────────────────────────────────

    def test_create_custom_svg_accepts_clean_markup(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "petri-dish", "label": "Petri Dish", "kind": "custom", "svg": _SVG_CLEAN},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["key"], "petri-dish")
        self.assertEqual(response.data["kind"], "custom")
        self.assertIn("<svg", response.data["svg"])
        self.assertEqual(response.data["token"], "")

    def test_create_custom_missing_svg_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "petri-dish", "label": "Petri Dish", "kind": "custom"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_create_custom_with_token_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "petri-dish", "label": "Petri Dish", "kind": "custom",
             "svg": _SVG_CLEAN, "token": "petri-dish"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("token", response.data)

    # ── SVG Sanitization: Strip ───────────────────────────────────────

    def test_svg_with_script_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": _SVG_WITH_SCRIPT},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_with_onclick_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": _SVG_WITH_ONCLICK},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_with_external_href_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": _SVG_WITH_EXTERNAL_HREF},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_with_internal_ref_accepted(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "internal-ref", "label": "Internal Ref", "kind": "custom",
             "svg": _SVG_INTERNAL_REF},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("<svg", response.data["svg"])

    # ── SVG Sanitization: Reject ──────────────────────────────────────

    def test_svg_non_svg_root_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": _SVG_NOT_SVG},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_missing_viewbox_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": _SVG_NO_VIEWBOX},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_invalid_xml_rejected(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "bad", "label": "Bad", "kind": "custom", "svg": "<<<not xml>>>"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    def test_svg_oversize_rejected(self):
        big = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g>' + "X" * (50 * 1024) + "</g></svg>"
        response = self.client.post(
            "/api/icons/",
            {"key": "big", "label": "Big", "kind": "custom", "svg": big},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("svg", response.data)

    # ── SVG Sanitization: Strip width/height ──────────────────────────

    def test_svg_width_height_stripped(self):
        response = self.client.post(
            "/api/icons/",
            {"key": "scaled", "label": "Scaled", "kind": "custom",
             "svg": _SVG_WITH_WIDTH_HEIGHT},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        svg_out = response.data["svg"]
        self.assertNotIn('width="100"', svg_out)
        self.assertNotIn('height="100"', svg_out)
        self.assertIn("viewBox", svg_out)

    # ── Delete ────────────────────────────────────────────────────────

    def test_delete_icon(self):
        entry = IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        response = self.client.delete(f"/api/icons/{entry.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("usage_count", response.data)
        self.assertEqual(response.data["usage_count"], 0)
        self.assertFalse(IconLibraryEntry.objects.filter(pk=entry.id).exists())

    def test_delete_icon_in_use_reports_usage_count(self):
        entry = IconLibraryEntry.objects.create(
            key="dna", label="DNA", kind="lucide", token="dna",
        )
        Tag.objects.create(name="Genetics", color="enzyme", icon="dna")
        Tag.objects.create(name="PCR", color="flask", icon="dna")

        response = self.client.delete(f"/api/icons/{entry.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["usage_count"], 2)
        self.assertFalse(IconLibraryEntry.objects.filter(pk=entry.id).exists())

        self.assertEqual(Tag.objects.filter(icon="dna").count(), 2)

    def test_delete_nonexistent_icon(self):
        response = self.client.delete("/api/icons/99999/")
        self.assertEqual(response.status_code, 404)


# ── Seed migration tests ───────────────────────────────────────────────

_TAG_SEED_KEYS = frozenset({
    "circle", "dna", "rat", "leaf", "cog", "notebook", "user", "folder",
})

_CARD_SEED_KEYS = frozenset({
    "flask-conical", "scroll-text", "test-tubes", "alert-triangle",
    "activity", "bar-chart-3", "beaker", "circle-dollar-sign",
    "clock", "file-text", "thermometer", "trending-up", "check-circle",
})

_EXPECTED_SEED_COUNT = 100  # lowered from full count to account for dedup


class IconSeedTests(TestCase):
    def test_all_tag_icons_seeded(self):
        existing = set(IconLibraryEntry.objects.values_list("key", flat=True))
        self.assertTrue(
            _TAG_SEED_KEYS.issubset(existing),
            f"Missing tag seed icons: {_TAG_SEED_KEYS - existing}",
        )

    def test_all_card_icons_seeded(self):
        existing = set(IconLibraryEntry.objects.values_list("key", flat=True))
        self.assertTrue(
            _CARD_SEED_KEYS.issubset(existing),
            f"Missing card seed icons: {_CARD_SEED_KEYS - existing}",
        )

    def test_seeds_are_lucide_kind(self):
        for entry in IconLibraryEntry.objects.filter(key__in=_TAG_SEED_KEYS | _CARD_SEED_KEYS):
            self.assertEqual(entry.kind, "lucide", f"{entry.key} should be lucide")

    def test_seeds_have_labels(self):
        for key in _TAG_SEED_KEYS | _CARD_SEED_KEYS:
            entry = IconLibraryEntry.objects.get(key=key)
            self.assertTrue(entry.label, f"{key} should have a non-empty label")

    def test_seeds_have_tokens(self):
        for key in _TAG_SEED_KEYS | _CARD_SEED_KEYS:
            entry = IconLibraryEntry.objects.get(key=key)
            self.assertEqual(entry.token, key, f"{key} token should match key")

    def test_dna_label_is_uppercase(self):
        entry = IconLibraryEntry.objects.get(key="dna")
        self.assertEqual(entry.label, "DNA")

    def test_existing_tag_icon_keys_resolve_against_seeds(self):
        for key in _TAG_SEED_KEYS:
            self.assertTrue(
                IconLibraryEntry.objects.filter(key=key).exists(),
                f"Seed icon '{key}' not found — existing tags would break.",
            )

    def test_existing_card_icon_keys_resolve_against_seeds(self):
        for key in _CARD_SEED_KEYS:
            self.assertTrue(
                IconLibraryEntry.objects.filter(key=key).exists(),
                f"Seed icon '{key}' not found — existing cards would break.",
            )


class IconSeedIdempotencyTests(TestCase):
    def test_duplicate_run_does_not_create_duplicates(self):
        import importlib
        mod = importlib.import_module(
            "helix_core.migrations.0007_icon_library_entry"
        )
        ALL_ICONS = mod.ALL_ICONS

        count_before = IconLibraryEntry.objects.count()

        for token in ALL_ICONS:
            label = mod._token_to_label(token)
            IconLibraryEntry.objects.get_or_create(
                key=token,
                defaults={"label": label, "kind": "lucide", "token": token, "svg": ""},
            )

        self.assertEqual(IconLibraryEntry.objects.count(), count_before)
