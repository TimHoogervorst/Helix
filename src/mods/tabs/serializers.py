from rest_framework import serializers

from .models import PinnedWorkspace


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

    class Meta:
        model = PinnedWorkspace
        fields = ["id", "display_id", "label", "url", "created_at", "icon", "color"]
        read_only_fields = ["id", "created_at", "icon", "color"]

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
