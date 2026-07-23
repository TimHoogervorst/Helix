"""Serializers for Schema and SchemaType API endpoints."""

from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from helix_core.models import Schema, SchemaType, EntityHubView

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

    schema_type_id = serializers.SerializerMethodField()

    class Meta:
        model = SchemaType
        fields = ["id", "display_name", "workspace_id", "is_active", "schema_type_id"]

    def get_schema_type_id(self, obj):
        """Derive the schema_type_id used by the entity_hub_view VIEW.

        Convention: ``{mod_name}.{model_name_lower}`` parsed from the
        dotted Python model path (e.g. ``mods.lims.models.Entity`` →
        ``lims.entity``).
        """
        parts = obj.model.split(".")
        if len(parts) >= 4:
            return f"{parts[1]}.{parts[-1].lower()}"
        return obj.workspace_id


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


# ── Entity Hub ────────────────────────────────────────────────────────────


class EntityHubSerializer(serializers.ModelSerializer):
    """Serializer for rows from the entity_hub_view — read-only UNION ALL view."""

    author_username = serializers.CharField(
        source="author.username", read_only=True
    )
    schema_name = serializers.CharField(
        source="schema.name", read_only=True
    )
    schema_prefix = serializers.CharField(
        source="schema.prefix", read_only=True
    )
    schema_type_display = serializers.SerializerMethodField()
    _expanded = serializers.SerializerMethodField()

    class Meta:
        model = EntityHubView
        fields = [
            "id",
            "display_id",
            "name",
            "schema_type_id",
            "schema_type_display",
            "schema_id",
            "schema_name",
            "schema_prefix",
            "status",
            "author",
            "author_username",
            "created_at",
            "updated_at",
            "workspace_id",
            "_expanded",
        ]
        read_only_fields = fields

    def get_schema_type_display(self, obj):
        """Human-readable label for the schema_type_id."""
        mapping = {
            "eln.notebookentry": "Entry",
            "lims.entity": "LIMS Entity",
        }
        return mapping.get(obj.schema_type_id, obj.schema_type_id)

    def get__expanded(self, obj):
        """Extract schema column values from properties JSON.

        Only populated when ``schema_columns`` is passed via serializer
        context (i.e., when a specific Schema is selected).  Returns a dict
        of ``{column_key: value}`` for each column defined on the Schema.
        """
        column_keys = self.context.get("schema_columns")
        if not column_keys:
            return None
        properties = obj.properties or {}
        return {
            key: properties.get(key)
            for key in column_keys
            if key in properties
        }


class EntityHubPaginator(PageNumberPagination):
    """Custom paginator for the Entities Hub endpoint.

    Returns ``results``, ``total``, ``page``, and ``size`` in the
    response envelope — matching the front-end's expected shape.
    """
    page_size = 50
    page_size_query_param = "size"
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            "results": data,
            "total": self.page.paginator.count,
            "page": self.page.number,
            "size": self.get_page_size(self.request),
        })
