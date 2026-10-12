from helix_core import make_app_config
from helix_core.public import load_entry_point_manifest


ModAppConfig = make_app_config(
    __package__,
    load_entry_point_manifest("helix.settings", __package__),
    "settings",
)
