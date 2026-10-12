from helix_core import make_app_config
from helix_core.public import load_entry_point_manifest


def _connect_signals() -> None:
    import bundled.access.access.signals  # noqa: F401


ModAppConfig = make_app_config(
    __package__,
    load_entry_point_manifest("helix.access", __package__),
    "access",
    ready=_connect_signals,
)
