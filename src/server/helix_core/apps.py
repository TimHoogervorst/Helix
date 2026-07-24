import importlib

from django.apps import AppConfig
from django.conf import settings


class HelixCoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "helix_core"

    def ready(self):
        from helix_core.mod_system.loader import (
            _get_all_manifests,
            get_helix_mods,
        )
        from helix_core.mod_system.registry import registry

        # Discover all manifests (core + external) for signal validation.
        manifests, _ = _get_all_manifests(
            base_dir=settings.BASE_DIR,
            helix_mods_override=settings.HELIX_MODS,
        )

        # Get the topologically sorted mod order.
        sorted_paths = get_helix_mods(
            base_dir=settings.BASE_DIR,
            helix_mods_override=settings.HELIX_MODS,
        )

        # Set the mod order and manifests on the registry so that
        # build_urlpatterns() can return patterns in dependency order
        # and register_signal() can validate cross-mod dependencies.
        registry.set_mod_order(sorted_paths, manifests)

        # Call each mod's mod.py.register() in topological order.
        # This replaces the individual AppConfig.ready() methods on each
        # mod's apps.py — registration now happens here, after the
        # topological sort and before Django app ready.
        for dotted_path in sorted_paths:
            try:
                mod_module = importlib.import_module(
                    f"{dotted_path}.mod"
                )
                register_fn = getattr(mod_module, "register", None)
                if register_fn is not None:
                    register_fn()
            except ModuleNotFoundError:
                # Mod has no mod.py — skip (non-backend mods like home,
                # settings).
                pass
