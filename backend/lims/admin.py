from django.contrib import admin

from .models import Entity, EntityType, Action


@admin.register(EntityType)
class EntityTypeAdmin(admin.ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ["name", "entity_type", "barcode", "folder", "created_by", "created_at"]
    search_fields = ["name", "barcode"]
    list_filter = ["entity_type", "created_at"]


@admin.register(Action)
class ActionAdmin(admin.ModelAdmin):
    list_display = ["entity", "action_type", "performed_by", "created_at"]
    list_filter = ["action_type", "created_at"]
