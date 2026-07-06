from rest_framework import serializers

from .models import CoreSetting, Folder


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


# ── CoreSetting ────────────────────────────────────────────────────────────


class CoreSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSetting
        fields = ["id", "key", "value"]
        read_only_fields = ["id", "key"]
