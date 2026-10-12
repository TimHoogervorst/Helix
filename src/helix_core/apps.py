import importlib

from django.apps import AppConfig
from django.conf import settings


class HelixCoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "helix_core"

    def ready(self):
        from helix_core.column_types import (
            get_builtin_column_types,
            registry as column_type_registry,
        )
        from helix_core.formulas import get_builtin_formula_functions
        from helix_core.mod_system.loader import (
            _get_all_manifests,
            get_helix_mods,
        )
        from helix_core.mod_system.registry import registry
        from helix_core.public import ModelReference, ModRegistrar
        from helix_core.mod_system.validator import validate_activation

        # ── Register built-in column types ───────────────────────────────
        for ct in get_builtin_column_types():
            column_type_registry.register_column_type(ct)

        # Platform formula functions are available before any mod registers
        # its namespaced domain functions.
        for function in get_builtin_formula_functions():
            if registry.get_formula_function(function["function_id"]) is None:
                registry.register_formula_function(**function)

        # Discover all manifests (core + external) for signal validation.
        manifests, id_to_path = _get_all_manifests(
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

        # Platform-owned Source Kinds are registered before Mods.  Persisted
        # values remain the short ``project``/``folder`` strings.
        from helix_core.core.models import Folder, Project

        for local_key, model in (("project", Project), ("folder", Folder)):
            reference = ModelReference("helix.core", local_key)
            if reference.id not in registry.get_registered_models():
                registry.register_model_reference(reference.id, model)
            if local_key not in registry.get_source_kinds():
                registry.register_source_kind(local_key, reference)

        # Call each mod's mod.py.register() in topological order.
        # This replaces the individual AppConfig.ready() methods on each
        # mod's apps.py — registration now happens here, after the
        # topological sort and before Django app ready.
        path_to_manifest = {path: manifests[mod_id] for mod_id, path in id_to_path.items()}
        for dotted_path in sorted_paths:
            try:
                package = importlib.import_module(dotted_path)
                register_fn = getattr(package, "register", None)
                if register_fn is None:
                    # Repository Mods predate packaged entry points and keep
                    # registration in ``mod.py``.
                    register_fn = getattr(
                        importlib.import_module(f"{dotted_path}.mod"),
                        "register",
                        None,
                    )
                if register_fn is not None:
                    registrar = ModRegistrar(path_to_manifest[dotted_path], registry)
                    register_fn(registrar)
            except ModuleNotFoundError:
                # Mod has no mod.py — skip (non-backend mods like home,
                # settings).
                pass

        # All mods have now declared their contributions.  Only now resolve
        # cross-mod references, so registration order cannot affect outcomes.
        validate_activation(registry)
