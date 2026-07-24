"""
Shared test utilities for the ELN test suite.

Import ``_CreateEntryMixin``, ``TEXT_DOC``, ``ALT_DOC``, and
``get_or_create_default_eln_schema`` from here so they're defined once
across all ELN test modules.
"""

from helix_core.models import Schema, SchemaType

TEXT_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Hello world"}],
        }
    ],
}

ALT_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Different content"}],
        }
    ],
}


def get_or_create_default_eln_schema():
    """Return the default ELN Schema, creating SchemaType + Schema if needed.

    Safe to call in ``setUp`` — uses ``get_or_create`` so it's idempotent.
    """
    schema_type, _ = SchemaType.objects.get_or_create(
        model="mods.eln.models.NotebookEntry",
        defaults={
            "display_name": "ELN Entry",
            "workspace_id": "eln",
        },
    )
    schema, _ = Schema.objects.get_or_create(
        schema_type=schema_type,
        is_default=True,
        defaults={
            "name": "Default",
            "prefix": "E",
        },
    )
    return schema


class _CreateEntryMixin:
    """Mixin providing ``_create_entry`` for tests that need an entry via API."""

    def setUp(self):
        super().setUp()
        # Ensure the default ELN Schema exists so the view's
        # perform_create can look it up via _get_default_schema().
        get_or_create_default_eln_schema()

    def _create_entry(self, **kwargs):
        response = self.client.post(
            "/api/eln/entries/",
            {
                "name": kwargs.get("name", "Test Entry"),
                "content": kwargs.get("content", TEXT_DOC),
                "folder": self.folder.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data
