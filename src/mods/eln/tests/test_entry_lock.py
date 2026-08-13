"""
Tests for EntryLock model and conflict-prevention endpoints.

Exercises the full lock lifecycle: acquire (first-time, refresh, stale-steal,
conflict), release (owner, no-lock, not-owner), status (locked, unlocked),
write enforcement in perform_update, stale expiry, and cascade delete.
"""
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Folder, Project, User
from core.tests.base import BaseTestCase
from mods.access.models import (
    FolderShare,
    Grant,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    ProjectRole,
    ShareLevel,
    Team,
)
from mods.eln.models import NotebookEntry, EntryLock
from mods.eln.tests.factories import get_or_create_default_eln_schema

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
        Grant.objects.create(project=self.project, user=other, role=ProjectRole.EDIT)
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
        Grant.objects.create(project=self.project, user=other, role=ProjectRole.EDIT)
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

    def test_race_condition_duplicate_lock_recovers(self):
        """When a concurrent request inserts a lock between our check and
        create, the IntegrityError handler re-fetches via objects.get()
        (bypassing Django's cached negative lookup) and recovers."""
        from unittest.mock import patch
        from django.db import IntegrityError

        entry = NotebookEntry.objects.get(display_id=self.display_id)
        original_create = EntryLock.objects.create

        def create_with_race(*args, **kwargs):
            # Simulate a concurrent request: create the lock first, then
            # raise IntegrityError so our request's create() sees a duplicate.
            race_lock = original_create(entry=entry, held_by=self.user)
            raise IntegrityError(
                "duplicate key value violates unique constraint "
                '"eln_entry_lock_entry_id_key"\n'
                f"DETAIL:  Key (entry_id)=({entry.id}) already exists.\n"
            )

        with patch.object(
            EntryLock.objects, "create", side_effect=create_with_race
        ):
            response = self.client.post(self.lock_url)
            # Re-fetch via objects.get() finds the race lock,
            # same user → refresh → 200.
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data["locked"])
            self.assertEqual(response.data["held_by"], self.user.id)

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
        """Non-holder editor trying to release → 204 (idempotent no-op)."""
        self.client.post(self.lock_url)

        other = LockAcquireTests._create_second_user()
        Grant.objects.create(project=self.project, user=other, role=ProjectRole.EDIT)
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
        Grant.objects.create(project=self.project, user=other, role=ProjectRole.EDIT)
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


# ── Lock access enforcement tests ───────────────────────────────────────────


class LockAccessTests(_CreateEntryMixin, BaseTestCase):
    """Lock acquire/release require Edit; lock status reads require Read."""

    def setUp(self):
        super().setUp()
        from mods.access.models import (
            FolderShare,
            Organization,
            OrganizationMembership,
            OrganizationRole,
            ShareLevel,
        )

        self.org = Organization.objects.create(name="Test Org")
        self.schema = get_or_create_default_eln_schema()

        self.editor = User.objects.create_user(username="lock_ed", password="pass")
        self.reader = User.objects.create_user(username="lock_rd", password="pass")
        self.no_grant = User.objects.create_user(username="lock_ng", password="pass")
        self.org_admin = User.objects.create_user(username="lock_ad", password="pass")
        self.sharee = User.objects.create_user(username="lock_sh", password="pass")

        OrganizationMembership.objects.update_or_create(
            user=self.org_admin,
            defaults={"organization": self.org, "role": OrganizationRole.ADMIN},
        )
        for user in (self.user, self.editor, self.reader, self.no_grant, self.sharee):
            OrganizationMembership.objects.update_or_create(
                user=user,
                defaults={"organization": self.org, "role": OrganizationRole.USER},
            )

        Grant.objects.create(project=self.project, user=self.editor, role=ProjectRole.EDIT)
        Grant.objects.create(project=self.project, user=self.reader, role=ProjectRole.READ)

        self.client.force_authenticate(user=self.user)
        self.entry_data = self._create_entry()
        self.display_id = self.entry_data["display_id"]
        self.lock_url = f"/api/eln/entries/{self.display_id}/lock/"

    def _post(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(self.lock_url)

    def _delete(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.delete(self.lock_url)

    def _get(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get(self.lock_url)

    # ── acquire requires Edit ──

    def test_editor_can_acquire(self):
        self.assertEqual(self._post(self.editor).status_code, 201)

    def test_org_admin_can_acquire(self):
        self.assertEqual(self._post(self.org_admin).status_code, 201)

    def test_team_derived_edit_can_acquire(self):
        from django.contrib.auth.models import Group
        from mods.access.models import Team

        team_user = User.objects.create_user(username="lock_team", password="pass")
        OrganizationMembership.objects.update_or_create(
            user=team_user, defaults={"organization": self.org, "role": OrganizationRole.USER},
        )
        group = Group.objects.create(name="Lock Team")
        team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(project=self.project, team=team, role=ProjectRole.EDIT)
        self.assertEqual(self._post(team_user).status_code, 201)

    def test_read_user_cannot_acquire(self):
        response = self._post(self.reader)
        self.assertEqual(response.status_code, 403)

    def test_no_grant_user_cannot_acquire(self):
        self.assertEqual(self._post(self.no_grant).status_code, 403)

    def test_inactive_user_cannot_acquire(self):
        inactive = User.objects.create_user(username="lock_inact", password="pass", is_active=False)
        self.assertEqual(self._post(inactive).status_code, 403)

    def test_unauthenticated_cannot_acquire(self):
        client = APIClient()
        self.assertEqual(client.post(self.lock_url).status_code, 403)

    def test_read_write_sharee_can_acquire_inside_subtree(self):
        target_project = Project.objects.create(name="Target Lock")
        Folder.objects.create(name="root", parent=None, project=target_project)
        Grant.objects.create(project=target_project, user=self.sharee, role=ProjectRole.EDIT)
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=target_project,
            level=ShareLevel.READ_WRITE,
        )
        self.assertEqual(self._post(self.sharee).status_code, 201)

    def test_read_only_sharee_cannot_acquire(self):
        target_project = Project.objects.create(name="RO Lock")
        Folder.objects.create(name="root", parent=None, project=target_project)
        Grant.objects.create(project=target_project, user=self.sharee, role=ProjectRole.READ)
        FolderShare.objects.create(
            source_folder=self.folder,
            target_project=target_project,
            level=ShareLevel.READ_WRITE,
        )
        self.assertEqual(self._post(self.sharee).status_code, 403)

    # ── release requires Edit ──

    def test_editor_can_release(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(self.lock_url)
        self.assertEqual(self._delete(self.editor).status_code, 204)

    def test_read_user_cannot_release(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(self.lock_url)
        self.assertEqual(self._delete(self.reader).status_code, 403)

    def test_no_grant_user_cannot_release(self):
        self.assertEqual(self._delete(self.no_grant).status_code, 403)

    # ── status requires Read ──

    def test_editor_can_read_status(self):
        self.assertEqual(self._get(self.editor).status_code, 200)

    def test_read_user_can_read_status(self):
        response = self._get(self.reader)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["locked"])

    def test_no_grant_user_status_returns_404(self):
        response = self._get(self.no_grant)
        self.assertEqual(response.status_code, 404)


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
            {"name": "Updated", "content": doc or ALT_DOC, "folder": self.folder.id},
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
        Grant.objects.create(
            project=self.project, user=other, role=ProjectRole.EDIT,
        )
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
            {"name": "Sneaky edit"},
            format="json",
        )
        self.assertEqual(response.status_code, 423)


# ── Stale lock tests ──────────────────────────────────────────────────────────


class StaleLockTests(BaseTestCase):
    """is_stale() behaviour and ELN_LOCK_TIMEOUT_MINUTES."""

    def setUp(self):
        super().setUp()
        self.schema = get_or_create_default_eln_schema()
        self.client.force_authenticate(user=self.user)

        # Create entry and lock directly via ORM.
        self.entry = NotebookEntry.objects.create(
            name="Test",
            content=TEXT_DOC,
            author=self.user,
            schema=self.schema,
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
