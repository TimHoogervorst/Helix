"""
Shared test utilities for the ELN test suite.

Import ``_CreateEntryMixin``, ``TEXT_DOC``, and ``ALT_DOC`` from here
so they're defined once across all ELN test modules.
"""

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


class _CreateEntryMixin:
    """Mixin providing ``_create_entry`` for tests that need an entry via API."""

    def _create_entry(self, **kwargs):
        response = self.client.post(
            "/api/eln/entries/",
            {
                "title": kwargs.get("title", "Test Entry"),
                "content": kwargs.get("content", TEXT_DOC),
                "folder": self.folder.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data
