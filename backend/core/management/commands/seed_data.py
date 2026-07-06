"""
Idempotent seed data command.

Creates (if they don't already exist):
- One superuser (from env vars SEED_USERNAME/SEED_PASSWORD, or admin/admin)
- CoreSetting: allow_self_registration (from ALLOW_SELF_REGISTRATION env var)
- One root Folder: Default
"""
import os

from django.core.management.base import BaseCommand

from core.models import CoreSetting, Folder, User


class Command(BaseCommand):
    help = "Seed the database with initial data (idempotent)."

    def handle(self, *args, **options):
        self._seed_superuser()
        self._seed_settings()
        self._seed_folders()
        self.stdout.write(self.style.SUCCESS("Seed data complete."))

    def _seed_superuser(self):
        username = os.environ.get("SEED_USERNAME") or "admin"
        password = os.environ.get("SEED_PASSWORD") or "admin"

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"Superuser '{username}' already exists — skipping.")
            return
        User.objects.create_superuser(
            username=username,
            email=f"{username}@openscience.local",
            password=password,
        )
        self.stdout.write(
            self.style.SUCCESS(f"Created superuser: {username} / {password}")
        )

    def _seed_settings(self):
        allow_reg = os.environ.get("ALLOW_SELF_REGISTRATION", "false").lower() == "true"
        setting, created = CoreSetting.objects.get_or_create(
            key="allow_self_registration",
            defaults={"value": allow_reg},
        )
        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created CoreSetting: allow_self_registration = {allow_reg}"
                )
            )
        else:
            self.stdout.write(
                f"CoreSetting 'allow_self_registration' already exists — skipping."
            )

    def _seed_folders(self):
        if Folder.objects.filter(name="Default").exists():
            self.stdout.write("Folder 'Default' already exists — skipping.")
            return
        Folder.objects.create(name="Default", parent=None)
        self.stdout.write(self.style.SUCCESS("Created root folder: Default"))
