"""
Tests for ``core.mentions.prefix_resolver`` — resolution, icon, and caching.
"""
from django.core.cache import cache
from django.test import TestCase

from core.tests.base import BaseServiceTestCase
from core.mentions.prefix_resolver import (
    get_icon,
    get_model_type_map,
    get_prefix_map,
    get_workspace_id,
    invalidate_prefix_cache,
    resolve_display_id,
    _build_prefix_map,
    _build_model_type_map,
)
from mods.eln.models import NotebookEntry


# ── Helpers ─────────────────────────────────────────────────────────────────

# Standard TipTap doc used as the "content" property for NotebookEntry.
_SIMPLE_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


def _create_eln_schema_type():
    """Create the ELN SchemaType + Schema (idempotent)."""
    from helix_core.models import Schema, SchemaType
    schema_type, _ = SchemaType.objects.get_or_create(
        model="mods.eln.models.NotebookEntry",
        defaults={
            "display_name": "ELN Entry",
            "workspace_id": "eln",
            "columns": [],
        },
    )
    Schema.objects.get_or_create(
        schema_type=schema_type,
        is_default=True,
        defaults={
            "name": "Default",
            "prefix": "E",
            "columns": [],
        },
    )
    return schema_type


def _create_lims_schema(*, prefix: str = "BLOOD", name: str = "Default"):
    """Create a SchemaType + Schema pair for LIMS tests."""
    from helix_core.models import Schema, SchemaType
    schema_type, _ = SchemaType.objects.get_or_create(
        model="mods.lims.models.Entity",
        defaults={
            "display_name": "Entity",
            "workspace_id": "lims",
            "columns": [],
        },
    )
    schema = Schema.objects.create(
        name=name,
        prefix=prefix,
        schema_type=schema_type,
        columns=[],
        is_default=True,
    )
    return schema


def _make_entry(**kwargs):
    """Create a NotebookEntry with required defaults."""
    defaults = dict(
        name="Test Entry",
        properties=_SIMPLE_DOC,
        status="in_progress",
    )
    defaults.update(kwargs)
    if "schema" not in defaults:
        from helix_core.models import Schema
        defaults["schema"] = Schema.objects.filter(prefix="E").first()
    return NotebookEntry.objects.create(**defaults)


# ── Resolution tests ────────────────────────────────────────────────────────

class ResolveDisplayIdTests(BaseServiceTestCase):
    """resolve_display_id() — static + dynamic prefix resolution."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()
        cache.clear()

    def test_resolves_entry_by_static_prefix(self):
        """``E1`` resolves to a NotebookEntry."""
        entry = _make_entry(folder=self.folder, author=self.user)
        result = resolve_display_id(entry.display_id)
        self.assertIsNotNone(result)
        instance, ct = result
        self.assertIsInstance(instance, NotebookEntry)
        self.assertEqual(instance.pk, entry.pk)
        self.assertEqual(ct.model, "notebookentry")

    def test_resolves_entity_by_dynamic_prefix(self):
        """``BLOOD1`` resolves to an Entity after creating the Schema."""
        from mods.lims.models import Entity

        blood_schema = _create_lims_schema(prefix="BLOOD")
        entity = Entity.objects.create(
            name="Patient Blood #1",
            schema=blood_schema,
            folder=self.folder,
            author=self.user,
        )
        # Invalidate cache so new prefix is picked up
        from helix_core.models import Schema
        invalidate_prefix_cache(sender=Schema)

        result = resolve_display_id(entity.display_id)
        self.assertIsNotNone(result)
        instance, ct = result
        self.assertEqual(instance.pk, entity.pk)
        self.assertEqual(ct.model, "entity")

    def test_returns_none_for_unknown_prefix(self):
        """``X1`` with no ``X`` prefix registered returns None."""
        self.assertIsNone(resolve_display_id("X1"))

    def test_returns_none_for_nonexistent_display_id(self):
        """``E99999`` where no entry has that ID returns None."""
        self.assertIsNone(resolve_display_id("E99999"))

    def test_prefix_extraction_case_insensitive(self):
        """``e1`` resolves the same as ``E1`` (prefix uppercased)."""
        entry = _make_entry(folder=self.folder, author=self.user)
        self.assertIsNotNone(resolve_display_id(entry.display_id.lower()))

    def test_prefix_extraction_mixed_case(self):
        """``Blood1`` → prefix extracted as ``BLOOD``."""
        from mods.lims.models import Entity

        blood_schema = _create_lims_schema(prefix="BLOOD")
        entity = Entity.objects.create(
            name="Sample", schema=blood_schema,
            folder=self.folder, author=self.user,
        )
        from helix_core.models import Schema
        invalidate_prefix_cache(sender=Schema)

        numeric_suffix = entity.display_id[len(blood_schema.prefix):]
        result = resolve_display_id("Blood" + numeric_suffix)
        self.assertIsNotNone(result)
        instance, _ = result
        self.assertEqual(instance.pk, entity.pk)


# ── Icon tests ──────────────────────────────────────────────────────────────

class GetIconTests(BaseServiceTestCase):
    """get_icon() returns the correct emoji for each model type."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()

    def test_entry_icon_is_page(self):
        """ELN entries get the ``📄`` icon."""
        entry = _make_entry(folder=self.folder, author=self.user)
        self.assertEqual(get_icon(entry, "entry"), "📄")

    def test_entity_default_icon(self):
        """Entities get the default ``🧪`` icon (Schema has no icon field)."""
        from mods.lims.models import Entity

        schema = _create_lims_schema(prefix="TEST")
        entity = Entity.objects.create(
            name="Sample", schema=schema,
            folder=self.folder, author=self.user,
        )
        self.assertEqual(get_icon(entity, "entity"), "🧪")


# ── Prefix map completeness tests ───────────────────────────────────────────

class PrefixMapTests(BaseServiceTestCase):
    """get_prefix_map() / _build_prefix_map() correctness."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()
        cache.clear()

    def test_includes_static_entries(self):
        """The static ``E`` → NotebookEntry mapping is present."""
        pmap = get_prefix_map()
        self.assertIn("E", pmap)
        self.assertEqual(pmap["E"], NotebookEntry)

    def test_includes_dynamic_entity_prefixes(self):
        """Schema-created prefixes appear in the map."""
        _create_lims_schema(prefix="BLOOD")
        from helix_core.models import Schema
        invalidate_prefix_cache(sender=Schema)

        pmap = get_prefix_map()
        self.assertIn("BLOOD", pmap)

    def test_build_prefix_map_is_uncached(self):
        """``_build_prefix_map()`` always hits the database."""
        pmap1 = _build_prefix_map()
        _create_lims_schema(prefix="NEW")
        pmap2 = _build_prefix_map()
        self.assertNotIn("NEW", pmap1)
        self.assertIn("NEW", pmap2)


# ── Caching tests ───────────────────────────────────────────────────────────

class PrefixCacheTests(BaseServiceTestCase):
    """get_prefix_map() / get_model_type_map() caching behaviour."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()
        cache.clear()

    def test_prefix_map_is_cached(self):
        """Second call to get_prefix_map() uses cache, not DB."""
        get_prefix_map()  # prime cache
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        with CaptureQueriesContext(connection) as ctx:
            get_prefix_map()
        self.assertEqual(len(ctx), 0, "get_prefix_map() hit DB on second call")

    def test_cache_invalidates_on_schema_save(self):
        """Creating a Schema invalidates the cache."""
        from helix_core.models import Schema

        get_prefix_map()
        _create_lims_schema(prefix="BLOOD")
        invalidate_prefix_cache(sender=Schema)

        pmap = get_prefix_map()
        self.assertIn("BLOOD", pmap)

    def test_cache_invalidates_on_schema_delete(self):
        """Deleting a Schema invalidates the cache."""
        from helix_core.models import Schema

        schema = _create_lims_schema(prefix="BLOOD")
        invalidate_prefix_cache(sender=Schema)
        get_prefix_map()
        self.assertIn("BLOOD", get_prefix_map())

        schema.delete()
        invalidate_prefix_cache(sender=Schema)

        pmap = get_prefix_map()
        self.assertNotIn("BLOOD", pmap)

    def test_model_type_map_is_cached(self):
        """Second call to get_model_type_map() returns same data from cache."""
        mmap1 = get_model_type_map()
        mmap2 = get_model_type_map()
        self.assertEqual(mmap1, mmap2)

    def test_model_type_map_includes_entry_and_entity(self):
        """get_model_type_map() includes both entry and entity types."""
        mmap = get_model_type_map()
        self.assertIn(NotebookEntry, mmap)
        self.assertEqual(mmap[NotebookEntry], "entry")

        from mods.lims.models import Entity
        self.assertIn(Entity, mmap)
        self.assertEqual(mmap[Entity], "entity")


# ── Workspace-aware resolution tests ─────────────────────────────────────────

class WorkspaceLookupTests(BaseServiceTestCase):
    """get_workspace_id() — prefix→workspace_id mapping."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()
        cache.clear()

    def test_returns_eln_for_e_prefix(self):
        """The 'E' prefix maps to workspace 'eln' (from ELN Schema)."""
        self.assertEqual(get_workspace_id("E"), "eln")

    def test_returns_none_for_unknown_prefix(self):
        """An unregistered prefix returns None."""
        self.assertIsNone(get_workspace_id("ZZZ"))

    def test_case_insensitive_prefix(self):
        """`e` resolves the same as `E`."""
        self.assertEqual(get_workspace_id("e"), "eln")

    def test_schema_prefix_returns_lims(self):
        """A Schema prefix returns its SchemaType's workspace_id."""
        _create_lims_schema(prefix="BLOOD")
        from helix_core.models import Schema
        invalidate_prefix_cache(sender=Schema)

        self.assertEqual(get_workspace_id("BLOOD"), "lims")


class WorkspaceMapCacheTests(BaseServiceTestCase):
    """get_workspace_id() caching behaviour."""

    def setUp(self):
        super().setUp()
        _create_eln_schema_type()
        cache.clear()

    def test_workspace_map_is_cached(self):
        """Second call to get_workspace_id() uses cache, not DB."""
        get_workspace_id("E")  # prime cache

        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        with CaptureQueriesContext(connection) as ctx:
            get_workspace_id("E")
        self.assertEqual(len(ctx), 0, "get_workspace_id() hit DB on second call")

    def test_cache_invalidates_on_schema_save(self):
        """Creating a Schema invalidates the workspace cache."""
        from helix_core.models import Schema

        get_workspace_id("E")
        _create_lims_schema(prefix="DNA")
        invalidate_prefix_cache(sender=Schema)

        self.assertEqual(get_workspace_id("DNA"), "lims")

    def test_cache_invalidates_on_schema_delete(self):
        """Deleting a Schema invalidates the workspace cache."""
        from helix_core.models import Schema

        schema = _create_lims_schema(prefix="DNA")
        invalidate_prefix_cache(sender=Schema)
        get_workspace_id("DNA")
        self.assertEqual(get_workspace_id("DNA"), "lims")

        schema.delete()
        invalidate_prefix_cache(sender=Schema)

        self.assertIsNone(get_workspace_id("DNA"))
