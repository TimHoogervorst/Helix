# Python Mod API Reference

<!-- This file is generated. Do not edit it directly. -->
<!-- src/helix_core/mod_system/manifest.py: aefb417c5909e346966a4d0207d497d2d889a367aff562f9c9b8355922bea36b -->
<!-- src/helix_core/mod_system/loader.py: 1849961db6def8719f5cac4ec9de9427e7b9108b9a21e24c71718d86e51ce60f -->
<!-- src/helix_core/mod_system/registry.py: de7d7b5e13c8ceab1aa0e6b757285e9fd3ffa59b227d6022f88aae8b48c647f2 -->

The public backend SDK is rooted at `helix_core`. The entries below are derived from the manifest, loader, and registry modules.

- `src/helix_core/mod_system/manifest.py`: `class Dependency`
- `src/helix_core/mod_system/manifest.py`: `validate_manifest(data: Any)`
- `src/helix_core/mod_system/manifest.py`: `class ModManifest`
- `src/helix_core/mod_system/manifest.py`: `ModManifest.dependency_ids(self)`
- `src/helix_core/mod_system/manifest.py`: `ModManifest.from_dict(cls, data: dict[str, Any])`
- `src/helix_core/mod_system/loader.py`: `discover_python_mod_entry_points()`
- `src/helix_core/mod_system/loader.py`: `get_helix_mods(base_dir: str | Path | None=None, helix_mods_override: list[str] | None=None)`
- `src/helix_core/mod_system/registry.py`: `class BackendModRegistry`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_model_reference(self, reference: str, model: type | str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_registered_models(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_source_kind(self, kind: str, model_reference: Any)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_source_kinds(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_public_signal(self, mod_id: str, kind: Any, sender_ref: Any, sender: type, handler: Callable[..., Any])`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.set_mod_order(self, dotted_paths: list[str], manifests: dict[str, ModManifest] | None=None)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_formula_function(self, function_id: str, *, argument_kinds: list[str], result_kind: str, description: str, implementation: Callable[..., Any], client_implemented: bool=False)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_formula_function(self, function_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_formula_catalog(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_schema_type(self, *, display_name: str, workspace_id: str, model: str, columns: list[dict[str, Any]] | None=None, tags: list[str] | None=None, prefix: str, schema_name: str='Default', icon: str='', color: str='')`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_action_model(self, mod_id: str, model_class: type)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_custom_action(self, mod_id: str, action_id: str, label: str, core: str, target_model: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.sync_actions(self, mod_id: str, actions: list[dict[str, str]])`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_action_catalog(self, mod_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.validate_action(self, action: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_urls(self, mod_id: str, url_patterns: list)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_setting(self, mod_id: str, key: str, default: Any)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_signal(self, mod_id: str, signal: Any, handler: Callable[..., Any], sender: Any)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.register_service(self, service_id: str, handler: Callable[..., Any])`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.call(self, service_id: str, *args: Any, **kwargs: Any)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.list_services(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.override(self, service_id: str, mock_handler: Callable[..., Any])`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_registry_payload(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_action_model(self, mod_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.has_action_model(self, mod_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.is_mod_known(self, mod_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_url_patterns(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_settings(self, mod_id: str)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.get_signal_registrations(self)`
- `src/helix_core/mod_system/registry.py`: `BackendModRegistry.build_urlpatterns(self)`
