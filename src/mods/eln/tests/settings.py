"""Django composition used by the independently invoked ELN test suite."""

from config.settings import *  # noqa: F403

from helix_core.mod_system.bundled import BUNDLED_MODS
from helix_core.mod_system.loader import get_helix_mods


_bundled_and_external_apps = set(get_helix_mods(helix_mods_override=BUNDLED_MODS))
INSTALLED_APPS = [  # noqa: F405
    app for app in INSTALLED_APPS  # noqa: F405
    if app not in _bundled_and_external_apps and app != "helix_core.mentions"
]
INSTALLED_APPS += get_helix_mods(  # noqa: F405
    helix_mods_override=[*BUNDLED_MODS, "mods.eln"]
)
INSTALLED_APPS.append("helix_core.mentions")  # noqa: F405
