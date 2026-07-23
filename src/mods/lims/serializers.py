from rest_framework import serializers

from helix_core.models import Schema
from .models import EntityType, Entity, Action

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
            raise serializers.ValidationError(f"columns[{i}] must have a 'name' field.")
        # Reject user-defined columns named "Name" — it is an implicit
        # pseudo-column on every schema (stored as Entity.name).
        col_name = col.get("name", "")
        if isinstance(col_name, str) and col_name.strip().lower() == "name":
            raise serializers.ValidationError(
                f"columns[{i}] cannot use 'Name' — it is a default column "
                f"on every schema and cannot be added as a user-defined column."
            )
    return value


class EntityTypeSerializer(serializers.ModelSerializer):
    prefix = serializers.CharField(validators=[validate_prefix])
    columns = serializers.JSONField(validators=[validate_columns])

    class Meta:
        model = EntityType
        fields = ["id", "name", "prefix", "icon", "columns", "is_active", "content_hash"]
        read_only_fields = ["id", "is_active", "content_hash"]

    def validate_prefix(self, value):
        """Validate prefix format and uniqueness."""
        value = validate_prefix(value)
        # Check uniqueness (exclude self on update)
        qs = EntityType.objects.filter(prefix=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f"An entity type with prefix '{value}' already exists."
            )
        return value


class EntityTypeDetailSerializer(serializers.ModelSerializer):
    """Read serializer that includes is_active (used for list/retrieve)."""
    class Meta:
        model = EntityType
        fields = ["id", "name", "prefix", "icon", "columns", "is_active", "content_hash"]


class EntitySerializer(serializers.ModelSerializer):
    schema = serializers.PrimaryKeyRelatedField(
        queryset=Schema.objects.all(),
        required=False,
        allow_null=False,
    )
    schema_name = serializers.CharField(source="schema.name", read_only=True)
    schema_prefix = serializers.CharField(source="schema.prefix", read_only=True)
    author_username = serializers.CharField(source="author.username", read_only=True)
    source_entry_display_id = serializers.CharField(
        source="source_entry.display_id", read_only=True, default=None
    )

    class Meta:
        model = Entity
        fields = [
            "id",
            "display_id",
            "name",
            "schema",
            "schema_name",
            "schema_prefix",
            "properties",
            "source_entry",
            "source_entry_display_id",
            "folder",
            "author",
            "author_username",
            "status",
            "updated_at",
            "created_at",
        ]
        read_only_fields = ["id", "display_id", "author", "updated_at", "created_at"]

    def validate(self, data):
        """Resolve the default Schema when none is provided."""
        if "schema" not in data or data["schema"] is None:
            from helix_core.models import SchemaType
            try:
                schema_type = SchemaType.objects.get(
                    workspace_id="lims", model="mods.lims.models.Entity",
                )
                data["schema"] = Schema.objects.get(
                    schema_type=schema_type, is_default=True,
                )
            except (SchemaType.DoesNotExist, Schema.DoesNotExist):
                raise serializers.ValidationError({
                    "schema": "No schema provided and no default schema exists. "
                              "Please provide a schema."
                })
        return data


class EntityBatchSerializer(serializers.Serializer):
    """Serializer for the batch resolve endpoint."""
    ids = serializers.ListField(
        child=serializers.CharField(), allow_empty=True
    )


class EntityBatchRegisterRowSerializer(serializers.Serializer):
    """Serializer for a single row in the batch-register payload."""
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.CharField(required=True, allow_blank=True)
    values = serializers.DictField(default=dict)


class EntityBatchRegisterSerializer(serializers.Serializer):
    """Serializer for the batch-register endpoint payload."""
    schema_id = serializers.IntegerField(required=True)
    rows = serializers.ListField(
        child=EntityBatchRegisterRowSerializer(),
        allow_empty=False,
    )


class ActionSerializer(serializers.ModelSerializer):
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    performed_by_username = serializers.CharField(
        source="performed_by.username", read_only=True
    )

    class Meta:
        model = Action
        fields = [
            "id",
            "entity",
            "entity_name",
            "action_type",
            "performed_by",
            "performed_by_username",
            "source_entry",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
