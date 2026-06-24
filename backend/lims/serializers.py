from rest_framework import serializers

from .models import EntityType, Entity, Action


class EntityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EntityType
        fields = ["id", "name"]


class EntitySerializer(serializers.ModelSerializer):
    entity_type_name = serializers.CharField(source="entity_type.name", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Entity
        fields = [
            "id",
            "name",
            "entity_type",
            "entity_type_name",
            "barcode",
            "properties",
            "folder",
            "created_by",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]


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
