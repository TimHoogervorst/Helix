from django.contrib import admin

from .models import Entity, Action


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ["display_id", "name", "schema", "folder", "author", "created_at"]
    search_fields = ["display_id", "name"]
    list_filter = ["schema", "created_at"]


@admin.register(Action)
class ActionAdmin(admin.ModelAdmin):
    list_display = ["entity", "action_type", "performed_by", "created_at"]
    list_filter = ["action_type", "created_at"]
