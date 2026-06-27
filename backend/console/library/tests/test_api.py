"""
Tests for the Library API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from core.models import Folder
from core.tests.base import BaseTestCase
from core.tests.factories import EMPTY_DOC
from workspaces.eln.models import NotebookEntry


class LibraryApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()

        # Create folder structure:
        #   root/
        #     Experiments/
        #       Q1/
        #     Protocols/
        self.experiments_folder = Folder.objects.create(
            name="Experiments", parent=None
        )
        self.nested_folder = Folder.objects.create(
            name="Q1", parent=self.experiments_folder
        )
        Folder.objects.create(name="Protocols", parent=None)

        # Entry at root (folder=None)
        self.root_entry = NotebookEntry.objects.create(
            title="Root Entry",
            content=EMPTY_DOC,
            folder=None,
            author=self.user,
        )

        # Entries in Experiments/
        self.exp_entry = NotebookEntry.objects.create(
            title="PCR Results",
            content=EMPTY_DOC,
            folder=self.experiments_folder,
            author=self.user,
        )

        # Entries in Experiments/Q1/
        self.nested_entry = NotebookEntry.objects.create(
            title="Q1 Analysis",
            content=EMPTY_DOC,
            folder=self.nested_folder,
            author=self.user,
        )

    # ── Basic responses ──────────────────────────────────────────────

    def test_root_returns_200(self):
        """GET /api/library/contents/ returns 200 with results."""
        response = self.client.get("/api/library/contents/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)

    def test_type_discriminator_present(self):
        """Every item in results has a ``type`` field."""
        response = self.client.get("/api/library/contents/")
        for item in response.data["results"]:
            self.assertIn("type", item)
            self.assertIn(item["type"], ["folder", "entry"])

    def test_folders_sorted_before_entries(self):
        """All folder items precede all entry items."""
        response = self.client.get("/api/library/contents/")
        results = response.data["results"]
        types = [item["type"] for item in results]
        # All folders should come before all entries
        if "entry" in types and "folder" in types:
            last_folder_idx = max(i for i, t in enumerate(types) if t == "folder")
            first_entry_idx = min(i for i, t in enumerate(types) if t == "entry")
            self.assertLess(last_folder_idx, first_entry_idx)

    def test_root_shows_top_level_items_only(self):
        """Root listing only shows items with parent=None."""
        response = self.client.get("/api/library/contents/")
        results = response.data["results"]

        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]

        # Should include root-level folders and entries
        self.assertIn("Experiments", folder_names)
        self.assertIn("Protocols", folder_names)
        self.assertIn("Root Entry", entry_titles)

        # Should NOT include nested items
        self.assertNotIn("Q1", folder_names)
        self.assertNotIn("PCR Results", entry_titles)
        self.assertNotIn("Q1 Analysis", entry_titles)

    # ── Path navigation ──────────────────────────────────────────────

    def test_nested_path_returns_correct_items(self):
        """?path=/Experiments returns only items inside that folder."""
        response = self.client.get(
            "/api/library/contents/?path=/Experiments"
        )
        results = response.data["results"]

        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]

        self.assertIn("Q1", folder_names)
        self.assertIn("PCR Results", entry_titles)
        self.assertNotIn("Experiments", folder_names)  # parent
        self.assertNotIn("Root Entry", entry_titles)

    def test_empty_folder_returns_empty_list(self):
        """Empty folder returns 200 with empty results."""
        response = self.client.get(
            "/api/library/contents/?path=/Protocols"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)

    def test_nonexistent_path_returns_404(self):
        """Nonexistent path returns 404."""
        response = self.client.get(
            "/api/library/contents/?path=/Nope"
        )
        self.assertEqual(response.status_code, 404)

    # ── Item shapes ──────────────────────────────────────────────────

    def test_folder_item_shape(self):
        """Folder items have the correct keys."""
        response = self.client.get("/api/library/contents/")
        folders = [r for r in response.data["results"] if r["type"] == "folder"]
        self.assertGreater(len(folders), 0)
        f = folders[0]
        self.assertEqual(f["type"], "folder")
        self.assertIn("id", f)
        self.assertIn("name", f)
        self.assertIn("parent", f)
        self.assertIn("created_at", f)

    def test_entry_item_shape(self):
        """Entry items have the correct keys."""
        response = self.client.get("/api/library/contents/")
        entries = [r for r in response.data["results"] if r["type"] == "entry"]
        self.assertGreater(len(entries), 0)
        e = entries[0]
        self.assertEqual(e["type"], "entry")
        self.assertIn("id", e)
        self.assertIn("display_id", e)
        self.assertIn("title", e)
        self.assertIn("folder", e)
        self.assertIn("folder_name", e)
        self.assertIn("author_username", e)
        self.assertIn("created_at", e)
        self.assertIn("updated_at", e)

    # ── Pagination ───────────────────────────────────────────────────

    def test_pagination_page_size(self):
        """Page returns at most page_size items."""
        # Create many entries at root to trigger pagination
        for i in range(55):
            NotebookEntry.objects.create(
                title=f"Bulk Entry {i}",
                content=EMPTY_DOC,
                folder=None,
                author=self.user,
            )

        response = self.client.get("/api/library/contents/?page_size=20")
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])
        self.assertGreater(response.data["count"], 20)

    def test_pagination_next_link(self):
        """``next`` is present when there are more items."""
        for i in range(55):
            NotebookEntry.objects.create(
                title=f"Page Entry {i}",
                content=EMPTY_DOC,
                folder=None,
                author=self.user,
            )

        response = self.client.get("/api/library/contents/")
        if response.data["count"] > 50:
            self.assertIsNotNone(response.data["next"])

    # ── Search ───────────────────────────────────────────────────────

    def test_search_filters_folders(self):
        """search=Exp filters folders by name."""
        response = self.client.get(
            "/api/library/contents/?search=Exp"
        )
        results = response.data["results"]
        folder_names = [r["name"] for r in results if r["type"] == "folder"]
        self.assertIn("Experiments", folder_names)
        self.assertNotIn("Protocols", folder_names)

    def test_search_filters_entries(self):
        """search=PCR filters entries by title or display_id."""
        response = self.client.get(
            "/api/library/contents/?path=/Experiments&search=PCR"
        )
        results = response.data["results"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]
        self.assertIn("PCR Results", entry_titles)
        self.assertNotIn("Q1 Analysis", entry_titles)

    def test_search_filters_entries_by_display_id(self):
        """search by display_id prefix finds matching entries."""
        display_id = self.exp_entry.display_id
        response = self.client.get(
            f"/api/library/contents/?path=/Experiments&search={display_id}"
        )
        results = response.data["results"]
        entry_titles = [r["title"] for r in results if r["type"] == "entry"]
        self.assertIn("PCR Results", entry_titles)

    def test_search_preserves_sort_order(self):
        """Search results still have folders before entries."""
        response = self.client.get(
            "/api/library/contents/?search=e"  # matches both folders and entries
        )
        results = response.data["results"]
        types = [item["type"] for item in results]
        if "entry" in types and "folder" in types:
            last_folder_idx = max(i for i, t in enumerate(types) if t == "folder")
            first_entry_idx = min(i for i, t in enumerate(types) if t == "entry")
            self.assertLess(last_folder_idx, first_entry_idx)
