"""Tests for the Metric Card API endpoints in the home mod."""

from core.models import User
from core.tests.base import BaseTestCase
from mods.home.models import Card
from mods.lims.models import LimsView, Metric


class CardApiTests(BaseTestCase):
    """Card CRUD, list, fork, and global card protection."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from helix_core.models import SchemaType

        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.view = LimsView.objects.create(
            owner=self.user, name="Test View", is_public=False,
            filter_state={"status": "in_progress", "columns": []},
        )
        self.metric = Metric.objects.create(
            owner=self.user, view=self.view,
            aggregate_function="count", column=None,
            name="Count — Test View",
        )

    # ── List ───────────────────────────────────────────────────────────

    def test_list_returns_global_and_personal_cards(self):
        """GET /api/home/cards/?surface=home returns global ∪ personal."""
        global_card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global Card",
        )
        another = User.objects.create_user(username="other", password="pass")
        alt_view = LimsView.objects.create(
            owner=another, name="Alt", is_public=False,
            filter_state={"columns": []},
        )
        alt_metric = Metric.objects.create(
            owner=another, view=alt_view, aggregate_function="count",
            column=None,
        )
        Card.objects.create(
            owner=another, metric=alt_metric, surface="home", order=1,
            label="Other's Card",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/home/cards/?surface=home")
        self.assertEqual(response.status_code, 200)
        ids = [c["id"] for c in response.data]
        self.assertIn(global_card.id, ids)
        self.assertNotIn(2, ids)

    def test_list_returns_only_global_for_anonymous(self):
        """Anonymous users see only global cards."""
        Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global",
        )
        self.client.force_authenticate(user=self.user)
        Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=1,
            label="Personal",
        )
        self.client.logout()
        response = self.client.get("/api/home/cards/?surface=home")
        self.assertEqual(response.status_code, 200)
        labels = [c["label"] for c in response.data]
        self.assertIn("Global", labels)
        self.assertNotIn("Personal", labels)

    def test_list_filters_by_surface(self):
        """A different surface query param returns only cards for that surface."""
        Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Home Card",
        )
        Card.objects.create(
            owner=None, metric=self.metric, surface="profile", order=0,
            label="Profile Card",
        )
        response = self.client.get("/api/home/cards/?surface=profile")
        self.assertEqual(response.status_code, 200)
        labels = [c["label"] for c in response.data]
        self.assertIn("Profile Card", labels)
        self.assertNotIn("Home Card", labels)

    def test_personal_cards_are_isolated_per_surface(self):
        """A personal card created on one surface never appears on the other."""
        self.client.force_authenticate(user=self.user)
        profile_card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="profile", order=0,
            label="My Profile Card",
        )
        home_card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="My Home Card",
        )

        response = self.client.get("/api/home/cards/?surface=profile")
        self.assertEqual(response.status_code, 200)
        ids = [c["id"] for c in response.data]
        self.assertIn(profile_card.id, ids)
        self.assertNotIn(home_card.id, ids)

        response = self.client.get("/api/home/cards/?surface=home")
        self.assertEqual(response.status_code, 200)
        ids = [c["id"] for c in response.data]
        self.assertIn(home_card.id, ids)
        self.assertNotIn(profile_card.id, ids)

    def test_list_ordered_by_order_field(self):
        """Cards are returned in order by the order field."""
        Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=2,
            label="Third",
        )
        Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="First",
        )
        Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=1,
            label="Second",
        )
        response = self.client.get("/api/home/cards/?surface=home")
        self.assertEqual(response.status_code, 200)
        labels = [c["label"] for c in response.data]
        self.assertEqual(labels, ["First", "Second", "Third"])

    # ── Create ─────────────────────────────────────────────────────────

    def test_create_personal_card(self):
        """POST creates a personal card owned by the caller."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/home/cards/",
            {
                "metric": self.metric.id,
                "surface": "home",
                "order": 0,
                "label": "My Card",
                "icon": "beaker",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["label"], "My Card")
        self.assertEqual(response.data["icon"], "beaker")
        self.assertEqual(response.data["owner_username"], self.user.username)
        self.assertFalse(response.data["is_global"])

    def test_create_card_requires_auth(self):
        """Unauthenticated POST is rejected."""
        response = self.client.post(
            "/api/home/cards/",
            {
                "metric": self.metric.id,
                "surface": "home",
                "order": 0,
                "label": "Nope",
                "icon": "beaker",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── Retrieve ───────────────────────────────────────────────────────

    def test_retrieve_card(self):
        """GET a single card returns its fields."""
        self.client.force_authenticate(user=self.user)
        card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="My Card", icon="beaker",
        )
        response = self.client.get(f"/api/home/cards/{card.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], card.id)
        self.assertEqual(response.data["label"], "My Card")

    def test_retrieve_global_card(self):
        """Anyone can retrieve a global card."""
        card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global",
        )
        response = self.client.get(f"/api/home/cards/{card.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_global"])

    # ── Update (personal cards) ────────────────────────────────────────

    def test_owner_can_update_own_card(self):
        """Owner can PATCH their personal card."""
        self.client.force_authenticate(user=self.user)
        card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="Before", icon="beaker",
        )
        response = self.client.patch(
            f"/api/home/cards/{card.id}/",
            {"label": "After", "order": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["label"], "After")
        self.assertEqual(response.data["order"], 5)

    def test_non_owner_cannot_update(self):
        """Another user cannot modify someone else's card (404 — not in queryset)."""
        card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="Mine",
        )
        other = User.objects.create_user(username="other", password="pass")
        self.client.force_authenticate(user=other)
        response = self.client.patch(
            f"/api/home/cards/{card.id}/",
            {"label": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    # ── Delete (personal cards) ────────────────────────────────────────

    def test_owner_can_delete_own_card(self):
        """Owner can DELETE their personal card."""
        self.client.force_authenticate(user=self.user)
        card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="Deletable",
        )
        response = self.client.delete(f"/api/home/cards/{card.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Card.objects.filter(id=card.id).exists())

    def test_non_owner_cannot_delete(self):
        """Another user cannot delete someone else's card (404 — not in queryset)."""
        card = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="Mine",
        )
        other = User.objects.create_user(username="other", password="pass")
        self.client.force_authenticate(user=other)
        response = self.client.delete(f"/api/home/cards/{card.id}/")
        self.assertEqual(response.status_code, 404)

    # ── Global card protection ─────────────────────────────────────────

    def test_cannot_update_global_card(self):
        """PATCH on a global card returns 403."""
        self.client.force_authenticate(user=self.user)
        card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global",
        )
        response = self.client.patch(
            f"/api/home/cards/{card.id}/",
            {"label": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_cannot_delete_global_card(self):
        """DELETE on a global card returns 403."""
        self.client.force_authenticate(user=self.user)
        card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global",
        )
        response = self.client.delete(f"/api/home/cards/{card.id}/")
        self.assertEqual(response.status_code, 403)

    # ── Fork ───────────────────────────────────────────────────────────

    def test_fork_global_card_creates_personal_copy(self):
        """Forking a global card creates a personal owned copy."""
        self.client.force_authenticate(user=self.user)
        global_card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global Original", icon="scroll-text",
            formatting={"rules": [], "default": {"color": "flask"}},
        )
        response = self.client.post(
            f"/api/home/cards/{global_card.id}/fork/",
        )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["is_global"])
        self.assertEqual(response.data["owner_username"], self.user.username)
        self.assertEqual(response.data["label"], "Global Original")
        self.assertEqual(response.data["icon"], "scroll-text")
        self.assertEqual(response.data["formatting"]["default"]["color"], "flask")
        self.assertEqual(response.data["surface"], "home")
        self.assertEqual(response.data["metric"], self.metric.id)

    def test_fork_does_not_mutate_source(self):
        """The global card is unchanged after forking."""
        self.client.force_authenticate(user=self.user)
        global_card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Original",
        )
        self.client.post(f"/api/home/cards/{global_card.id}/fork/")
        global_card.refresh_from_db()
        self.assertIsNone(global_card.owner)
        self.assertEqual(global_card.label, "Original")

    def test_fork_requires_auth(self):
        """Unauthenticated fork returns 403."""
        card = Card.objects.create(
            owner=None, metric=self.metric, surface="home", order=0,
            label="Global",
        )
        response = self.client.post(f"/api/home/cards/{card.id}/fork/")
        self.assertEqual(response.status_code, 403)

    def test_fork_personal_card(self):
        """Forking a personal card creates another personal copy owned by the forker."""
        self.client.force_authenticate(user=self.user)
        personal = Card.objects.create(
            owner=self.user, metric=self.metric, surface="home", order=0,
            label="Personal Original",
        )
        response = self.client.post(
            f"/api/home/cards/{personal.id}/fork/",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["owner_username"], self.user.username)
        self.assertEqual(response.data["label"], "Personal Original")

    def test_can_create_global_card_via_api(self):
        """POST with no owner creates a personal card anyway (owner is forced to caller)."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/home/cards/",
            {
                "metric": self.metric.id,
                "surface": "home",
                "order": 0,
                "label": "Not Global",
                "icon": "beaker",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["owner_username"], self.user.username)
        self.assertFalse(response.data["is_global"])


class CardSeedTests(BaseTestCase):
    """Tests for the boot-seeded global cards."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from helix_core.models import SchemaType

        cls.admin = User.objects.create_user(
            username="admin", password="pass",
            is_superuser=True, is_staff=True, is_active=True,
        )
        SchemaType.objects.create(
            display_name="Entry", workspace_id="eln",
            model="mods.eln.models.NotebookEntry",
        )
        SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        from mods.lims.mod import _seed_builtin_metrics
        _seed_builtin_metrics()

    def test_seed_creates_two_global_cards(self):
        """After seeding, exactly 2 global cards exist for surface home."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()

        cards = Card.objects.filter(owner__isnull=True, surface="home")
        self.assertEqual(cards.count(), 2)

    def test_seed_creates_two_global_cards_for_profile_surface(self):
        """After seeding, exactly 2 global cards exist for surface profile."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()

        cards = Card.objects.filter(owner__isnull=True, surface="profile")
        self.assertEqual(cards.count(), 2)

    def test_seeded_profile_cards_have_correct_properties(self):
        """Profile-surface seeded cards mirror the home labels, icons, and order."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()

        cards = Card.objects.filter(owner__isnull=True, surface="profile").order_by("order")
        labels = [c.label for c in cards]
        self.assertIn("In-progress entries", labels)
        self.assertIn("Entities created", labels)

        in_progress_card = Card.objects.get(
            owner__isnull=True, surface="profile", label="In-progress entries",
        )
        self.assertEqual(in_progress_card.icon, "scroll-text")
        self.assertEqual(in_progress_card.order, 0)
        self.assertIsNotNone(in_progress_card.metric)

        entities_card = Card.objects.get(
            owner__isnull=True, surface="profile", label="Entities created",
        )
        self.assertEqual(entities_card.icon, "test-tubes")
        self.assertEqual(entities_card.order, 1)
        self.assertIsNotNone(entities_card.metric)

    def test_seed_is_idempotent(self):
        """Calling the seed twice does not duplicate cards."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()
        count_before = Card.objects.filter(owner__isnull=True).count()

        _seed_global_cards()
        self.assertEqual(
            Card.objects.filter(owner__isnull=True).count(),
            count_before,
        )

    def test_seeded_cards_have_correct_properties(self):
        """Seeded cards have the expected labels, icons, and references."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()

        cards = Card.objects.filter(owner__isnull=True, surface="home").order_by("order")
        labels = [c.label for c in cards]
        self.assertIn("In-progress entries", labels)
        self.assertIn("Entities created", labels)

        in_progress_card = Card.objects.get(
            owner__isnull=True, surface="home", label="In-progress entries",
        )
        self.assertEqual(in_progress_card.icon, "scroll-text")
        self.assertEqual(in_progress_card.order, 0)
        self.assertIsNotNone(in_progress_card.metric)

        entities_card = Card.objects.get(
            owner__isnull=True, surface="home", label="Entities created",
        )
        self.assertEqual(entities_card.icon, "test-tubes")
        self.assertEqual(entities_card.order, 1)
        self.assertIsNotNone(entities_card.metric)

    def test_seeded_cards_formatting_has_default_shape(self):
        """Seeded cards have the canonical formatting blob structure."""
        from mods.home.mod import _seed_global_cards

        _seed_global_cards()

        card = Card.objects.filter(owner__isnull=True, surface="home").first()
        self.assertIsNotNone(card)
        fmt = card.formatting
        self.assertIsInstance(fmt, dict)
        self.assertIn("rules", fmt)
        self.assertIsInstance(fmt["rules"], list)
        self.assertIn("default", fmt)
        self.assertIn("color", fmt["default"])

    def test_seed_safe_when_no_admin(self):
        """Seed does not raise when no admin user exists (DB-unavailable-safe)."""
        from core.models import User
        from mods.home.mod import _seed_global_cards

        User.objects.filter(is_superuser=True).update(is_active=False)

        try:
            _seed_global_cards()
        except Exception:
            self.fail("_seed_global_cards() raised an exception with no admin user.")
