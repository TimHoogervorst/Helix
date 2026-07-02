from rest_framework import serializers

from .models import Folder, PinnedWorkspace


class FolderSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ["id", "name", "parent", "children", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_children(self, obj):
        # Only include immediate children to avoid deep recursion
        children = Folder.objects.filter(parent=obj)
        return FolderSerializer(children, many=True).data


class PinnedWorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PinnedWorkspace
        fields = ["id", "display_id", "label", "url", "created_at"]
        read_only_fields = ["id", "created_at"]
