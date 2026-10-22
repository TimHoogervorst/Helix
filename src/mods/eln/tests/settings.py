"""Django composition used by the independently invoked ELN test suite."""

from config.settings import *  # noqa: F403

from helix_core.public import get_bundled_mod_packages, get_mod_app_configs


_bundled_packages = get_bundled_mod_packages()
HELIX_MODS = [*_bundled_packages, "mods.eln"]  # noqa: F405
HELIX_ACTIVATE_MODS_IN_TESTS = True
HELIX_TEST_ACTIVE_MODS = ["helix.eln"]
_bundled_apps = set(get_mod_app_configs(_bundled_packages, base_dir=BASE_DIR))  # noqa: F405
INSTALLED_APPS = [  # noqa: F405
    app for app in INSTALLED_APPS  # noqa: F405
    if app not in _bundled_apps and app != "helix_core.mentions"
]
INSTALLED_APPS += get_mod_app_configs(HELIX_MODS, base_dir=BASE_DIR)  # noqa: F405
INSTALLED_APPS.append("helix_core.mentions")  # noqa: F405
