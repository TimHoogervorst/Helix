import importlib


MOVED_APPS = {
    "home": "bundled.shared.home",
    "library": "bundled.shared.library",
    "lims": "bundled.lims",
    "dropdowns": "bundled.datatypes.dropdowns",
    "tags": "bundled.labelling.tags",
    "access": "bundled.access.access",
    "users": "bundled.access.users",
    "settings": "bundled.settings",
    "tabs": "bundled.tabs",
}


def test_platform_contains_core_and_mentions_apps():
    core_config = importlib.import_module("helix_core.core.apps").CoreConfig
    mentions_config = importlib.import_module("helix_core.mentions.apps").MentionsConfig

    assert core_config.name == "helix_core.core"
    assert core_config.label == "core"
    assert mentions_config.name == "helix_core.mentions"
    assert mentions_config.label == "mentions"


def test_mentions_keep_the_existing_table_name():
    mention = importlib.import_module("helix_core.mentions.models").Mention

    assert mention._meta.db_table == "eln_mention"


def test_dead_users_app_is_not_installed(settings):
    assert "users" not in settings.INSTALLED_APPS


def test_bundled_mod_app_names_and_labels_are_preserved():
    for label, app_name in MOVED_APPS.items():
        config_module = importlib.import_module(f"{app_name}.apps")
        config = next(
            value
            for value in vars(config_module).values()
            if isinstance(value, type) and value.__module__ == config_module.__name__
        )
        assert config.name == app_name
        if label == "users":
            assert config.label == "core_mods_users"
