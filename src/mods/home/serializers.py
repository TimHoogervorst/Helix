from rest_framework import serializers

from .models import Card


class CardSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    metric_name = serializers.CharField(source="metric.name", read_only=True)
    is_global = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Card
        fields = [
            "id",
            "owner",
            "owner_username",
            "is_global",
            "metric",
            "metric_name",
            "surface",
            "order",
            "label",
            "icon",
            "formatting",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def get_is_global(self, obj):
        return obj.owner is None
