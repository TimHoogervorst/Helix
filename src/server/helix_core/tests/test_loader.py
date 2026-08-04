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
    _read_json_manifest,
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
        base: The ``mods/`` directory path.
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
        #   lims, tags, users, tabs, core → depends_on=[]
        manifests = {
            "tags": _make_manifest("tags"),
            "users": _make_manifest("users"),
            "lims": _make_manifest("lims"),
            "eln": _make_manifest("eln", depends_on=["lims", "tags"]),
            "library": _make_manifest("library", depends_on=["tags", "eln"]),
            "tabs": _make_manifest("tabs"),
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
            "tags", "users", "lims", "eln", "library", "tabs", "core",
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
    """Auto-discovery of mod.py files in a mods/ directory."""

    def test_empty_directory(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        result = _auto_discover(server_dir)
        assert result == {}

    def test_directory_without_mod_py(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "eln").mkdir()
        result = _auto_discover(server_dir)
        assert result == {}

    def test_single_mod_discovered(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        result = _auto_discover(server_dir)
        assert "tags" in result
        assert isinstance(result["tags"], ModManifest)
        assert result["tags"].id == "tags"

    def test_multiple_mods_discovered(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")
        _make_mod_dir(mods_dir, "eln", depends_on=["tags", "users"])

        result = _auto_discover(server_dir)
        assert set(result.keys()) == {"tags", "users", "eln"}
        assert result["eln"].depends_on == ["tags", "users"]

    def test_skips_underscore_directories(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "_private")

        result = _auto_discover(server_dir)
        assert "_private" not in result

    def test_skips_non_directories(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "some_file.txt").write_text("hello")

        result = _auto_discover(server_dir)
        assert result == {}

    def test_raises_when_base_dir_is_none(self):
        with pytest.raises(ValueError, match="base_dir"):
            _auto_discover(None)

    def test_nonexistent_mods_dir(self, tmp_path):
        server_dir = tmp_path / "server"
        result = _auto_discover(server_dir)
        assert result == {}


# ── _load_manifests_from_paths ───────────────────────────────────────────────


class TestLoadManifestsFromPaths:
    """Loading manifests from explicit dotted paths."""

    def test_loads_from_dotted_path(self):
        # Uses the actual installed mods.tags package.
        result = _load_manifests_from_paths(["mods.tags"])
        assert "tags" in result
        assert isinstance(result["tags"], ModManifest)
        assert result["tags"].id == "tags"

    def test_loads_multiple_paths(self):
        result = _load_manifests_from_paths(
            ["mods.tags", "mods.users"]
        )
        assert set(result.keys()) == {"tags", "users"}

    def test_raises_on_nonexistent_path(self):
        with pytest.raises(ImportError, match="nonexistent"):
            _load_manifests_from_paths(["mods.nonexistent"])

    def test_raises_on_missing_manifest(self, tmp_path):
        """A mod.py without a 'manifest' attribute raises ImportError."""
        import sys
        sys.path.insert(0, str(tmp_path))

        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "__init__.py").write_text("")
        bad_dir = mods_dir / "badmod"
        bad_dir.mkdir()
        (bad_dir / "__init__.py").write_text("")
        (bad_dir / "mod.py").write_text("x = 1  # no manifest")

        try:
            with pytest.raises(ImportError, match="manifest"):
                _load_manifests_from_paths(["mods.badmod"])
        finally:
            sys.path.remove(str(tmp_path))
            # Clean up cached module so it doesn't leak into other tests.
            sys.modules.pop("mods.badmod", None)
            sys.modules.pop("mods.badmod.mod", None)

    def test_raises_on_wrong_id(self, tmp_path):
        """Manifest id must match directory name."""
        import sys
        sys.path.insert(0, str(tmp_path))

        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "__init__.py").write_text("")
        bad_dir = mods_dir / "wrongid"
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
                _load_manifests_from_paths(["mods.wrongid"])
        finally:
            sys.path.remove(str(tmp_path))
            # Clean up cached modules.
            sys.modules.pop("mods.wrongid", None)
            sys.modules.pop("mods.wrongid.mod", None)


# ── get_helix_mods integration ───────────────────────────────────────────────


class TestGetHelixMods:
    """End-to-end integration tests for the public API."""

    def test_auto_discovery_integration(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")
        _make_mod_dir(mods_dir, "eln", depends_on=["tags", "users"])

        result = get_helix_mods(base_dir=server_dir)
        # Should be in topological order: tags, users before eln.
        assert result.index("mods.tags") < result.index("mods.eln")
        assert result.index("mods.users") < result.index("mods.eln")
        assert set(result) == {
            "mods.tags",
            "mods.users",
            "mods.eln",
        }

    def test_helix_mods_override(self, tmp_path):
        """When override is set, only listed mods are loaded."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")

        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["mods.tags"],
        )
        assert result == ["mods.tags"]

    def test_override_skips_auto_discovery(self, tmp_path):
        """When override is set, auto-discovery is completely bypassed."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")

        # Even though tags exists on disk, override can reference
        # completely different paths (from installed packages).
        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["mods.tags"],
        )
        assert result == ["mods.tags"]

    def test_missing_dependency_detected(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "eln", depends_on=["nonexistent"])

        with pytest.raises(ValueError, match="nonexistent"):
            get_helix_mods(base_dir=server_dir)

    def test_circular_dependency_detected(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "a", depends_on=["b"])
        _make_mod_dir(mods_dir, "b", depends_on=["a"])

        with pytest.raises(ValueError, match="Circular dependency"):
            get_helix_mods(base_dir=server_dir)

    def test_duplicate_id_in_override_raises(self, tmp_path):
        """When HELIX_MODS lists the same mod twice, a clear error is raised."""
        # Use real installed mods for the override test.
        with pytest.raises(ValueError, match="Duplicate mod ID"):
            get_helix_mods(
                helix_mods_override=[
                    "mods.tags",
                    "mods.tags",
                ],
            )

    def test_id_must_match_directory_name(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        mod_dir = mods_dir / "mismatch"
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
            get_helix_mods(base_dir=server_dir)


# ── helpers for JSON manifest tests ──────────────────────────────────────────


def _make_json_manifest_file(
    mod_dir: Path,
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
    version: str | None = "0.1.0",
    core_version: str | None = None,
    icon: str | None = None,
    description: str | None = None,
) -> Path:
    """Create a ``modManifest.json`` file in a mod directory.

    Args:
        mod_dir: The mod directory path.
        mod_id: The mod ID.
        depends_on: List of dependency entries (strings or dicts).
        version: Semver version string.
        core_version: Optional minimum platform version.
        icon: Optional legacy icon name.
        description: Optional short description.

    Returns:
        The path to the created JSON file.
    """
    data: dict = {
        "id": mod_id,
        "displayName": mod_id.title(),
    }
    if version is not None:
        data["version"] = version
    if depends_on is not None:
        data["dependsOn"] = depends_on
    if core_version is not None:
        data["coreVersion"] = core_version
    if icon is not None:
        data["icon"] = icon
    if description is not None:
        data["description"] = description

    json_path = mod_dir / "modManifest.json"
    json_path.write_text(json.dumps(data))
    return json_path


def _make_mod_dir_with_json(
    base: Path,
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
    json_depends_on: list[str | dict[str, str]] | None = None,
    with_mod_py: bool = True,
) -> Path:
    """Create a mod directory with ``modManifest.json`` and optionally ``mod.py``.

    When *with_mod_py* is True, a ``mod.py`` is also created so that the
    directory passes the ``__init__.py`` check.  The JSON is always created.

    If *json_depends_on* is provided, it is used in the JSON file while
    *depends_on* goes into ``mod.py``.  This lets tests set up mismatched
    manifests to verify JSON preference.

    Args:
        base: The ``mods/`` directory path.
        mod_id: The mod ID (also used as the directory name).
        depends_on: List of dependency entries for ``mod.py``.
        json_depends_on: List of dependency entries for ``modManifest.json``.
            Defaults to *depends_on* when not set.
        with_mod_py: If True, also create a ``mod.py`` and ``__init__.py``.

    Returns:
        The created mod directory path.
    """
    mod_dir = base / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)

    _make_json_manifest_file(
        mod_dir,
        mod_id,
        depends_on=json_depends_on if json_depends_on is not None else depends_on,
    )

    if with_mod_py:
        (mod_dir / "__init__.py").write_text("")
        _make_mod_dir(base, mod_id, depends_on=depends_on)

    return mod_dir


# ── _read_json_manifest ─────────────────────────────────────────────────────


class TestReadJsonManifest:
    """Tests for _read_json_manifest."""

    def test_reads_valid_json_manifest(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        _make_json_manifest_file(mod_dir, "my-mod")

        manifest = _read_json_manifest(mod_dir, "my-mod")
        assert isinstance(manifest, ModManifest)
        assert manifest.id == "my-mod"
        assert manifest.display_name == "My-Mod"
        assert manifest.version == "0.1.0"
        assert manifest.depends_on == []

    def test_reads_with_string_dependencies(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        _make_json_manifest_file(mod_dir, "my-mod", depends_on=["tags", "users"])

        manifest = _read_json_manifest(mod_dir, "my-mod")
        assert manifest.depends_on == ["tags", "users"]
        assert manifest.dependency_ids == ["tags", "users"]

    def test_reads_with_object_dependencies(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        _make_json_manifest_file(
            mod_dir,
            "my-mod",
            depends_on=["tags", {"id": "lims", "version": ">=2.0"}],
        )

        manifest = _read_json_manifest(mod_dir, "my-mod")
        assert manifest.depends_on == ["tags", {"id": "lims", "version": ">=2.0"}]
        assert manifest.dependency_ids == ["tags", "lims"]

    def test_reads_all_optional_fields(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        _make_json_manifest_file(
            mod_dir,
            "my-mod",
            version="2.0.0",
            core_version=">=1.0",
            icon="flask-conical",
            description="A test mod",
        )

        manifest = _read_json_manifest(mod_dir, "my-mod")
        assert manifest.version == "2.0.0"
        assert manifest.core_version == ">=1.0"
        assert manifest.icon == "flask-conical"
        assert manifest.description == "A test mod"

    def test_missing_file_raises(self, tmp_path):
        mod_dir = tmp_path / "no-json"
        mod_dir.mkdir()

        with pytest.raises(FileNotFoundError, match="modManifest.json not found"):
            _read_json_manifest(mod_dir, "no-json")

    def test_invalid_json_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text("{ not valid json")

        with pytest.raises(ValueError, match="not valid JSON"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_missing_id_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text(
            json.dumps({"displayName": "No Id"})
        )

        with pytest.raises(ValueError, match="missing required field 'id'"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_missing_display_name_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text(
            json.dumps({"id": "my-mod"})
        )

        with pytest.raises(ValueError, match="missing required field 'displayName'"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_non_object_json_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text(json.dumps([1, 2, 3]))

        with pytest.raises(ValueError, match="must be a JSON object"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_id_mismatch_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        _make_json_manifest_file(mod_dir, "wrong-id")

        with pytest.raises(ValueError, match="expected id 'my-mod'"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_invalid_depends_on_type_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text(json.dumps({
            "id": "my-mod",
            "displayName": "My Mod",
            "dependsOn": "not-a-list",
        }))

        with pytest.raises(TypeError, match="depends_on must be a list"):
            _read_json_manifest(mod_dir, "my-mod")

    def test_empty_display_name_raises(self, tmp_path):
        mod_dir = tmp_path / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text(json.dumps({
            "id": "my-mod",
            "displayName": "",
        }))

        with pytest.raises(ValueError, match="display_name must be a non-empty string"):
            _read_json_manifest(mod_dir, "my-mod")


# ── _auto_discover with modManifest.json ────────────────────────────────────


class TestAutoDiscoverWithJsonManifest:
    """Auto-discovery tests for modManifest.json support."""

    def test_discovers_json_manifest(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        mod_dir = mods_dir / "my-mod"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text("")
        _make_json_manifest_file(mod_dir, "my-mod")

        result = _auto_discover(server_dir)
        assert "my-mod" in result
        assert result["my-mod"].id == "my-mod"

    def test_prefers_json_when_both_present(self, tmp_path):
        """When both modManifest.json and mod.py exist, JSON wins."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        # JSON says depends on "tags", mod.py says depends on "users"
        _make_mod_dir_with_json(mods_dir,
            "my-mod",
            depends_on=["users"],
            json_depends_on=["tags"],
        )

        result = _auto_discover(server_dir)
        assert result["my-mod"].depends_on == ["tags"]

    def test_falls_back_to_mod_py_when_no_json(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        result = _auto_discover(server_dir)
        assert "tags" in result
        assert result["tags"].id == "tags"

    def test_skips_directory_with_neither(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "empty").mkdir()

        result = _auto_discover(server_dir)
        assert "empty" not in result

    def test_handles_mixed_json_and_mod_py(self, tmp_path):
        """Some mods have JSON, some have mod.py."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        # JSON-only mod
        json_dir = mods_dir / "json-mod"
        json_dir.mkdir()
        (json_dir / "__init__.py").write_text("")
        _make_json_manifest_file(json_dir, "json-mod")
        # mod.py-only mod
        _make_mod_dir(mods_dir, "py-mod")

        result = _auto_discover(server_dir)
        assert set(result.keys()) == {"json-mod", "py-mod"}

    def test_json_manifest_with_dependencies_integration(self, tmp_path):
        """Auto-discover mods with JSON manifests and validate dependencies."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir_with_json(mods_dir,
            "eln",
            depends_on=["tags", "lims"],
            json_depends_on=["tags", "lims"],
            with_mod_py=True,
        )
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "lims")

        manifests = _auto_discover(server_dir)
        assert set(manifests.keys()) == {"eln", "tags", "lims"}
        # eln should use JSON manifest
        assert manifests["eln"].depends_on == ["tags", "lims"]

    def test_invalid_json_in_auto_discover_raises(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        mod_dir = mods_dir / "bad-json"
        mod_dir.mkdir()
        (mod_dir / "modManifest.json").write_text("{ not json")

        with pytest.raises(ValueError, match="not valid JSON"):
            _auto_discover(server_dir)


# ── _load_manifests_from_paths with modManifest.json ────────────────────────


class TestLoadManifestsFromPathsWithJsonManifest:
    """Tests for _load_manifests_from_paths with modManifest.json support."""

    def test_prefers_json_when_present(self, tmp_path):
        import sys
        sys.path.insert(0, str(tmp_path))

        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "__init__.py").write_text("")
        _make_mod_dir_with_json(mods_dir,
            "my-mod",
            depends_on=["users"],
            json_depends_on=["tags"],
        )

        try:
            result = _load_manifests_from_paths(["mods.my-mod"])
            assert result["my-mod"].depends_on == ["tags"]
        finally:
            sys.path.remove(str(tmp_path))

    def test_json_only_mod(self, tmp_path):
        """A mod directory with only modManifest.json (no mod.py) is loadable."""
        import sys
        sys.path.insert(0, str(tmp_path))

        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "__init__.py").write_text("")
        mod_dir = mods_dir / "json-only"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text("")
        _make_json_manifest_file(mod_dir, "json-only")

        try:
            result = _load_manifests_from_paths(["mods.json-only"])
            assert result["json-only"].id == "json-only"
        finally:
            sys.path.remove(str(tmp_path))

    def test_directory_with_neither_raises(self, tmp_path):
        import sys
        sys.path.insert(0, str(tmp_path))

        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        (mods_dir / "__init__.py").write_text("")
        empty_dir = mods_dir / "empty"
        empty_dir.mkdir()
        (empty_dir / "__init__.py").write_text("")

        try:
            with pytest.raises(ImportError, match="neither"):
                _load_manifests_from_paths(["mods.empty"])
        finally:
            sys.path.remove(str(tmp_path))


# ── get_helix_mods integration with JSON manifests ──────────────────────────


class TestGetHelixModsWithJsonManifests:
    """Integration tests for get_helix_mods() with modManifest.json."""

    def test_auto_discovery_with_json_manifests(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir_with_json(mods_dir,
            "eln",
            depends_on=["tags"],
            json_depends_on=["tags", "lims"],
        )
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "lims")

        result = get_helix_mods(base_dir=server_dir)
        # tags and lims must come before eln
        assert result.index("mods.tags") < result.index("mods.eln")
        assert result.index("mods.lims") < result.index("mods.eln")

    def test_mixed_json_and_py_manifests(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        # JSON manifest for eln
        _make_mod_dir_with_json(mods_dir,
            "eln",
            depends_on=["users"],
            json_depends_on=["tags"],
        )
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")

        result = get_helix_mods(base_dir=server_dir)
        # tags must come before eln (JSON deps win)
        assert result.index("mods.tags") < result.index("mods.eln")

    def test_json_manifest_missing_dependency_detected(self, tmp_path):
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir_with_json(mods_dir,
            "eln",
            depends_on=["nonexistent"],
            json_depends_on=["nonexistent"],
        )

        with pytest.raises(ValueError, match="nonexistent"):
            get_helix_mods(base_dir=server_dir)


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
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        ext_dir = server_dir / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin")

        json_path = server_dir / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        result = get_helix_mods(base_dir=server_dir)
        assert "mods.tags" in result
        assert "my_plugin" in result

    def test_external_mod_in_topological_order(self, tmp_path):
        """External mod dependencies are respected in sorting."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        ext_dir = server_dir / "external_mods"
        ext_dir.mkdir()
        # my-plugin depends on tags, so tags must come before my_plugin.
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["tags"])

        json_path = server_dir / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        result = get_helix_mods(base_dir=server_dir)
        assert result.index("mods.tags") < result.index("my_plugin")

    def test_external_mod_missing_dependency_detected(self, tmp_path):
        """External mod depending on non-existent mod raises error."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        ext_dir = server_dir / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "my-plugin", depends_on=["nonexistent"])

        json_path = server_dir / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/my-plugin/mod.py"}],
        }))

        with pytest.raises(ValueError, match="nonexistent"):
            get_helix_mods(base_dir=server_dir)

    def test_duplicate_id_between_core_and_external_raises(self, tmp_path):
        """Same mod ID in mods/ and helix.mods.json raises."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        ext_dir = server_dir / "external_mods"
        ext_dir.mkdir()
        _make_external_mod_dir(ext_dir, "tags")

        json_path = server_dir / "helix.mods.json"
        json_path.write_text(json.dumps({
            "mods": [{"path": "./external_mods/tags/mod.py"}],
        }))

        with pytest.raises(ValueError, match="Duplicate mod ID"):
            get_helix_mods(base_dir=server_dir)

    def test_external_mod_with_helix_mods_override(self, tmp_path):
        """External mods are included even when HELIX_MODS is set."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")
        _make_mod_dir(mods_dir, "users")

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
            helix_mods_override=["mods.tags"],
        )
        assert "mods.tags" in result
        assert "mods.users" not in result
        assert "my_plugin" in result

    def test_no_helix_mods_json_with_override(self, tmp_path):
        """When no helix.mods.json exists and override is set, only
        the overridden mods are returned."""
        mods_dir = tmp_path / "mods"
        mods_dir.mkdir()
        server_dir = tmp_path / "server"
        server_dir.mkdir()
        _make_mod_dir(mods_dir, "tags")

        # No helix.mods.json created.

        result = get_helix_mods(
            base_dir=tmp_path,
            helix_mods_override=["mods.tags"],
        )
        assert result == ["mods.tags"]
