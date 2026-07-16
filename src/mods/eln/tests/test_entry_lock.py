"""
Tests for EntryLock model and conflict-prevention endpoints.

Exercises the full lock lifecycle: acquire (first-time, refresh, stale-steal,
conflict), release (owner, no-lock, not-owner), status (locked, unlocked),
write enforcement in perform_update, stale expiry, and cascade delete.
"""
from django.test import override_settings
from django.utils import timezone

from core.tests.base import BaseTestCase
from mods.eln.models import NotebookEntry, EntryLock

from .factories import TEXT_DOC, ALT_DOC, _CreateEntryMixin


# ── Lock acquire tests ────────────────────────────────────────────────────────


class LockAcquireTests(_CreateEntryMixin, BaseTestCase):
    """POST /api/eln/entries/{display_id}/lock/ — acquire or refresh."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def test_first_acquire_returns_201(self):
        """First lock acquisition → 201 Created."""
        response = self.client.post(self.lock_url)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["locked"])
        self.assertEqual(response.data["held_by"], self.user.id)

    def test_same_user_reacquire_returns_200(self):
        """Same user re-acquiring → 200 OK (refresh)."""
        self.client.post(self.lock_url)
        response = self.client.post(self.lock_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["locked"])
        self.assertEqual(response.data["held_by"], self.user.id)
        self.assertIsNotNone(response.data["acquired_at"])
        self.assertIsNotNone(response.data["last_activity_at"])

    def test_other_user_blocked_423(self):
        """Different user tries to acquire when lock is active → 423."""
        self.client.post(self.lock_url)

        other = self._create_second_user()
        self.client.force_authenticate(user=other)
        response = self.client.post(self.lock_url)
        self.assertEqual(response.status_code, 423)
        self.assertTrue(response.data["locked"])

    def test_stale_lock_stolen_201(self):
        """Stale lock is stolen by new user → 201 Created."""
        self.client.post(self.lock_url)

        # Make the lock stale by backdating it (use QuerySet.update()
        # to bypass auto_now=True on last_activity_at).
        lock = EntryLock.objects.get()
        EntryLock.objects.filter(pk=lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=10),
        )

        other = self._create_second_user()
        self.client.force_authenticate(user=other)
        response = self.client.post(self.lock_url)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["held_by"], other.id)

    def test_same_user_acquires_stale_lock_returns_200(self):
        """Same user on their own stale lock → 200 (refresh, not steal)."""
        self.client.post(self.lock_url)

        lock = EntryLock.objects.get()
        EntryLock.objects.filter(pk=lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=10),
        )

        # Same user re-acquires → 200, lock refreshed.
        response = self.client.post(self.lock_url)
        self.assertEqual(response.status_code, 200)

    # ── helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _create_second_user():
        from core.models import User

        return User.objects.create_user(
            username="other_user",
            password="testpass",
        )


# ── Lock release tests ────────────────────────────────────────────────────────


class LockReleaseTests(_CreateEntryMixin, BaseTestCase):
    """DELETE /api/eln/entries/{display_id}/lock/ — release lock."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def test_owner_release_returns_204(self):
        """Lock holder releasing → 204 No Content."""
        self.client.post(self.lock_url)
        response = self.client.delete(self.lock_url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(EntryLock.objects.exists())

    def test_release_when_no_lock_returns_204(self):
        """Releasing when no lock exists → 204 (idempotent)."""
        response = self.client.delete(self.lock_url)
        self.assertEqual(response.status_code, 204)

    def test_non_owner_release_returns_204(self):
        """Non-holder trying to release → 204 (idempotent no-op)."""
        self.client.post(self.lock_url)

        other = LockAcquireTests._create_second_user()
        self.client.force_authenticate(user=other)
        response = self.client.delete(self.lock_url)
        self.assertEqual(response.status_code, 204)

    def test_release_after_steal(self):
        """After another user steals a stale lock, original holder cannot release."""
        self.client.post(self.lock_url)

        # Make it stale (use QuerySet.update() to bypass auto_now=True).
        lock = EntryLock.objects.get()
        EntryLock.objects.filter(pk=lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=10),
        )

        # Other user steals.
        other = LockAcquireTests._create_second_user()
        self.client.force_authenticate(user=other)
        self.client.post(self.lock_url)

        # Original user tries to release → 204 (idempotent).
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(self.lock_url)
        self.assertEqual(response.status_code, 204)


# ── Lock status tests ─────────────────────────────────────────────────────────


class LockStatusTests(_CreateEntryMixin, BaseTestCase):
    """GET /api/eln/entries/{display_id}/lock/ — lock status."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def test_status_unlocked(self):
        """Status when no lock → locked: false."""
        response = self.client.get(self.lock_url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["locked"])

    def test_status_locked(self):
        """Status when locked → full lock info."""
        self.client.post(self.lock_url)

        response = self.client.get(self.lock_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["locked"])
        self.assertEqual(response.data["held_by"], self.user.id)
        self.assertIsNotNone(response.data["acquired_at"])
        self.assertIsNotNone(response.data["last_activity_at"])


# ── Lock enforcement in perform_update tests ───────────────────────────────────


class LockEnforcementTests(_CreateEntryMixin, BaseTestCase):
    """Write enforcement: PUT/PATCH blocked 423 when locked by another user."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.entry_url = f"/api/eln/entries/{self.display_id}/"
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def _put_content(self, doc=None):
        return self.client.put(
            self.entry_url,
            {"title": "Updated", "content": doc or ALT_DOC, "folder": self.folder.id},
            format="json",
        )

    def test_update_allowed_when_unlocked(self):
        """PUT when no lock → allowed."""
        response = self._put_content()
        self.assertEqual(response.status_code, 200)

    def test_update_allowed_when_locked_by_self(self):
        """PUT when locked by self → allowed."""
        self.client.post(self.lock_url)
        response = self._put_content()
        self.assertEqual(response.status_code, 200)

    def test_update_blocked_423_when_locked_by_other(self):
        """PUT when another user holds the lock → 423 Locked."""
        self.client.post(self.lock_url)

        other = LockAcquireTests._create_second_user()
        self.client.force_authenticate(user=other)
        response = self._put_content()
        self.assertEqual(response.status_code, 423)

    def test_update_allowed_when_lock_is_stale(self):
        """PUT when lock is stale → allowed."""
        self.client.post(self.lock_url)

        lock = EntryLock.objects.get()
        EntryLock.objects.filter(pk=lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=10),
        )

        other = LockAcquireTests._create_second_user()
        self.client.force_authenticate(user=other)
        response = self._put_content()
        self.assertEqual(response.status_code, 200)

    def test_patch_blocked_423_when_locked_by_other(self):
        """PATCH is also blocked by lock enforcement."""
        self.client.post(self.lock_url)

        other = LockAcquireTests._create_second_user()
        self.client.force_authenticate(user=other)
        response = self.client.patch(
            self.entry_url,
            {"title": "Sneaky edit"},
            format="json",
        )
        self.assertEqual(response.status_code, 423)


# ── Stale lock tests ──────────────────────────────────────────────────────────


class StaleLockTests(BaseTestCase):
    """is_stale() behaviour and ELN_LOCK_TIMEOUT_MINUTES."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

        # Create entry and lock directly via ORM.
        self.entry = NotebookEntry.objects.create(
            title="Test",
            content=TEXT_DOC,
            author=self.user,
        )
        self.lock = EntryLock.objects.create(
            entry=self.entry,
            held_by=self.user,
        )

    def test_fresh_lock_is_not_stale(self):
        """A just-created lock is not stale."""
        self.assertFalse(self.lock.is_stale())

    def test_lock_past_timeout_is_stale(self):
        """A lock exceeding ELN_LOCK_TIMEOUT_MINUTES is stale."""
        EntryLock.objects.filter(pk=self.lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=10),
        )
        self.lock.refresh_from_db()
        self.assertTrue(self.lock.is_stale())

    @override_settings(ELN_LOCK_TIMEOUT_MINUTES=2)
    def test_custom_timeout_respected(self):
        """ELN_LOCK_TIMEOUT_MINUTES setting changes the staleness threshold."""
        # 3 minutes ago — stale with default 5? No. Stale with custom 2? Yes.
        EntryLock.objects.filter(pk=self.lock.pk).update(
            last_activity_at=timezone.now() - timezone.timedelta(minutes=3),
        )
        self.lock.refresh_from_db()

        # With timeout=2, 3 minutes is stale.
        self.assertTrue(self.lock.is_stale())


# ── Cascade delete tests ──────────────────────────────────────────────────────


class CascadeDeleteTests(_CreateEntryMixin, BaseTestCase):
    """Deleting an entry cascades to its lock."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def test_delete_entry_removes_lock(self):
        """DELETE on entry removes the lock via CASCADE."""
        self.client.post(self.lock_url)
        self.assertTrue(EntryLock.objects.exists())

        response = self.client.delete(f"/api/eln/entries/{self.display_id}/")
        self.assertEqual(response.status_code, 204)

        self.assertFalse(EntryLock.objects.exists())
