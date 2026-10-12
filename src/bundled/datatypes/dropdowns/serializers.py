from rest_framework import serializers

from .models import Dropdown


class DropdownSerializer(serializers.ModelSerializer):
    """Canonical serializer for Dropdown — shared by any consumer."""

    class Meta:
        model = Dropdown
        fields = ["id", "name", "options", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
