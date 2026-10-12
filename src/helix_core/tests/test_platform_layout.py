import importlib


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
