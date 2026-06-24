from django.contrib import admin

from .models import NotebookEntry, Mention


@admin.register(NotebookEntry)
class NotebookEntryAdmin(admin.ModelAdmin):
    list_display = ["title", "author", "folder", "created_at", "updated_at"]
    search_fields = ["title", "content"]
    list_filter = ["created_at", "author"]


@admin.register(Mention)
class MentionAdmin(admin.ModelAdmin):
    list_display = ["source_entry", "target_type", "target_id"]
    list_filter = ["target_type"]
