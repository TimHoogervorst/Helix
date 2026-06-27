"""
Idempotent seed data command.

Creates (if they don't already exist):
- One superuser: admin / admin
- Three EntityTypes: DNA, Chemical, General
- One root Folder: Default
"""
from django.core.management.base import BaseCommand

from core.models import Folder, User
from workspaces.lims.models import EntityType


class Command(BaseCommand):
    help = "Seed the database with initial data (idempotent)."

    def handle(self, *args, **options):
        self._seed_superuser()
        self._seed_folders()
        self.stdout.write(self.style.SUCCESS("Seed data complete."))

    def _seed_superuser(self):
        if User.objects.filter(username="admin").exists():
            self.stdout.write("Superuser 'admin' already exists — skipping.")
            return
        User.objects.create_superuser(username="admin", email="admin@openscience.local", password="admin")
        self.stdout.write(self.style.SUCCESS("Created superuser: admin / admin"))

    def _seed_folders(self):
        if Folder.objects.filter(name="Default").exists():
            self.stdout.write("Folder 'Default' already exists — skipping.")
            return
        Folder.objects.create(name="Default", parent=None)
        self.stdout.write(self.style.SUCCESS("Created root folder: Default"))

    def _seed_entity_types(self):
        created = 0
        defaults = [
            ("DNA", "DNA"),
            ("Chemical", "CHEM"),
            ("General", "GEN"),
        ]
        for name, prefix in defaults:
            if not EntityType.objects.filter(name=name).exists():
                EntityType.objects.create(name=name, prefix=prefix, columns=[])
                created += 1
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created {created} entity types."))
        else:
            self.stdout.write("Entity types already exist — skipping.")
