from helix_core.public import load_entry_point_manifest
from helix_core.public import make_app_config


ModAppConfig = make_app_config(
    __package__,
    load_entry_point_manifest("helix.eln", __package__),
    "eln",
)
