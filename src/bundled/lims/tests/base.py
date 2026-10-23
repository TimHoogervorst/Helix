"""LIMS endpoint fixtures without production schema/metric seeding."""

from unittest.mock import patch

from bundled.access.access.scoping import visible_rows_q
from bundled.lims.models import Entity
from bundled.lims.serializers import EntitySerializer
from helix_core.core.tests.base import BundledApiTestCase
from helix_core.mod_system.registry import registry


class LimsApiTestCase(BundledApiTestCase):
    def setUp(self):
        super().setUp()
        # Preserve the singleton's identity for modules that imported it, and
        # restore every modified store even when a test fails.
        for name in ("_registered_models", "_source_kinds", "_content_sources"):
            self.enterContext(patch.object(registry, name, {}))
        self.enterContext(patch.object(registry, "_capability_registrations", {
            kind: dict(entries)
            for kind, entries in registry._capability_registrations.items()
        }))
        registry.register_model_reference("helix.lims:entity", Entity)
        registry.register_content_source(
            "helix.lims:entity", "helix.lims:entity",
            visibility_query=lambda request, queryset: queryset.filter(visible_rows_q(request.user)),
            serializer=EntitySerializer,
            display_metadata={"label": "Entity", "workspace_id": "lims"},
            hub_visible=True,
        )
