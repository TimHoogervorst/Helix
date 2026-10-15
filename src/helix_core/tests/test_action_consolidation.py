"""Platform-owned action store and migration independence contracts."""

from pathlib import Path

from django.apps import apps
from django.core.checks import Tags, run_checks
from django.test import TestCase

from helix_core.core.models import User
from helix_core.models import ActionLogEntry


REMOVED_ACTION_MODELS = {
    ("access", "AccessAction"),
    ("core_mods_users", "CoreAction"),
    ("dropdowns", "DropdownsAction"),
    ("tags", "TagsAction"),
    ("helix_core", "ModLifecycleAction"),
}


class ActionConsolidationTests(TestCase):
    def test_legacy_mod_action_models_are_not_registered(self):
        for app_label, model_name in REMOVED_ACTION_MODELS:
            if apps.is_installed(app_label):
                self.assertNotIn(
                    model_name.lower(), apps.get_app_config(app_label).models
                )

    def test_platform_action_log_is_append_only_and_has_no_mod_version_relation(self):
        user = User.objects.create_user(username="audit_writer", password="pass")
        row = ActionLogEntry.objects.create(
            performed_by=user,
            action="fixture.entity.edited",
            action_type="edited",
            target_model_reference="fixture.entity",
            target_object_id="17",
            initiating_mod_id="fixture",
        )

        row.action = "fixture.entity.deleted"
        with self.assertRaisesRegex(ValueError, "append-only"):
            row.save()
        with self.assertRaisesRegex(ValueError, "append-only"):
            row.delete()

        self.assertEqual(ActionLogEntry.objects.get(pk=row.pk).action, "fixture.entity.edited")
        self.assertEqual(
            {field.name for field in ActionLogEntry._meta.fields}
            & {"version", "version_id"},
            set(),
        )

    def test_action_models_pass_system_checks_without_external_relations(self):
        errors = run_checks(tags=[Tags.models])
        self.assertEqual(
            [error for error in errors if error.id in {"fields.E300", "fields.E307"}],
            [],
        )

    def test_platform_action_migrations_do_not_reference_eln_models(self):
        root = Path(__file__).parents[2]
        migration_paths = [
            root / "helix_core/migrations/0019_mod_lifecycle.py",
            root / "helix_core/migrations/0019_platform_owned_actions.py",
            root / "helix_core/migrations/0020_action_consolidation.py",
            root / "bundled/access/access/migrations/0005_access_action.py",
            root / "bundled/access/users/migrations/0001_initial.py",
            root / "bundled/access/users/migrations/0004_rename_action_type_to_action.py",
            root / "bundled/access/users/migrations/0005_alter_coreaction_action_alter_coreaction_action_type.py",
            root / "bundled/datatypes/dropdowns/migrations/0001_initial.py",
            root / "bundled/labelling/tags/migrations/0001_initial.py",
            root / "bundled/labelling/tags/migrations/0002_rename_action_type_to_action.py",
            root / "bundled/labelling/tags/migrations/0003_alter_tagsaction_action_alter_tagsaction_action_type.py",
            root / "bundled/lims/migrations/0001_initial.py",
        ]
        migration_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in migration_paths
            if path.exists()
        )

        self.assertNotIn('("eln", "', migration_text)
        self.assertNotIn('apps.get_model("eln"', migration_text)
        self.assertNotIn("to='eln.contentversion'", migration_text)
        self.assertNotIn('to="eln.contentversion"', migration_text)
