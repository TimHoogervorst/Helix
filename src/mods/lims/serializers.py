from rest_framework import serializers

from helix_core.column_types import registry as column_type_registry
from helix_core.models import Schema, SchemaType
from .models import Entity, Action, LimsView, Metric
from core.models import Folder, Project
from mods.tags.serializers import TagSerializer


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


def validate_reference_properties(properties, schema_instance):
    """Validate targeted reference values for a concrete schema."""
    if not properties or not schema_instance or not schema_instance.columns:
        return properties

    from .models import Entity as EntityModel

    for col_def in schema_instance.columns:
        if col_def.get("type") != "reference":
            continue
        col_name = col_def.get("name")
        if not col_name or col_name not in properties:
            continue
        value = properties[col_name]
        if value is None or value == "":
            continue

        expected_schema_id = col_def.get("referenceSchemaId")
        expected_schema_type_id = col_def.get("referenceSchemaTypeId")
        ct = column_type_registry.get_column_type("reference")
        if ct is None:
            continue
        result = ct.validate(value)
        if result is not True:
            raise serializers.ValidationError({col_name: result})

        if (
            expected_schema_id is not None or expected_schema_type_id is not None
        ) and isinstance(value, str):
            try:
                ref = (
                    EntityModel.objects
                    .only("schema_id", "schema__name", "schema__schema_type_id")
                    .select_related("schema", "schema__schema_type")
                    .get(display_id=value)
                )
            except EntityModel.DoesNotExist:
                raise serializers.ValidationError({
                    col_name: f"Referenced entity '{value}' does not exist.",
                })
            if expected_schema_id is not None and ref.schema_id != expected_schema_id:
                target_schema = Schema.objects.get(pk=expected_schema_id)
                raise serializers.ValidationError({
                    col_name: (
                        f"Referenced entity '{value}' belongs to schema "
                        f"'{ref.schema.name}' but the column expects "
                        f"'{target_schema.name}'."
                    ),
                })
            if (
                expected_schema_type_id is not None
                and ref.schema.schema_type_id != expected_schema_type_id
            ):
                try:
                    target_schema_type = SchemaType.objects.get(
                        pk=expected_schema_type_id
                    )
                except SchemaType.DoesNotExist:
                    raise serializers.ValidationError({
                        col_name: "Referenced schema type does not exist.",
                    })
                raise serializers.ValidationError({
                    col_name: (
                        f"Referenced entity '{value}' belongs to schema type "
                        f"'{ref.schema.schema_type.display_name}' but the column "
                        f"expects '{target_schema_type.display_name}'."
                    ),
                })
    return properties


class EntitySerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    effective_role = serializers.SerializerMethodField()
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
    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=True,
    )
    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(), required=False,
    )
    project_name = serializers.CharField(source="project.name", read_only=True)

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
            "project",
            "project_name",
            "author",
            "author_username",
            "status",
            "updated_at",
            "created_at",
            "tags",
            "effective_role",
        ]
        read_only_fields = [
            "id",
            "display_id",
            "author",
            "updated_at",
            "created_at",
            "tags",
            "effective_role",
        ]

    def get_effective_role(self, obj):
        from mods.access.policies import effective_role

        request = self.context.get("request")
        return effective_role(request.user, obj) if request else "read"

    def validate(self, data):
        folder = data.get("folder")
        project = data.get("project")
        if folder is None and project is None:
            raise serializers.ValidationError(
                {"project": "Provide a project when folder is empty."}
            )
        if folder is not None:
            if project is not None and project.pk != folder.project_id:
                raise serializers.ValidationError(
                    {"folder": "The folder must belong to the project."}
                )
            data["project"] = folder.project
        return data

    def validate_properties(self, properties):
        """Validate reference column values against their target schemas.

        For each property whose column definition includes a concrete or
        type-level target, the referenced entity must exist and match it.
        Open references only receive format validation.
        """
        schema_instance = self._resolve_schema_for_validation()
        formula_names = {
            column.get("name")
            for column in (
                (schema_instance.schema_type.columns if schema_instance else [])
                + (schema_instance.columns if schema_instance else [])
            )
            if column.get("type") == "formula" and column.get("name")
        }
        if self.instance is not None:
            properties = dict(properties)
            for name in formula_names:
                if name in properties and properties[name] != self.instance.properties.get(name):
                    raise serializers.ValidationError(
                        {name: "Computed values can only be changed by registration or recompute."}
                    )
                if name in self.instance.properties:
                    properties[name] = self.instance.properties[name]
            for key in ("_computed_field_versions", "_computed_field_schema_hash"):
                if key in self.instance.properties:
                    properties[key] = self.instance.properties[key]
        elif formula_names.intersection(properties):
            raise serializers.ValidationError(
                "Computed values must be produced by entity registration."
            )
        return validate_reference_properties(properties, schema_instance)

    def _resolve_schema_for_validation(self):
        """Return the Schema instance for property validation.

        For updates the instance carries the schema.  For creates we read
        the schema from the raw payload (still an int at this point because
        field-to-internal conversion happens after field validation).
        """
        if self.instance is not None:
            return self.instance.schema

        schema_raw = self.initial_data.get("schema")
        if isinstance(schema_raw, Schema):
            return schema_raw
        if isinstance(schema_raw, int):
            try:
                return Schema.objects.get(pk=schema_raw)
            except Schema.DoesNotExist:
                return None
        return None

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
    result_row_id = serializers.CharField(required=False, allow_blank=False)
    name = serializers.CharField(required=True, allow_blank=True)
    folder_id = serializers.IntegerField(required=False, allow_null=True)
    values = serializers.DictField(default=dict)


class EntityBatchRegisterSerializer(serializers.Serializer):
    """Serializer for the batch-register endpoint payload."""
    schema_id = serializers.IntegerField(required=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
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

    def validate_view(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            if value.owner_id != user.id and not value.is_public:
                raise serializers.ValidationError(
                    "You do not have access to this view."
                )
        return value

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
