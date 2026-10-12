"""Parity coverage for the legacy Action-to-Platform migration."""

import importlib
import uuid
from datetime import timedelta

from django.apps import apps
from django.test import TestCase
from django.utils import timezone

from bundled.access.access.models import AccessAction
from bundled.access.users.models import CoreAction
from bundled.datatypes.dropdowns.models import DropdownsAction
from bundled.labelling.tags.models import TagsAction
from bundled.lims.models import Action as LimsAction
from helix_core.core.models import User, Project, Folder
from helix_core.models import ActionLogEntry, ModLifecycleAction
from mods.eln.models import ContentVersion, ElnAction, NotebookEntry
from mods.eln.tests.factories import get_or_create_default_eln_schema


class ActionConsolidationParityTests(TestCase):
    """The migration copies every legacy action without losing audit data."""

    def test_legacy_rows_have_central_field_and_ordering_parity(self):
        user = User.objects.create_user(username="migration-user")
        project = Project.objects.create(name="Migration project")
        folder = Folder.objects.create(name="Root", project=project)
        entry = NotebookEntry.objects.create(
            name="Versioned entry",
            content={"type": "doc", "content": []},
            source=folder,
            author=user,
            schema=get_or_create_default_eln_schema(),
        )
        version = ContentVersion.objects.create(
            entry=entry,
            content={"type": "doc", "content": [{"type": "text", "text": "v1"}]},
            content_hash="version-hash",
            version_number=7,
            created_by=user,
        )
        request_id = uuid.uuid4()
        timestamp = timezone.now() - timedelta(days=1)
        legacy_rows = [
            (ElnAction, "eln.entry.edited", "eln.entry", entry.pk, version),
            (LimsAction, "lims.entity.created", "lims.entity", 11, None),
            (TagsAction, "tags.tag.created", "tags.tag", 12, None),
            (CoreAction, "core.user.edited", "core.user", user.pk, None),
            (AccessAction, "access.grant.created", "access.grant", 13, None),
            (DropdownsAction, "dropdowns.dropdown.created", "dropdowns.dropdown", 14, None),
            (ModLifecycleAction, "helix.platform.mod.enabled", "helix.mod", 15, None),
        ]
        for model, action, target_type, target_id, row_version in legacy_rows:
            row = model.objects.create(
                performed_by=user,
                action=action,
                action_type="edited" if action.endswith("edited") else "created",
                target_type=target_type,
                target_id=target_id,
                metadata={"source": model._meta.db_table},
                request_id=request_id,
                client_ip="10.0.0.8",
                version=row_version,
            )
            model.objects.filter(pk=row.pk).update(created_at=timestamp)

        migration = importlib.import_module(
            "helix_core.migrations.0020_action_consolidation"
        )
        migration.consolidate_legacy_actions(apps, None)

        self.assertEqual(ActionLogEntry.objects.count(), len(legacy_rows))
        self.assertEqual(
            ActionLogEntry.objects.values_list("legacy_table", "legacy_id").count(),
            len(legacy_rows),
        )
        for model, action, target_type, target_id, row_version in legacy_rows:
            central = ActionLogEntry.objects.get(
                legacy_table=model._meta.db_table,
                legacy_id=model.objects.get(action=action).pk,
            )
            self.assertEqual(central.performed_by, user)
            self.assertEqual(central.action, action)
            self.assertEqual(central.target_model_reference, target_type)
            self.assertEqual(central.target_object_id, str(target_id))
            self.assertEqual(central.request_id, request_id)
            self.assertEqual(central.client_ip, "10.0.0.8")
            self.assertEqual(central.created_at, timestamp)
            self.assertEqual(central.initiating_mod_id, "unknown")
            if row_version is None:
                self.assertIsNone(central.target_version_reference)
                continue
            self.assertEqual(central.target_version_reference, "eln:content-version")
            self.assertEqual(central.target_version_object_id, str(row_version.pk))
            self.assertEqual(central.target_version_label, "7")
            self.assertEqual(central.target_version_hash, "version-hash")

        ordered_legacy = list(
            ElnAction.objects.order_by("-created_at", "-pk").values_list("pk", flat=True)
        )
        ordered_central = list(
            ActionLogEntry.objects.filter(legacy_table="eln_action")
            .order_by("-created_at", "-id")
            .values_list("legacy_id", flat=True)
        )
        self.assertEqual(ordered_central, ordered_legacy)
