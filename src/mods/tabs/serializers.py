from rest_framework import serializers

from .models import PinnedWorkspace, TabFolder


def _extract_prefix(display_id: str) -> str:
    """Extract the leading alpha prefix from a display ID (e.g. 'E1' → 'E')."""
    prefix = ""
    for char in (display_id or ""):
        if char.isalpha():
            prefix += char
        else:
            break
    return prefix.upper()


class PinnedWorkspaceSerializer(serializers.ModelSerializer):
    icon = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()
    folder_expanded = serializers.SerializerMethodField()

    class Meta:
        model = PinnedWorkspace
        fields = [
            "id",
            "display_id",
            "label",
            "url",
            "created_at",
            "order",
            "folder",
            "folder_expanded",
            "icon",
            "color",
        ]
        read_only_fields = [
            "id", "created_at", "order", "folder", "folder_expanded", "icon", "color"
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._schema_cache: dict[str, object | None] = {}

    def _get_schema(self, prefix: str):
        if prefix not in self._schema_cache:
            from helix_core.models import Schema
            try:
                self._schema_cache[prefix] = Schema.objects.filter(
                    prefix=prefix, is_active=True
                ).first()
            except Exception:
                self._schema_cache[prefix] = None
        return self._schema_cache[prefix]

    def get_icon(self, obj):
        prefix = _extract_prefix(obj.display_id)
        if not prefix:
            return ""
        schema = self._get_schema(prefix)
        return schema.icon if schema else ""

    def get_color(self, obj):
        prefix = _extract_prefix(obj.display_id)
        if not prefix:
            return ""
        schema = self._get_schema(prefix)
        return schema.color if schema else ""

    def get_folder_expanded(self, obj):
        return obj.folder.expanded if obj.folder_id else None


class TabFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = TabFolder
        fields = ["id", "name", "order", "expanded"]
        read_only_fields = ["id", "order"]


class LayoutTabSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1)
    order = serializers.IntegerField(min_value=0)
    folder = serializers.IntegerField(min_value=1, allow_null=True)


class LayoutFolderSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1)
    order = serializers.IntegerField(min_value=0)
    expanded = serializers.BooleanField()
    tab_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, default=list
    )


class TabLayoutSerializer(serializers.Serializer):
    folders = LayoutFolderSerializer(many=True)
    tabs = LayoutTabSerializer(many=True)
