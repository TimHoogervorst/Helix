"""Tests for the mod loader — discovery, topological sort, validation.

Tests exercise the public API surface (``get_helix_mods``) as well as the
internal helper functions directly for edge-case coverage.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from helix_core.mod_system.loader import (
    _auto_discover,
    _get_all_manifests,
    _load_external_mods_from_json,
    _load_manifests_from_paths,
    _sanitize_module_name,
    _topological_sort,
    _validate_manifest_set,
    get_helix_mods,
)
from helix_core.mod_system.manifest import ModManifest


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_mod_dir(
    base: Path,
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
) -> Path:
    """Create a mod directory with a ``mod.py`` manifest file.

    Args:
        base: The ``core_mods/`` directory path.
        mod_id: The mod ID (also used as the directory name).
        depends_on: List of dependency mod IDs.  Defaults to empty list.

    Returns:
        The created mod directory path.
    """
    manifest = _make_manifest(mod_id, depends_on)

    dep_parts: list[str] = []
    for d in manifest.depends_on:
        if isinstance(d, str):
            dep_parts.append(f'"{d}"')
        else:
            version_part = f', "version": "{d["version"]}"' if "version" in d else ""
            dep_parts.append(f'{{"id": "{d["id"]}"{version_part}}}')
    dep_str = f"[{', '.join(dep_parts)}]"

    mod_dir = base / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)

    (mod_dir / "__init__.py").write_text("")
    (mod_dir / "mod.py").write_text(
        textwrap.dedent(f"""\
        from helix_core.mod_system.manifest import ModManifest

        manifest = ModManifest(
            id="{manifest.id}",
            display_name="{manifest.display_name}",
            version="{manifest.version}",
            depends_on={dep_str},
        )
        """)
    )
    return mod_dir


def _make_manifest(
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
    version: str | None = "0.1.0",
    core_version: str | None = None,
    icon: str | None = None,
    description: str | None = None,
) -> ModManifest:
    """Create a ModManifest instance for testing.

    Args:
        mod_id: The mod ID.
        depends_on: List of dependency mod IDs (strings or dicts with
            ``id`` and optional ``version``).  Defaults to empty list.
        version: Semver version string.  Defaults to ``"0.1.0"``.
        core_version: Optional minimum platform version.
        icon: Optional legacy icon name.
        description: Optional short description.

    Returns:
        A new ModManifest instance.
    """
    return ModManifest(
        id=mod_id,
        display_name=mod_id.title(),
        version=version,
        depends_on=depends_on if depends_on is not None else [],
        core_version=core_version,
        icon=icon,
        description=description,
    )


# ── topological_sort ─────────────────────────────────────────────────────────


class TestTopologicalSort:
    """Tests for Kahn's algorithm topological sort."""

    def test_empty_returns_empty(self):
        assert _topological_sort({}) == []

    def test_single_mod_no_deps(self):
        manifests = {"eln": _make_manifest("eln")}
        assert _topological_sort(manifests) == ["eln"]

    def test_linear_chain(self):
        # C depends on B, B depends on A → [A, B, C]
        manifests = {
            "a": _make_manifest("a"),
            "b": _make_manifest("b", depends_on=["a"]),
            "c": _make_manifest("c", depends_on=["b"]),
        }
        result = _topological_sort(manifests)
        assert result == ["a", "b", "c"]

    def test_diamond_dependency(self):
        # A and B both depend on C → C before A and B
        manifests = {
            "a": _make_manifest("a", depends_on=["c"]),
            "b": _make_manifest("b", depends_on=["c"]),
            "c": _make_manifest("c"),
        }
        result = _topological_sort(manifests)
        assert result[0] == "c"
        assert set(result[1:]) == {"a", "b"}

    def test_multiple_roots(self):
        # No edges between A, B, C — any deterministic order is fine.
        manifests = {
            "a": _make_manifest("a"),
            "b": _make_manifest("b"),
            "c": _make_manifest("c"),
        }
        result = _topological_sort(manifests)
        assert set(result) == {"a", "b", "c"}
        # Deterministic: alphabetical sort.
        assert result == ["a", "b", "c"]

    def test_unrelated_subgraphs(self):
        # A → B  and  C → D  — two independent chains.
        manifests = {
            "a": _make_manifest("a", depends_on=["b"]),
            "b": _make_manifest("b"),
            "c": _make_manifest("c", depends_on=["d"]),
            "d": _make_manifest("d"),
        }
        result = _topological_sort(manifests)
        # B and D come before A and C respectively.
        assert result.index("b") < result.index("a")
        assert result.index("d") < result.index("c")
        assert set(result) == {"a", "b", "c", "d"}

    def test_real_world_eln_deps(self):
        # Matches the dependency table from the mod-system spec (#208):
        #   eln     → depends_on=["lims", "tags"]
        #   library → depends_on=["tags", "eln"]
        #   lims, tags, users, pins, core → depends_on=[]
        manifests = {
            "tags": _make_manifest("tags"),
            "users": _make_manifest("users"),
            "lims": _make_manifest("lims"),
            "eln": _make_manifest("eln", depends_on=["lims", "tags"]),
            "library": _make_manifest("library", depends_on=["tags", "eln"]),
            "pins": _make_manifest("pins"),
            "core": _make_manifest("core"),
        }
        result = _topological_sort(manifests)
        # lims and tags must come before eln.
        assert result.index("lims") < result.index("eln")
        assert result.index("tags") < result.index("eln")
        # tags and eln must come before library.
        assert result.index("tags") < result.index("library")
        assert result.index("eln") < result.index("library")
        # All 7 mods present.
        assert set(result) == {
            "tags", "users", "lims", "eln", "library", "pins", "core",
        }

    def test_deterministic_ordering(self):
        """Multiple runs produce identical results."""
        manifests = {
            "a": _make_manifest("a", depends_on=["c"]),
            "b": _make_manifest("b", depends_on=["c"]),
            "c": _make_manifest("c"),
            "d": _make_manifest("d"),
        }
        result1 = _topological_sort(manifests)
        result2 = _topological_sort(manifests)
        assert result1 == result2


class TestTopologicalSortCycles:
    """Cycle detection in topological sort."""

    def test_direct_cycle_two_mods(self):
        # A depends on B, B depends on A.
        manifests = {
            "a": _make_manifest("a", depends_on=["b"]),
            "b": _make_manifest("b", depends_on=["a"]),
        }
        with pytest.raises(ValueError, match="Circular dependency"):
            _topological_sort(manifests)

    def test_three_mod_cycle(self):
        # A → B → C → A
        manifests = {
            "a": _make_manifest("a", depends_on=["b"]),
            "b": _make_manifest("b", depends_on=["c"]),
            "c": _make_manifest("c", depends_on=["a"]),
        }
        with pytest.raises(ValueError, match="Circular dependency"):
            _topological_sort(manifests)

    def test_self_dependency_is_cycle(self):
        """A mod depending on itself should be caught as a cycle."""
        manifests = {
            "selfie": _make_manifest("selfie", depends_on=["selfie"]),
        }
        with pytest.raises(ValueError, match="Circular dependency"):
            _topological_sort(manifests)

    def test_cycle_error_names_participants(self):
        """Error message lists the mods in the cycle."""
        manifests = {
            "a": _make_manifest("a", depends_on=["b"]),
            "b": _make_manifest("b", depends_on=["a"]),
            "c": _make_manifest("c"),
        }
        with pytest.raises(ValueError, match="a, b"):
            _topological_sort(manifests)


# ── _validate_manifest_set ───────────────────────────────────────────────────


class TestValidateManifestSet:
    """Validation of the manifest dependency graph."""

    def test_all_deps_resolve(self):
        manifests = {
            "a": _make_manifest("a", depends_on=["b"]),
            "b": _make_manifest("b"),
        }
        # Should not raise.
        _validate_manifest_set(manifests)

    def test_missing_dependency_raises(self):
        manifests = {
            "a": _make_manifest("a", depends_on=["nonexistent"]),
        }
        with pytest.raises(ValueError, match="nonexistent"):
            _validate_manifest_set(manifests)

    def test_empty_manifests(self):
        _validate_manifest_set({})  # Should not raise.

    def test_no_deps_is_valid(self):
        manifests = {
            "a": _make_manifest("a"),
            "b": _make_manifest("b"),
        }
        _validate_manifest_set(manifests)


# ── _auto_discover ───────────────────────────────────────────────────────────


class TestAutoDiscover:
    """Auto-discovery of mod.py files in a core_mods/ directory."""

    def test_empty_directory(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        result = _auto_discover(tmp_path)
        assert result == {}

    def test_directory_without_mod_py(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        (core_mods / "eln").mkdir()
        result = _auto_discover(tmp_path)
        assert result == {}

    def test_single_mod_discovered(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        result = _auto_discover(tmp_path)
        assert "tags" in result
        assert isinstance(result["tags"], ModManifest)
        assert result["tags"].id == "tags"

    def test_multiple_mods_discovered(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")
        _make_mod_dir(core_mods, "users")
        _make_mod_dir(core_mods, "eln", depends_on=["tags", "users"])

        result = _auto_discover(tmp_path)
        assert set(result.keys()) == {"tags", "users", "eln"}
        assert result["eln"].depends_on == ["tags", "users"]

    def test_skips_underscore_directories(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "_private")

        result = _auto_discover(tmp_path)
        assert "_private" not in result

    def test_skips_non_directories(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        (core_mods / "some_file.txt").write_text("hello")

        result = _auto_discover(tmp_path)
        assert result == {}

    def test_raises_when_base_dir_is_none(self):
        with pytest.raises(ValueError, match="base_dir"):
            _auto_discover(None)

    def test_nonexistent_core_mods_dir(self, tmp_path):
        result = _auto_discover(tmp_path)
        assert result == {}


# ── _load_manifests_from_paths ───────────────────────────────────────────────


class TestLoadManifestsFromPaths:
    """Loading manifests from explicit dotted paths."""

    def test_loads_from_dotted_path(self):
        # Uses the actual installed core_mods.tags package.
        result = _load_manifests_from_paths(["core_mods.tags"])
        assert "tags" in result
        assert isinstance(result["tags"], ModManifest)
        assert result["tags"].id == "tags"

    def test_loads_multiple_paths(self):
        result = _load_manifests_from_paths(
            ["core_mods.tags", "core_mods.users"]
        )
        assert set(result.keys()) == {"tags", "users"}

    def test_raises_on_nonexistent_path(self):
        with pytest.raises(ImportError, match="nonexistent"):
            _load_manifests_from_paths(["core_mods.nonexistent"])

    def test_raises_on_missing_manifest(self, tmp_path):
        """A mod.py without a 'manifest' attribute raises ImportError."""
        import sys
        sys.path.insert(0, str(tmp_path))

        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        (core_mods / "__init__.py").write_text("")
        bad_dir = core_mods / "badmod"
        bad_dir.mkdir()
        (bad_dir / "__init__.py").write_text("")
        (bad_dir / "mod.py").write_text("x = 1  # no manifest")

        try:
            with pytest.raises(ImportError, match="manifest"):
                _load_manifests_from_paths(["core_mods.badmod"])
        finally:
            sys.path.remove(str(tmp_path))
            # Clean up cached module so it doesn't leak into other tests.
            sys.modules.pop("core_mods.badmod", None)
            sys.modules.pop("core_mods.badmod.mod", None)

    def test_raises_on_wrong_id(self, tmp_path):
        """Manifest id must match directory name."""
        import sys
        sys.path.insert(0, str(tmp_path))

        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        (core_mods / "__init__.py").write_text("")
        bad_dir = core_mods / "wrongid"
        bad_dir.mkdir()
        (bad_dir / "__init__.py").write_text("")
        (bad_dir / "mod.py").write_text(
            textwrap.dedent("""\
            from helix_core.mod_system.manifest import ModManifest
            manifest = ModManifest(
                id="not_wrongid",
                display_name="Wrong",
                version="0.1.0",
            )
            """)
        )

        try:
            with pytest.raises(ValueError, match="expected id 'wrongid'"):
                _load_manifests_from_paths(["core_mods.wrongid"])
        finally:
            sys.path.remove(str(tmp_path))
            # Clean up cached modules.
            sys.modules.pop("core_mods.wrongid", None)
            sys.modules.pop("core_mods.wrongid.mod", None)


# ── get_helix_mods integration ───────────────────────────────────────────────


class TestGetHelixMods:
    """End-to-end integration tests for the public API."""

    def test_auto_discovery_integration(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")
        _make_mod_dir(core_mods, "users")
        _make_mod_dir(core_mods, "eln", depends_on=["tags", "users"])

        result = get_helix_mods(base_dir=tmp_path)
        # Should be in topological order: tags, users before eln.
        assert result.index("core_mods.tags") < result.index("core_mods.eln")
        assert result.index("core_mods.users") < result.index("core_mods.eln")
        assert set(result) == {
            "core_mods.tags",
            "core_mods.users",
            "core_mods.eln",
        }

    def test_helix_mods_override(self, tmp_path):
        """When override is set, only listed mods are loaded."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")
        _make_mod_dir(core_mods, "users")

        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["core_mods.tags"],
        )
        assert result == ["core_mods.tags"]

    def test_override_skips_auto_discovery(self, tmp_path):
        """When override is set, auto-discovery is completely bypassed."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")
        _make_mod_dir(core_mods, "users")

        # Even though tags exists on disk, override can reference
        # completely different paths (from installed packages).
        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["core_mods.tags"],
        )
        assert result == ["core_mods.tags"]

    def test_missing_dependency_detected(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "eln", depends_on=["nonexistent"])

        with pytest.raises(ValueError, match="nonexistent"):
            get_helix_mods(base_dir=tmp_path)

    def test_circular_dependency_detected(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "a", depends_on=["b"])
        _make_mod_dir(core_mods, "b", depends_on=["a"])

        with pytest.raises(ValueError, match="Circular dependency"):
            get_helix_mods(base_dir=tmp_path)

    def test_duplicate_id_in_override_raises(self, tmp_path):
        """When HELIX_MODS lists the same mod twice, a clear error is raised."""
        # Use real installed mods for the override test.
        with pytest.raises(ValueError, match="Duplicate mod ID"):
            get_helix_mods(
                helix_mods_override=[
                    "core_mods.tags",
                    "core_mods.tags",
                ],
            )

    def test_id_must_match_directory_name(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        mod_dir = core_mods / "mismatch"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text("")
        (mod_dir / "mod.py").write_text(
            textwrap.dedent("""\
            from helix_core.mod_system.manifest import ModManifest
            manifest = ModManifest(
                id="something_else",
                display_name="Mismatch",
                version="0.1.0",
            )
            """)
        )

        with pytest.raises(ValueError, match="expected id 'mismatch'"):
            get_helix_mods(base_dir=tmp_path)


# ── _sanitize_module_name ────────────────────────────────────────────────────


class TestSanitizeModuleName:
    """Tests for _sanitize_module_name."""

    def test_preserves_valid_identifier(self):
        assert _sanitize_module_name("my_plugin") == "my_plugin"

    def test_replaces_hyphens(self):
        assert _sanitize_module_name("my-plugin") == "my_plugin"

    def test_replaces_dots(self):
        assert _sanitize_module_name("my.plugin") == "my_plugin"

    def test_strips_leading_trailing_special(self):
        assert _sanitize_module_name("-my_plugin-") == "my_plugin"

    def test_prepends_underscore_for_digit_start(self):
        assert _sanitize_module_name("123plugin") == "_123plugin"

    def test_raises_on_all_special_chars(self):
        with pytest.raises(ValueError, match="Cannot derive"):
            _sanitize_module_name("---")


# ── helpers for external mod tests ───────────────────────────────────────────


def _make_external_mod_dir(
    base: Path,
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
    has_apps_py: bool = True,
) -> Path:
    """Create an external mod directory with ``mod.py`` and ``__init__.py``.

    Args:
        base: The parent directory (e.g. ``external_mods/``).
        mod_id: The mod ID (also used as the directory name).
        depends_on: List of dependency mod IDs.
        has_apps_py: If True, create a minimal ``apps.py``.

    Returns:
        The created mod directory path.
    """
    manifest = _make_manifest(mod_id, depends_on)

    dep_parts: list[str] = []
    for d in manifest.depends_on:
        if isinstance(d, str):
            dep_parts.append(f'"{d}"')
        else:
            version_part = f', "version": "{d["version"]}"' if "version" in d else ""
            dep_parts.append(f'{{"id": "{d["id"]}"{version_part}}}')
    dep_str = f"[{', '.join(dep_parts)}]"

    mod_dir = base / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)

    (mod_dir / "__init__.py").write_text("")
    (mod_dir / "mod.py").write_text(
        textwrap.dedent(f"""\
        from helix_core.mod_system.manifest import ModManifest

        manifest = ModManifest(
            id="{manifest.id}",
            display_name="{manifest.display_name}",
            version="{manifest.version}",
            depends_on={dep_str},
        )
        """)
    )

    if has_apps_py:
        safe_name = _sanitize_module_name(mod_id)
        (mod_dir / "apps.py").write_text(
            textwrap.dedent(f"""\
            from django.apps import AppConfig


            class {safe_name.title().replace('_', '')}Config(AppConfig):
                name = "{safe_name}"
                default_auto_field = "django.db.models.BigAutoField"
            """)
        )

    return mod_dir


# ── _load_external_mods_from_json ────────────────────────────────────────────


class TestLoadExternalModsFromJson:
    """Tests for _load_external_mods_from_json."""

    def test_no_json_file_returns_empty(self, tmp_path):
        result = _load_external_mods_from_json(tmp_path)
        assert result == {}

    def test_none_base_dir_returns_empty(self):
        result = _load_external_mods_from_json(None)
        assert result == {}

    def test_empty_mods_list(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({"mods": []}))

        result = _load_external_mods_from_json(tmp_path)
        assert result == {}

    def test_single_external_mod(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [
                {"path": "./external_mods/my-plugin/mod.py"},
            ],
        }))

        result = _load_external_mods_from_json(tmp_path)
        assert "my-plugin" in result
        manifest, dotted_path = result["my-plugin"]
        assert manifest.id == "my-plugin"
        assert dotted_path == "my_plugin"

    def test_multiple_external_mods(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "plugin-a")
        _make_external_mod_dir(ext_dir, "plugin-b")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [
                {"path": "./external_mods/plugin-a/mod.py"},
                {"path": "./external_mods/plugin-b/mod.py"},
            ],
        }))

        result = _load_external_mods_from_json(tmp_path)
        assert set(result.keys()) == {"plugin-a", "plugin-b"}
        assert result["plugin-a"][1] == "plugin_a"
        assert result["plugin-b"][1] == "plugin_b"

    def test_mod_with_dependencies(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["tags"])

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [
                {"path": "./external_mods/my-plugin/mod.py"},
            ],
        }))

        result = _load_external_mods_from_json(tmp_path)
        manifest, _ = result["my-plugin"]
        assert manifest.depends_on == ["tags"]

    def test_missing_mod_py_raises(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        (ext_dir / "empty").mkdir()
        (ext_dir / "empty" / "__init__.py").write_text("")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [
                {"path": "./external_mods/empty/mod.py"},
            ],
        }))

        with pytest.raises(FileNotFoundError, match="does not exist"):
            _load_external_mods_from_json(tmp_path)

    def test_no_init_py_raises(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        mod_dir = ext_dir / "no-package"
        mod_dir.mkdir()
        (mod_dir / "mod.py").write_text(
            textwrap.dedent("""\
            from helix_core.mod_system.manifest import ModManifest
            manifest = ModManifest(
                id="no-package",
                display_name="No Package",
                version="0.1.0",
            )
            """)
        )

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [
                {"path": "./external_mods/no-package/mod.py"},
            ],
        }))

        with pytest.raises(ImportError, match="__init__.py"):
            _load_external_mods_from_json(tmp_path)

    def test_malformed_json_raises(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text("{ not valid json")

        with pytest.raises(ValueError, match="not valid JSON"):
            _load_external_mods_from_json(tmp_path)

    def test_missing_mods_key_raises(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({"something": "else"}))

        with pytest.raises(ValueError, match="'mods' key"):
            _load_external_mods_from_json(tmp_path)

    def test_mods_not_a_list_raises(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({"mods": "not-a-list"}))

        with pytest.raises(ValueError, match="must be a list"):
            _load_external_mods_from_json(tmp_path)

    def test_entry_missing_path_raises(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"not_path": "x"}],
        }))

        with pytest.raises(ValueError, match="'path' key"):
            _load_external_mods_from_json(tmp_path)

    def test_entry_empty_path_raises(self, tmp_path):
        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": ""}],
        }))

        with pytest.raises(ValueError, match="non-empty string"):
            _load_external_mods_from_json(tmp_path)

    def test_adds_parent_to_sys_path(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        import sys
        parent = str(ext_dir)
        assert parent not in sys.path

        _load_external_mods_from_json(tmp_path)

        assert parent in sys.path

    def test_manifest_id_mismatch_raises(self, tmp_path):
        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        mod_dir = ext_dir / "my-plugin"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text("")
        (mod_dir / "mod.py").write_text(
            textwrap.dedent("""\
            from helix_core.mod_system.manifest import ModManifest
            manifest = ModManifest(
                id="wrong_id",
                display_name="Wrong",
                version="0.1.0",
            )
            """)
        )

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        with pytest.raises(ValueError, match="expected id 'my-plugin'"):
            _load_external_mods_from_json(tmp_path)


# ── get_helix_mods with external mods ────────────────────────────────────────


class TestGetHelixModsWithExternal:
    """Integration tests for get_helix_mods() with helix.mods.json."""

    def test_includes_external_mods(self, tmp_path):
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        result = get_helix_mods(base_dir=tmp_path)
        assert "core_mods.tags" in result
        assert "my_plugin" in result

    def test_external_mod_in_topological_order(self, tmp_path):
        """External mod dependencies are respected in sorting."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        # my-plugin depends on tags, so tags must come before my_plugin.
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["tags"])

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        result = get_helix_mods(base_dir=tmp_path)
        assert result.index("core_mods.tags") < result.index("my_plugin")

    def test_external_mod_missing_dependency_detected(self, tmp_path):
        """External mod depending on non-existent mod raises error."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["nonexistent"])

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        with pytest.raises(ValueError, match="nonexistent"):
            get_helix_mods(base_dir=tmp_path)

    def test_duplicate_id_between_core_and_external_raises(self, tmp_path):
        """Same mod ID in core_mods and helix.mods.json raises."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "tags")

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/tags/mod.py"}],
        }))

        with pytest.raises(ValueError, match="Duplicate mod ID"):
            get_helix_mods(base_dir=tmp_path)

    def test_external_mod_with_helix_mods_override(self, tmp_path):
        """External mods are included even when HELIX_MODS is set."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")
        _make_mod_dir(core_mods, "users")

        ext_dir = tmp_path / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["tags"])

        json_path = tmp_path / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        # Override to only load tags from core, but my-plugin from external.
        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["core_mods.tags"],
        )
        assert "core_mods.tags" in result
        assert "core_mods.users" not in result
        assert "my_plugin" in result

    def test_no_helix_mods_json_with_override(self, tmp_path):
        """When no helix.mods.json exists and override is set, only
        the overridden mods are returned."""
        core_mods = tmp_path / "core_mods"
        core_mods.mkdir()
        _make_mod_dir(core_mods, "tags")

        # No helix.mods.json created.

        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["core_mods.tags"],
        )
        assert result == ["core_mods.tags"]
