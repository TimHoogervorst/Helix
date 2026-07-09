"""
Tests for ``core.mentions.prefix_resolver`` — resolution, icon, and caching.
"""
from django.core.cache import cache
from django.test import TestCase

from core.tests.base import BaseServiceTestCase
from core.tests.factories import EMPTY_DOC
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
from core_mods.eln.models import NotebookEntry


# ── Resolution tests ────────────────────────────────────────────────────────

class ResolveDisplayIdTests(BaseServiceTestCase):
    """resolve_display_id() — static + dynamic prefix resolution."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def test_resolves_entry_by_static_prefix(self):
        """``E1`` resolves to a NotebookEntry."""
        entry = NotebookEntry.objects.create(
            title="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        result = resolve_display_id(entry.display_id)
        self.assertIsNotNone(result)
        instance, ct = result
        self.assertIsInstance(instance, NotebookEntry)
        self.assertEqual(instance.pk, entry.pk)
        self.assertEqual(ct.model, "notebookentry")

    def test_resolves_entity_by_dynamic_prefix(self):
        """``BLOOD1`` resolves to an Entity after creating the EntityType."""
        from core_mods.lims.models import Entity, EntityType

        blood_type = EntityType.objects.create(
            name="Blood Sample", prefix="BLOOD", columns=[]
        )
        entity = Entity.objects.create(
            name="Patient Blood #1",
            entity_type=blood_type,
            folder=self.folder,
            created_by=self.user,
        )
        # Invalidate cache so new prefix is picked up
        invalidate_prefix_cache(sender=EntityType)

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
        entry = NotebookEntry.objects.create(
            title="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        self.assertIsNotNone(resolve_display_id(entry.display_id.lower()))

    def test_prefix_extraction_mixed_case(self):
        """``Blood1`` → prefix extracted as ``BLOOD``."""
        from core_mods.lims.models import Entity, EntityType

        blood_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD", columns=[]
        )
        entity = Entity.objects.create(
            name="Sample", entity_type=blood_type,
            folder=self.folder, created_by=self.user,
        )
        invalidate_prefix_cache(sender=EntityType)

        # Use the actual display_id (e.g. "BLOOD1") but with mixed-case
        # prefix, to test case-insensitive prefix extraction.  We derive
        # the numeric suffix from the real display_id so this works even
        # when PK sequences have been consumed by prior tests (PostgreSQL
        # does not reset sequences on transaction rollback).
        numeric_suffix = entity.display_id[len(blood_type.prefix):]
        result = resolve_display_id("Blood" + numeric_suffix)
        self.assertIsNotNone(result)
        instance, _ = result
        self.assertEqual(instance.pk, entity.pk)


# ── Icon tests ──────────────────────────────────────────────────────────────

class GetIconTests(BaseServiceTestCase):
    """get_icon() returns the correct emoji for each model type."""

    def test_entry_icon_is_page(self):
        """ELN entries get the ``📄`` icon."""
        entry = NotebookEntry.objects.create(
            title="Note", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        self.assertEqual(get_icon(entry, "entry"), "📄")

    def test_entity_icon_from_entity_type(self):
        """Entities use the icon configured on their EntityType."""
        from core_mods.lims.models import Entity, EntityType

        blood_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD", icon="🩸", columns=[]
        )
        entity = Entity.objects.create(
            name="Sample", entity_type=blood_type,
            folder=self.folder, created_by=self.user,
        )
        self.assertEqual(get_icon(entity, "entity"), "🩸")

    def test_entity_default_icon(self):
        """Entities without a configured icon get ``🧪``."""
        from core_mods.lims.models import Entity, EntityType

        plain_type = EntityType.objects.create(
            name="Plain", prefix="PLAIN", columns=[]
        )
        entity = Entity.objects.create(
            name="Sample", entity_type=plain_type,
            folder=self.folder, created_by=self.user,
        )
        self.assertEqual(get_icon(entity, "entity"), "🧪")


# ── Prefix map completeness tests ───────────────────────────────────────────

class PrefixMapTests(BaseServiceTestCase):
    """get_prefix_map() / _build_prefix_map() correctness."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def test_includes_static_entries(self):
        """The static ``E`` → NotebookEntry mapping is present."""
        pmap = get_prefix_map()
        self.assertIn("E", pmap)
        self.assertEqual(pmap["E"], NotebookEntry)

    def test_includes_dynamic_entity_prefixes(self):
        """EntityType-created prefixes appear in the map."""
        from core_mods.lims.models import EntityType

        EntityType.objects.create(
            name="Blood", prefix="BLOOD", columns=[]
        )
        invalidate_prefix_cache(sender=EntityType)

        pmap = get_prefix_map()
        self.assertIn("BLOOD", pmap)

    def test_build_prefix_map_is_uncached(self):
        """``_build_prefix_map()`` always hits the database."""
        from core_mods.lims.models import EntityType

        pmap1 = _build_prefix_map()
        EntityType.objects.create(name="New", prefix="NEW", columns=[])
        pmap2 = _build_prefix_map()
        self.assertNotIn("NEW", pmap1)
        self.assertIn("NEW", pmap2)


# ── Caching tests ───────────────────────────────────────────────────────────

class PrefixCacheTests(BaseServiceTestCase):
    """get_prefix_map() / get_model_type_map() caching behaviour."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def test_prefix_map_is_cached(self):
        """Second call to get_prefix_map() uses cache, not DB."""
        get_prefix_map()  # prime cache
        # Second call must not hit the database — it returns cached data
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        with CaptureQueriesContext(connection) as ctx:
            get_prefix_map()
        self.assertEqual(len(ctx), 0, "get_prefix_map() hit DB on second call")

    def test_cache_invalidates_on_entity_type_save(self):
        """Creating an EntityType invalidates the cache."""
        from core_mods.lims.models import EntityType

        # Create initial map (populates cache)
        get_prefix_map()

        # Simulate signal
        EntityType.objects.create(name="Blood", prefix="BLOOD", columns=[])
        invalidate_prefix_cache(sender=EntityType)

        pmap = get_prefix_map()
        self.assertIn("BLOOD", pmap)

    def test_cache_invalidates_on_entity_type_delete(self):
        """Deleting an EntityType invalidates the cache."""
        from core_mods.lims.models import EntityType

        et = EntityType.objects.create(name="Blood", prefix="BLOOD", columns=[])
        invalidate_prefix_cache(sender=EntityType)
        get_prefix_map()  # re-populate with BLOOD
        self.assertIn("BLOOD", get_prefix_map())

        et.delete()
        invalidate_prefix_cache(sender=EntityType)

        pmap = get_prefix_map()
        self.assertNotIn("BLOOD", pmap)

    def test_model_type_map_is_cached(self):
        """Second call to get_model_type_map() returns same data from cache."""
        mmap1 = get_model_type_map()
        mmap2 = get_model_type_map()
        # LocMemCache deep-copies on get, so use assertEqual, not assertIs
        self.assertEqual(mmap1, mmap2)

    def test_model_type_map_includes_entry_and_entity(self):
        """get_model_type_map() includes both entry and entity types."""
        mmap = get_model_type_map()
        self.assertIn(NotebookEntry, mmap)
        self.assertEqual(mmap[NotebookEntry], "entry")

        from core_mods.lims.models import Entity
        self.assertIn(Entity, mmap)
        self.assertEqual(mmap[Entity], "entity")


# ── Workspace-aware resolution tests ─────────────────────────────────────────

class WorkspaceLookupTests(BaseServiceTestCase):
    """get_workspace_id() — prefix→workspace_id mapping."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()

    def test_returns_eln_for_e_prefix(self):
        """The 'E' prefix maps to workspace 'eln' (from migration backfill)."""
        self.assertEqual(get_workspace_id("E"), "eln")

    def test_returns_none_for_unknown_prefix(self):
        """An unregistered prefix returns None."""
        self.assertIsNone(get_workspace_id("ZZZ"))

    def test_case_insensitive_prefix(self):
        """`e` resolves the same as `E`."""
        self.assertEqual(get_workspace_id("e"), "eln")

    def test_entity_type_prefix_returns_lims(self):
        """A dynamic entity type prefix returns workspace 'lims'."""
        from core_mods.lims.models import EntityType, RegisteredEntityType
        from django.contrib.contenttypes.models import ContentType

        # Create the EntityType and a RegisteredEntityType (mimicking registration).
        EntityType.objects.create(name="Blood", prefix="BLOOD", columns=[])
        entity_ct = ContentType.objects.get(app_label="lims", model="entity")
        RegisteredEntityType.objects.create(
            prefix="BLOOD",
            content_type=entity_ct,
            workspace_id="lims",
            display_name="Blood",
        )
        # Signal should have invalidated cache; but manually invalidate for safety.
        invalidate_prefix_cache(sender=RegisteredEntityType)

        self.assertEqual(get_workspace_id("BLOOD"), "lims")


class WorkspaceMapCacheTests(BaseServiceTestCase):
    """get_workspace_id() caching behaviour."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()

    def test_workspace_map_is_cached(self):
        """Second call to get_workspace_id() uses cache, not DB."""
        get_workspace_id("E")  # prime cache

        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        with CaptureQueriesContext(connection) as ctx:
            get_workspace_id("E")
        self.assertEqual(len(ctx), 0, "get_workspace_id() hit DB on second call")

    def test_cache_invalidates_on_registered_entity_type_save(self):
        """Creating a RegisteredEntityType invalidates the workspace cache."""
        from core_mods.lims.models import RegisteredEntityType
        from django.contrib.contenttypes.models import ContentType

        # Prime cache
        get_workspace_id("E")

        # Create a new registration
        entity_ct = ContentType.objects.get(app_label="lims", model="entity")
        RegisteredEntityType.objects.create(
            prefix="DNA",
            content_type=entity_ct,
            workspace_id="lims",
            display_name="DNA",
        )

        self.assertEqual(get_workspace_id("DNA"), "lims")

    def test_cache_invalidates_on_registered_entity_type_delete(self):
        """Deleting a RegisteredEntityType invalidates the workspace cache."""
        from core_mods.lims.models import RegisteredEntityType
        from django.contrib.contenttypes.models import ContentType

        entity_ct = ContentType.objects.get(app_label="lims", model="entity")
        ret = RegisteredEntityType.objects.create(
            prefix="DNA",
            content_type=entity_ct,
            workspace_id="lims",
            display_name="DNA",
        )
        invalidate_prefix_cache(sender=RegisteredEntityType)
        get_workspace_id("DNA")  # populate cache
        self.assertEqual(get_workspace_id("DNA"), "lims")

        ret.delete()
        # The post_delete signal should invalidate the cache.

        self.assertIsNone(get_workspace_id("DNA"))
