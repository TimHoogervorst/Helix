"""
Idempotent seed data command.

Creates (if they don't already exist):
- One superuser (from env vars SEED_USERNAME/SEED_PASSWORD, or admin/admin)
- CoreSetting: allow_self_registration (from ALLOW_SELF_REGISTRATION env var)
- One root Folder: Default
- Profile data on the seed superuser (admin-focused)
"""
import os

from django.core.management.base import BaseCommand

from core.models import CoreSetting, Folder, User
from mods.users.models import Affiliation, Publication, Recognition


class Command(BaseCommand):
    help = "Seed the database with initial data (idempotent)."

    def handle(self, *args, **options):
        user = self._seed_superuser()
        self._seed_settings()
        self._seed_folders()
        self._seed_profile_data(user)
        self.stdout.write(self.style.SUCCESS("Seed data complete."))

    def _seed_superuser(self):
        username = os.environ.get("SEED_USERNAME") or "admin"
        password = os.environ.get("SEED_PASSWORD") or "admin"

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"Superuser '{username}' already exists — skipping.")
            return User.objects.get(username=username)
        user = User.objects.create_superuser(
            username=username,
            email=f"{username}@openscience.local",
            password=password,
        )
        self.stdout.write(
            self.style.SUCCESS(f"Created superuser: {username} / {password}")
        )
        return user

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

    def _seed_profile_data(self, user):
        """Populate the seed user with admin profile data.

        Idempotent — skips sections that are already populated.
        """
        # Profile JSON
        if not user.profile:
            user.profile = {
                "title": "",
                "position": "System Administrator",
                "pronouns": "",
                "location": "Helix Lab",
                "bio": (
                    "Platform administrator for the Helix open-science "
                    "research environment. Manages user accounts, data integrity, "
                    "and system configuration."
                ),
                "orcid": "",
            }
            user.save()
            self.stdout.write("Populated profile for seed user.")
        else:
            self.stdout.write("Profile already populated — skipping.")

        # Affiliations
        if not Affiliation.objects.filter(user=user).exists():
            Affiliation.objects.bulk_create([
                Affiliation(
                    user=user, institution="Helix Platform",
                    role="System Administrator", department="Core Infrastructure",
                    start_date="2024-01-01", end_date=None, order=0,
                ),
                Affiliation(
                    user=user, institution="OpenScience Initiative",
                    role="Platform Engineer", department="Research Computing",
                    start_date="2023-06-01", end_date="2024-01-01", order=1,
                ),
            ])
            self.stdout.write("Seeded affiliations for seed user.")

        # Publications
        if not Publication.objects.filter(user=user).exists():
            Publication.objects.bulk_create([
                Publication(
                    user=user, title="Helix: An open-science platform for collaborative research",
                    journal="Journal of Open Source Software",
                    year=2024, role="Maintainer",
                    url="https://doi.org/10.1234/joss.00000", order=0,
                ),
                Publication(
                    user=user, title="Reproducible workflows in computational biology",
                    journal="PLOS Computational Biology",
                    year=2023, role="Contributor",
                    url="https://doi.org/10.1234/pcbi.00000", order=1,
                ),
            ])
            self.stdout.write("Seeded publications for seed user.")

        # Recognitions
        if not Recognition.objects.filter(user=user).exists():
            Recognition.objects.bulk_create([
                Recognition(
                    user=user, title="Best Open-Source Tool",
                    issuer="Research Software Alliance", date="2025", order=0,
                ),
                Recognition(
                    user=user, title="Community Builder Award",
                    issuer="Open Science Foundation", date="2024", order=1,
                ),
            ])
            self.stdout.write("Seeded recognitions for seed user.")
