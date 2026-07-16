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

    def test_version_missing_raises_type_error(self):
        with pytest.raises(TypeError):
            ModManifest(id="x", display_name="X")  # type: ignore[call-arg]

    def test_version_none_raises_type_error(self):
        with pytest.raises(TypeError, match="version"):
            ModManifest(id="x", display_name="X", version=None)  # type: ignore[arg-type]

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

    def test_depends_on_item_not_a_string_raises_type_error(self):
        with pytest.raises(TypeError, match="depends_on"):
            ModManifest(
                id="x",
                display_name="X",
                version="1.0",
                depends_on=["lims", 42],  # type: ignore[list-item]
            )
