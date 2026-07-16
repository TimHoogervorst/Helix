"""Tests for ModManifest dataclass validation."""

import pytest

from helix_core.mod_system.manifest import ModManifest


class TestModManifestConstruction:
    """Happy-path construction and attribute access."""

    def test_minimal_manifest(self):
        m = ModManifest(id="test", display_name="Test", version="0.1.0")
        assert m.id == "test"
        assert m.display_name == "Test"
        assert m.version == "0.1.0"
        assert m.depends_on == []
        assert m.core_version is None
        assert m.icon is None
        assert m.description is None

    def test_minimal_manifest_without_version(self):
        """Version is optional — mods without it are valid."""
        m = ModManifest(id="test", display_name="Test")
        assert m.id == "test"
        assert m.display_name == "Test"
        assert m.version is None
        assert m.depends_on == []

    def test_manifest_with_optional_fields(self):
        m = ModManifest(
            id="eln",
            display_name="Electronic Lab Notebook",
            core_version=">=2.0",
            icon="flask-conical",
            description="A digital lab notebook for science teams.",
        )
        assert m.core_version == ">=2.0"
        assert m.icon == "flask-conical"
        assert m.description == "A digital lab notebook for science teams."

    def test_manifest_with_dependencies(self):
        m = ModManifest(
            id="eln",
            display_name="Electronic Lab Notebook",
            version="0.1.0",
            depends_on=["lims", "tags"],
        )
        assert m.id == "eln"
        assert m.depends_on == ["lims", "tags"]

    def test_depends_on_defaults_to_empty_list(self):
        m = ModManifest(id="a", display_name="A", version="1.0")
        assert m.depends_on == []
        # Default should be a new list each time (not a shared mutable).
        m2 = ModManifest(id="b", display_name="B", version="1.0")
        assert m2.depends_on is not m.depends_on

    def test_depends_on_object_form(self):
        """depends_on accepts dict entries with id and optional version."""
        m = ModManifest(
            id="eln",
            display_name="ELN",
            depends_on=[
                "lims",
                {"id": "tags", "version": ">=2.0"},
            ],
        )
        assert m.depends_on == [
            "lims",
            {"id": "tags", "version": ">=2.0"},
        ]

    def test_dependency_ids_property(self):
        """dependency_ids extracts ID strings from mixed depends_on entries."""
        m = ModManifest(
            id="eln",
            display_name="ELN",
            depends_on=[
                "lims",
                {"id": "tags", "version": ">=2.0"},
                {"id": "users"},
            ],
        )
        assert m.dependency_ids == ["lims", "tags", "users"]

    def test_dependency_ids_all_strings(self):
        """dependency_ids works when all entries are plain strings."""
        m = ModManifest(
            id="eln",
            display_name="ELN",
            depends_on=["lims", "tags"],
        )
        assert m.dependency_ids == ["lims", "tags"]

    def test_dependency_ids_empty(self):
        """dependency_ids returns empty list when no dependencies."""
        m = ModManifest(id="core", display_name="Core")
        assert m.dependency_ids == []


class TestModManifestValidation:
    """Rejection of invalid field values."""

    # ── id ────────────────────────────────────────────────────────────

    def test_id_missing_raises_type_error(self):
        with pytest.raises(TypeError):
            ModManifest(display_name="X", version="1.0")  # type: ignore[call-arg]

    def test_id_none_raises_type_error(self):
        with pytest.raises(TypeError):
            ModManifest(id=None, display_name="X", version="1.0")  # type: ignore[arg-type]

    def test_id_empty_string_raises_value_error(self):
        with pytest.raises(ValueError, match="id"):
            ModManifest(id="", display_name="X", version="1.0")

    def test_id_not_a_string_raises_type_error(self):
        with pytest.raises(TypeError, match="id"):
            ModManifest(id=123, display_name="X", version="1.0")  # type: ignore[arg-type]

    # ── display_name ──────────────────────────────────────────────────

    def test_display_name_none_raises_type_error(self):
        with pytest.raises(TypeError, match="display_name"):
            ModManifest(id="x", display_name=None, version="1.0")  # type: ignore[arg-type]

    def test_display_name_empty_string_raises_value_error(self):
        with pytest.raises(ValueError, match="display_name"):
            ModManifest(id="x", display_name="", version="1.0")

    def test_display_name_not_a_string_raises_type_error(self):
        with pytest.raises(TypeError, match="display_name"):
            ModManifest(id="x", display_name=42, version="1.0")  # type: ignore[arg-type]

    # ── version ───────────────────────────────────────────────────────

    def test_version_none_is_valid(self):
        """version can be None — it is now optional."""
        m = ModManifest(id="x", display_name="X", version=None)
        assert m.version is None

    def test_version_omitted_is_valid(self):
        """version can be omitted entirely."""
        m = ModManifest(id="x", display_name="X")
        assert m.version is None

    def test_version_empty_string_raises_value_error(self):
        with pytest.raises(ValueError, match="version"):
            ModManifest(id="x", display_name="X", version="")

    def test_version_not_a_string_raises_type_error(self):
        with pytest.raises(TypeError, match="version"):
            ModManifest(id="x", display_name="X", version=1.0)  # type: ignore[arg-type]

    # ── depends_on ────────────────────────────────────────────────────

    def test_depends_on_not_a_list_raises_type_error(self):
        with pytest.raises(TypeError, match="depends_on"):
            ModManifest(
                id="x", display_name="X", version="1.0", depends_on="lims"  # type: ignore[arg-type]
            )

    def test_depends_on_item_not_str_or_dict_raises_type_error(self):
        with pytest.raises(TypeError, match="depends_on"):
            ModManifest(
                id="x",
                display_name="X",
                version="1.0",
                depends_on=["lims", 42],  # type: ignore[list-item]
            )

    def test_depends_on_dict_missing_id_raises_value_error(self):
        with pytest.raises(ValueError, match="must have an 'id' key"):
            ModManifest(
                id="x",
                display_name="X",
                depends_on=[{"version": ">=1.0"}],
            )

    def test_depends_on_dict_id_not_str_raises_type_error(self):
        with pytest.raises(TypeError, match="\.id must be str"):
            ModManifest(
                id="x",
                display_name="X",
                depends_on=[{"id": 42}],  # type: ignore[typeddict-item]
            )

    def test_depends_on_dict_version_not_str_raises_type_error(self):
        with pytest.raises(TypeError, match="\.version must be str"):
            ModManifest(
                id="x",
                display_name="X",
                depends_on=[{"id": "lims", "version": 42}],  # type: ignore[typeddict-item]
            )

    # ── core_version ─────────────────────────────────────────────────

    def test_core_version_not_str_raises_type_error(self):
        with pytest.raises(TypeError, match="core_version"):
            ModManifest(
                id="x", display_name="X", core_version=42  # type: ignore[arg-type]
            )

    # ── icon ──────────────────────────────────────────────────────────

    def test_icon_not_str_raises_type_error(self):
        with pytest.raises(TypeError, match="icon"):
            ModManifest(
                id="x", display_name="X", icon=42  # type: ignore[arg-type]
            )

    # ── description ───────────────────────────────────────────────────

    def test_description_not_str_raises_type_error(self):
        with pytest.raises(TypeError, match="description"):
            ModManifest(
                id="x", display_name="X", description=42  # type: ignore[arg-type]
            )
