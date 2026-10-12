from rest_framework import serializers

from .models import Tag


class TagSerializer(serializers.ModelSerializer):
    """Canonical serializer for Tag — shared by any mod that needs tag data."""

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "icon"]
        read_only_fields = ["id"]
