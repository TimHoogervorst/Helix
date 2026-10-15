"""Behavior contracts for decoupling bundled/Core code from optional sources."""

from unittest.mock import patch

from django.test import TestCase


class RegisteredSourceContractsTests(TestCase):
    def test_prefix_map_has_no_entry_prefix_without_registered_entry_schema(self):
        from helix_core.mentions.prefix_resolver import _build_prefix_map
        from helix_core.models import SchemaType

        schema_type = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="bundled.lims.models.Entity",
        )
        from helix_core.models import Schema

        Schema.objects.create(name="Entity", prefix="BLOOD", schema_type=schema_type)

        assert "E" not in _build_prefix_map()

    def test_source_status_service_only_visits_registered_sources(self):
        from bundled.lims.services import cascade_source_status
        from helix_core.mod_system.registry import registry

        with patch.object(registry, "content_source_models", return_value=()):
            # An unregistered external source must not be imported or queried.
            assert cascade_source_status(source_type_id=999999, source_id=1, status="finished") == 0
