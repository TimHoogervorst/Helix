from rest_framework import serializers

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
    """Each column must have a valid type from the allowed set."""
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
    return value


class EntityTypeSerializer(serializers.ModelSerializer):
    prefix = serializers.CharField(validators=[validate_prefix])
    columns = serializers.JSONField(validators=[validate_columns])

    class Meta:
        model = EntityType
        fields = ["id", "name", "prefix", "columns", "is_active"]
        read_only_fields = ["id", "is_active"]

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
        fields = ["id", "name", "prefix", "columns", "is_active"]


class EntitySerializer(serializers.ModelSerializer):
    entity_type_name = serializers.CharField(source="entity_type.name", read_only=True)
    entity_type_prefix = serializers.CharField(source="entity_type.prefix", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Entity
        fields = [
            "id",
            "display_id",
            "name",
            "entity_type",
            "entity_type_name",
            "entity_type_prefix",
            "properties",
            "source_entry",
            "folder",
            "created_by",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = ["id", "display_id", "created_by", "created_at"]


class EntityBatchSerializer(serializers.Serializer):
    """Serializer for the batch resolve endpoint."""
    ids = serializers.ListField(
        child=serializers.CharField(), allow_empty=True
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
            "data",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
