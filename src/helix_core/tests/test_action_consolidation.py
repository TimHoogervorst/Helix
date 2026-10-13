"""Contract tests for the action model and migration cleanup."""

from pathlib import Path

from django.apps import apps
from django.core.checks import Tags, run_checks

from bundled.lims.models import Action as LimsAction
from helix_core.models import ActionLogEntry
from mods.eln.models import ElnAction


REMOVED_ACTION_MODELS = {
    ("access", "AccessAction"),
    ("core_mods_users", "CoreAction"),
    ("dropdowns", "DropdownsAction"),
    ("tags", "TagsAction"),
    ("helix_core", "ModLifecycleAction"),
}


def test_legacy_action_models_are_not_registered():
    for app_label, model_name in REMOVED_ACTION_MODELS:
        assert not apps.is_installed(app_label) or not apps.get_app_config(
            app_label
        ).models.get(model_name.lower())


def test_lims_and_eln_actions_remain_without_version_relations():
    assert LimsAction._meta.get_field("entity")
    assert ElnAction._meta.db_table == "eln_action"
    assert ActionLogEntry._meta.db_table == "helix_action_log_entry"

    for model in (LimsAction, ElnAction):
        assert "version" not in {field.name for field in model._meta.fields}


def test_action_models_pass_system_checks_without_eln_relations():
    errors = run_checks(tags=[Tags.models])
    assert not [error for error in errors if error.id in {"fields.E300", "fields.E307"}]


def test_action_migrations_do_not_depend_on_or_lookup_eln():
    root = Path(__file__).parents[1].parents[0]
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
        root / "mods/eln/migrations/0001_initial.py",
    ]
    migration_text = "\n".join(
        path.read_text(encoding="utf-8") for path in migration_paths if path.exists()
    )

    assert '("eln", "' not in migration_text
    assert 'apps.get_model("eln"' not in migration_text
    assert "to='eln.contentversion'" not in migration_text
    assert 'to="eln.contentversion"' not in migration_text
