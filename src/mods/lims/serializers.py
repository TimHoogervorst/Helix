from rest_framework import serializers

from helix_core.column_types import registry as column_type_registry
from helix_core.models import Schema
from .models import Entity, Action, LimsView, Metric


def validate_prefix(value):
    """Prefix must be uppercase letters only."""
    if not value.isalpha() or not value.isupper():
        raise serializers.ValidationError(
            "Prefix must be uppercase letters only (e.g., BLOOD)."
        )
    return value


def validate_columns(value):
    """Each column must have a valid type from the column type registry.

    Also rejects user-defined columns named "Name" (case-insensitive,
    trimmed) since Name is an implicit pseudo-column on every schema.
    """
    if not isinstance(value, list):
        raise serializers.ValidationError("columns must be a JSON array.")
    for i, col in enumerate(value):
        if not isinstance(col, dict):
            raise serializers.ValidationError(f"columns[{i}] must be an object.")
        col_type = col.get("type", "")
        if col_type not in column_type_registry:
            valid_types = sorted(ct.id for ct in column_type_registry)
            raise serializers.ValidationError(
                f"columns[{i}].type must be one of: {', '.join(valid_types)}."
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
        """Resolve the default Schema when none is provided on create."""
        if self.instance is None and ("schema" not in data or data["schema"] is None):
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


class LimsViewSerializer(serializers.ModelSerializer):
    """Serializer for saved Views (LimsView)."""

    owner_username = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = LimsView
        fields = [
            "id",
            "owner",
            "owner_username",
            "name",
            "filter_state",
            "is_public",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


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
            "action",
            "action_type",
            "performed_by",
            "performed_by_username",
            "source_entry",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MetricSerializer(serializers.ModelSerializer):
    """Serializer for live aggregate Metrics."""

    owner_username = serializers.CharField(source="owner.username", read_only=True)
    view_name = serializers.CharField(source="view.name", read_only=True)
    name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Metric
        fields = [
            "id",
            "owner",
            "owner_username",
            "name",
            "view",
            "view_name",
            "aggregate_function",
            "column",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def validate_name(self, value):
        if not value or not value.strip():
            view = self.initial_data.get("view")
            aggregate_fn = self.initial_data.get("aggregate_function", "")
            if view:
                try:
                    from .models import LimsView
                    view_obj = LimsView.objects.get(pk=view)
                    return f"{aggregate_fn.capitalize()} — {view_obj.name}"
                except (LimsView.DoesNotExist, ValueError):
                    pass
            return f"{aggregate_fn.capitalize()} — View"
        return value

    def create(self, validated_data):
        if not validated_data.get("name"):
            view = validated_data.get("view")
            aggregate_fn = validated_data.get("aggregate_function", "")
            validated_data["name"] = f"{aggregate_fn.capitalize()} — {view.name}"
        return super().create(validated_data)
