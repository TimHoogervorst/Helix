from django.core.management.base import BaseCommand

from helix_core.attachments import cleanup_staged_attachments


class Command(BaseCommand):
    help = "Remove unreferenced staged Platform attachments older than 24 hours."

    def handle(self, *args, **options):
        removed = cleanup_staged_attachments()
        self.stdout.write(self.style.SUCCESS(f"Removed {removed} expired staged attachment(s)."))
