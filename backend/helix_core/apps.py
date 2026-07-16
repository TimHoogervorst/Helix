from django.apps import AppConfig
from django.conf import settings


class HelixCoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "helix_core"

    def ready(self):
        from helix_core.mod_system.loader import (
            _auto_discover,
            _load_manifests_from_paths,
            get_helix_mods,
        )
        from helix_core.mod_system.registry import registry

        # Discover manifests for dependency-aware signal validation.
        if settings.HELIX_MODS is not None:
            manifests = _load_manifests_from_paths(settings.HELIX_MODS)
        else:
            manifests = _auto_discover(settings.BASE_DIR)

        # Get the topologically sorted mod order.
        sorted_paths = get_helix_mods(
            base_dir=settings.BASE_DIR,
            helix_mods_override=settings.HELIX_MODS,
        )

        # Set the mod order and manifests on the registry so that
        # build_urlpatterns() can return patterns in dependency order
        # and register_signal() can validate cross-mod dependencies.
        registry.set_mod_order(sorted_paths, manifests)
