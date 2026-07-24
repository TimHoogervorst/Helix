from django.contrib import admin

from core.mentions.models import Mention

from .models import NotebookEntry


@admin.register(NotebookEntry)
class NotebookEntryAdmin(admin.ModelAdmin):
    list_display = ["name", "author", "folder", "created_at", "updated_at"]
    search_fields = ["name", "content"]
    list_filter = ["created_at", "author"]


@admin.register(Mention)
class MentionAdmin(admin.ModelAdmin):
    list_display = ["source_type", "source_id", "target_type", "target_id"]
    list_filter = ["source_type", "target_type"]
