"""Tests for Entities Hub read scoping (the "visible rows" definition).

Covers issue #475: the hub list and query endpoints return only rows the
viewer can read — effective Read on the row's Project (direct Grant, Team
Grant, or Organization Admin / Superuser override) or the row's Folder
inside a subtree shared into a Project the viewer reads.
"""

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from helix_core.models import Schema, SchemaType
from mods.access.models import (
    FolderShare,
    Grant,
    OrganizationRole,
    ProjectRole,
    ShareLevel,
    Team,
)
from mods.access.tests.factories import (
    add_child_folder,
    add_grandchild_folder,
    make_org,
    make_project,
    make_superuser,
    make_user,
)


def _make_entity(folder, author, name):
    """Create a LIMS Entity in *folder* (project derived from the folder)."""
    from mods.lims.models import Entity

    schema_type, _ = SchemaType.objects.get_or_create(
        display_name="Entity",
        workspace_id="lims",
        model="mods.lims.models.Entity",
    )
    schema, _ = Schema.objects.get_or_create(
        name="DNA", prefix="DNA", schema_type=schema_type, is_default=True,
    )
    return Entity.objects.create(
        name=name, author=author, schema=schema, folder=folder,
    )


class EntityHubScopingTests(APITestCase):
    """The full actor matrix against the hub list and query endpoints."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_org()
        cls.admin = make_user("admin", cls.org, OrganizationRole.ADMIN)
        cls.reader = make_user("reader", cls.org)          # no grants
        cls.direct = make_user("direct", cls.org)
        cls.team_user = make_user("team_user", cls.org)
        cls.sharee = make_user("sharee", cls.org)
        cls.superuser = make_superuser("superuser")
        cls.inactive = make_user("inactive", cls.org, is_active=False)

        cls.source = make_project("Source Project")
        cls.target = make_project("Target Project")
        cls.other = make_project("Other Project")

        cls.shared_folder = add_child_folder(cls.source, "Shared")
        cls.descendant = add_grandchild_folder(cls.source, "Deep", "Shared")
        cls.source_plain = add_child_folder(cls.source, "Plain")
        cls.other_folder = add_child_folder(cls.other, "Other Folder")

        cls.shared_row = _make_entity(
            cls.shared_folder, cls.admin, "Source Shared Row"
        )
        cls.descendant_row = _make_entity(
            cls.descendant, cls.admin, "Source Deep Row"
        )
        cls.source_plain_row = _make_entity(
            cls.source_plain, cls.admin, "Source Plain Row"
        )
        cls.other_row = _make_entity(
            cls.other_folder, cls.admin, "Other Row"
        )

        cls.url = "/api/registry/entities/"
        cls.query_url = "/api/registry/entities/query/"

    def _share(self, level=ShareLevel.READ):
        return FolderShare.objects.create(
            source_folder=self.shared_folder,
            target_project=self.target,
            level=level,
        )

    # ── Baseline ──────────────────────────────────────────────────────────

    def test_user_without_grants_sees_no_rows(self):
        self.client.force_authenticate(user=self.reader)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["results"], [])

    def test_direct_read_grant_includes_project_rows(self):
        Grant.objects.create(
            project=self.source, role=ProjectRole.READ, user=self.direct,
        )
        self.client.force_authenticate(user=self.direct)
        data = self.client.get(self.url).json()
        display_ids = {r["display_id"] for r in data["results"]}
        self.assertEqual(data["total"], 3)
        self.assertIn(self.shared_row.display_id, display_ids)
        self.assertIn(self.descendant_row.display_id, display_ids)
        self.assertIn(self.source_plain_row.display_id, display_ids)
        self.assertNotIn(self.other_row.display_id, display_ids)

    def test_team_grant_includes_project_rows(self):
        group = Group.objects.create(name="Hub Team")
        self.team_user.groups.add(group)
        team = Team.objects.create(group=group, organization=self.org)
        Grant.objects.create(
            project=self.source, team=team, role=ProjectRole.READ,
        )
        self.client.force_authenticate(user=self.team_user)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 3)

    def test_org_admin_sees_all_rows(self):
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 4)

    def test_superuser_sees_all_rows(self):
        self.client.force_authenticate(user=self.superuser)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 4)

    def test_inactive_user_sees_nothing(self):
        Grant.objects.create(
            project=self.source, role=ProjectRole.READ, user=self.inactive,
        )
        self.client.force_authenticate(user=self.inactive)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 0)

    # ── Shared subtrees ───────────────────────────────────────────────────

    def test_shared_subtree_includes_nested_descendants(self):
        Grant.objects.create(
            project=self.target, role=ProjectRole.READ, user=self.sharee,
        )
        self._share(ShareLevel.READ)
        self.client.force_authenticate(user=self.sharee)
        data = self.client.get(self.url).json()
        display_ids = {r["display_id"] for r in data["results"]}
        self.assertEqual(data["total"], 2)
        self.assertIn(self.shared_row.display_id, display_ids)
        self.assertIn(self.descendant_row.display_id, display_ids)
        self.assertNotIn(self.source_plain_row.display_id, display_ids)
        self.assertNotIn(self.other_row.display_id, display_ids)

    def test_share_derived_rows_disappear_when_target_role_revoked(self):
        grant = Grant.objects.create(
            project=self.target, role=ProjectRole.READ, user=self.sharee,
        )
        self._share(ShareLevel.READ)
        self.client.force_authenticate(user=self.sharee)
        self.assertEqual(self.client.get(self.url).json()["total"], 2)

        grant.delete()
        self.assertEqual(self.client.get(self.url).json()["total"], 0)

    def test_no_target_role_denies_shared_subtree(self):
        self._share(ShareLevel.READ)
        self.client.force_authenticate(user=self.sharee)
        data = self.client.get(self.url).json()
        self.assertEqual(data["total"], 0)

    # ── Pagination composes with the recursive CTE ───────────────────────

    def test_pagination_total_matches_filtered_population_with_shares(self):
        Grant.objects.create(
            project=self.target, role=ProjectRole.READ, user=self.sharee,
        )
        self._share(ShareLevel.READ)
        for i in range(5):
            _make_entity(self.descendant, self.admin, f"Extra {i}")

        self.client.force_authenticate(user=self.sharee)
        data = self.client.get(f"{self.url}?size=2").json()
        # visible: shared_folder (1) + descendant (1 + 5 extras) = 7
        self.assertEqual(data["total"], 7)
        self.assertEqual(len(data["results"]), 2)

    # ── The query endpoint applies the identical definition ──────────────

    def test_query_endpoint_applies_same_definition(self):
        Grant.objects.create(
            project=self.target, role=ProjectRole.READ, user=self.sharee,
        )
        self._share(ShareLevel.READ)
        self.client.force_authenticate(user=self.sharee)
        data = self.client.post(self.query_url, {}, format="json").json()
        display_ids = {r["display_id"] for r in data["results"]}
        self.assertEqual(data["total"], 2)
        self.assertIn(self.shared_row.display_id, display_ids)
        self.assertIn(self.descendant_row.display_id, display_ids)
        self.assertNotIn(self.source_plain_row.display_id, display_ids)

    def test_query_endpoint_scopes_without_grants(self):
        self.client.force_authenticate(user=self.reader)
        data = self.client.post(self.query_url, {}, format="json").json()
        self.assertEqual(data["total"], 0)

    # ── Scoping composes with the existing filter machinery ──────────────

    def test_scoping_composes_with_search(self):
        Grant.objects.create(
            project=self.source, role=ProjectRole.READ, user=self.direct,
        )
        self.client.force_authenticate(user=self.direct)
        # A search that matches only an inaccessible row yields nothing.
        hidden = self.client.get(
            f"{self.url}?search={self.other_row.name}"
        ).json()
        self.assertEqual(hidden["total"], 0)
        # A search matching a visible row still resolves.
        visible = self.client.get(
            f"{self.url}?search=Source Deep"
        ).json()
        self.assertEqual(visible["total"], 1)
