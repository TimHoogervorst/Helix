from django.contrib import admin

from .models import Entity, EntityType, Action, RegisteredEntityType


@admin.register(EntityType)
class EntityTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "prefix", "is_active"]
    search_fields = ["name", "prefix"]


@admin.register(RegisteredEntityType)
class RegisteredEntityTypeAdmin(admin.ModelAdmin):
    list_display = ["prefix", "display_name", "workspace_id", "content_type"]
    search_fields = ["prefix", "display_name", "workspace_id"]
    list_filter = ["workspace_id"]


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ["display_id", "name", "entity_type", "folder", "created_by", "created_at"]
    search_fields = ["display_id", "name"]
    list_filter = ["entity_type", "created_at"]


@admin.register(Action)
class ActionAdmin(admin.ModelAdmin):
    list_display = ["entity", "action_type", "performed_by", "created_at"]
    list_filter = ["action_type", "created_at"]
