import importlib
from pathlib import Path

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
        from helix_core.mod_system.validator import validate_no_eln_references
        from helix_core.mod_system.lifecycle import (
            apply_persisted_activation,
            sync_mod_installations,
        )
        from helix_core.mod_system.bundled import BUNDLED_MODS
        from django.db.utils import OperationalError, ProgrammingError
        from django.db.transaction import TransactionManagementError

        # Keep the optional provider boundary enforced at the real boot seam,
        # rather than relying only on the build-time catalog.
        platform_root = Path(__file__).resolve().parent
        bundled_roots = [
            Path(importlib.import_module(package).__file__).resolve().parent
            for package in BUNDLED_MODS
        ]
        validate_no_eln_references(
            platform_path=platform_root,
            bundled_paths=bundled_roots,
        )

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

        # Installation records are intentionally reconciled before Mod
        # registration. New External Mods therefore remain dormant until an
        # administrator requests activation and restarts the process.
        try:
            sync_mod_installations(
                manifests,
                id_to_path,
                bundled_ids={
                    manifests[mod_id].id
                    for mod_id, path in id_to_path.items()
                    if path in BUNDLED_MODS
                },
            )
            apply_persisted_activation()
        except TransactionManagementError:
            # Transaction bugs must not be mistaken for a missing table on
            # an unmigrated database, leaving activation silently unapplied.
            raise
        except (OperationalError, ProgrammingError):
            # Migrations and makemigrations run before the lifecycle table
            # exists; normal application startup always has it.
            pass

        # Platform-owned Source Kinds are registered before Mods.  Persisted
        # values remain the short ``project``/``folder`` strings.
        from helix_core.core.models import Folder, Project
        from helix_core.core.serializers import FolderSerializer, ProjectSerializer
        from bundled.access.access.scoping import visible_folders_q

        def visible_projects(request, queryset):
            # Project visibility is enforced by the access layer when a
            # project queryset is consumed; this hook keeps the provider
            # contract uniform with folder and external content providers.
            return queryset

        providers = (
            ("project", Project, visible_projects, ProjectSerializer, {"label": "Project", "icon": "folder-kanban"}),
            ("folder", Folder, lambda request, queryset: queryset.filter(visible_folders_q(request.user)), FolderSerializer, {"label": "Folder", "icon": "folder"}),
        )
        for local_key, model, visibility_query, serializer, display_metadata in providers:
            reference = ModelReference("helix.core", local_key)
            if reference.id not in registry.get_registered_models():
                registry.register_model_reference(reference.id, model)
            if local_key not in registry.get_source_kinds():
                registry.register_content_source(
                    local_key,
                    reference,
                    visibility_query=visibility_query,
                    serializer=serializer,
                    display_metadata=display_metadata,
                )

        # Call each mod's mod.py.register() in topological order.
        # This replaces the individual AppConfig.ready() methods on each
        # mod's apps.py — registration now happens here, after the
        # topological sort and before Django app ready.
        path_to_manifest = {path: manifests[mod_id] for mod_id, path in id_to_path.items()}
        active_ids = set()
        try:
            from helix_core.models import ModInstallation

            active_ids = set(
                ModInstallation.objects.filter(
                    state=ModInstallation.State.ACTIVE
                ).values_list("mod_id", flat=True)
            )
            # Bundled Mods are active by default, including a freshly
            # migrated database whose lifecycle table has no rows yet.
            active_ids.update(
                mod_id
                for mod_id, path in id_to_path.items()
                if path in BUNDLED_MODS
            )
        except (OperationalError, ProgrammingError):
            # Bundled Mods are active by default. During migrations and test
            # database startup the lifecycle table may not exist yet, but the
            # in-process registry still needs their URL and service contracts.
            active_ids = {
                mod_id
                for mod_id, path in id_to_path.items()
                if path in BUNDLED_MODS
            }

        for dotted_path in sorted_paths:
            mod_id = next(
                (candidate for candidate, path in id_to_path.items() if path == dotted_path),
                None,
            )
            if mod_id not in active_ids:
                continue
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

        # Root URLConf may have been imported before app registration. Refresh
        # its shared list in place so prior ``from config.urls import
        # urlpatterns`` references and Django's resolver see active Mod routes.
        try:
            from config.urls import refresh_mod_urlpatterns

            refresh_mod_urlpatterns()
        except ModuleNotFoundError:
            # Small unit-test settings may not install the project URLConf.
            pass
