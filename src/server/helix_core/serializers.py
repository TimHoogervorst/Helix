"""Serializers for Schema and SchemaType API endpoints."""

from rest_framework import serializers

from helix_core.models import Schema, SchemaType

ALLOWED_COLUMN_TYPES = {"Text", "Number", "Date", "Boolean", "Reference"}


def validate_prefix(value):
    """Prefix must be uppercase letters only."""
    if not value.isalpha() or not value.isupper():
        raise serializers.ValidationError(
            "Prefix must be uppercase letters only (e.g., BLOOD)."
        )
    return value


def validate_columns(value):
    """Each column must have a valid type from the allowed set.

    Also rejects user-defined columns named "Name" (case-insensitive,
    trimmed) since Name is an implicit pseudo-column on every schema.
    """
    if not isinstance(value, list):
        raise serializers.ValidationError("columns must be a JSON array.")
    for i, col in enumerate(value):
        if not isinstance(col, dict):
            raise serializers.ValidationError(f"columns[{i}] must be an object.")
        col_type = col.get("type", "")
        if col_type not in ALLOWED_COLUMN_TYPES:
            raise serializers.ValidationError(
                f"columns[{i}].type must be one of: {', '.join(sorted(ALLOWED_COLUMN_TYPES))}."
            )
        if "name" not in col:
            raise serializers.ValidationError(
                f"columns[{i}] must have a 'name' field."
            )
        # Reject user-defined columns named "Name" — it is an implicit
        # pseudo-column on every schema (stored as AbstractEntity.name).
        col_name = col.get("name", "")
        if isinstance(col_name, str) and col_name.strip().lower() == "name":
            raise serializers.ValidationError(
                f"columns[{i}] cannot use 'Name' — it is a default column "
                f"on every schema and cannot be added as a user-defined column."
            )
    return value


class SchemaTypeListSerializer(serializers.ModelSerializer):
    """Minimal serializer for listing SchemaTypes (used in dropdowns)."""

    class Meta:
        model = SchemaType
        fields = ["id", "display_name", "workspace_id", "is_active"]


class SchemaListSerializer(serializers.ModelSerializer):
    """Serializer for Schema list view — includes nested schema type info."""
    schema_type_display = serializers.CharField(
        source="schema_type.display_name", read_only=True
    )

    class Meta:
        model = Schema
        fields = [
            "id",
            "name",
            "prefix",
            "schema_type",
            "schema_type_display",
            "columns",
            "is_default",
            "is_active",
            "content_hash",
        ]
        read_only_fields = ["id", "content_hash"]


class SchemaWriteSerializer(serializers.ModelSerializer):
    """Serializer for Schema create/update — validates prefix and columns."""
    prefix = serializers.CharField(validators=[validate_prefix])
    columns = serializers.JSONField(validators=[validate_columns])
    schema_type_display = serializers.CharField(
        source="schema_type.display_name", read_only=True
    )

    class Meta:
        model = Schema
        fields = [
            "id",
            "name",
            "prefix",
            "schema_type",
            "schema_type_display",
            "columns",
            "is_default",
            "is_active",
            "content_hash",
        ]
        read_only_fields = ["id", "is_default", "content_hash", "schema_type_display"]

    def validate_prefix(self, value):
        """Validate prefix format and uniqueness across ALL schemas."""
        value = validate_prefix(value)
        qs = Schema.objects.filter(prefix=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f"A schema with prefix '{value}' already exists."
            )
        return value
