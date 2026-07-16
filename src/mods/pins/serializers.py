from rest_framework import serializers

from .models import PinnedWorkspace


class PinnedWorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PinnedWorkspace
        fields = ["id", "display_id", "label", "url", "created_at"]
        read_only_fields = ["id", "created_at"]
