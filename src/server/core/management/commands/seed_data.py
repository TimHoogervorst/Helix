"""
Idempotent seed data command.

Creates (if they don't already exist):
- One superuser (from env vars SEED_USERNAME/SEED_PASSWORD, or admin/admin)
- CoreSetting: allow_self_registration (from ALLOW_SELF_REGISTRATION env var)
- One root Folder: Default
- Profile data on the seed superuser (Barbara McClintock tribute)
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
        """Populate the seed user with Barbara McClintock tribute profile data.

        Idempotent — skips sections that are already populated.
        """
        # Profile JSON
        if not user.profile:
            user.profile = {
                "title": "Dr.",
                "position": "Distinguished Geneticist",
                "pronouns": "she/her",
                "location": "Ithaca, NY",
                "bio": (
                    "Geneticist and cytogeneticist whose discovery of transposition — "
                    "jumping genes — reshaped our understanding of heredity. "
                    "Awarded the Nobel Prize in Physiology or Medicine in 1983 for "
                    "this groundbreaking work."
                ),
                "orcid": "Helix University",
            }
            user.save()
            self.stdout.write("Populated profile for seed user.")
        else:
            self.stdout.write("Profile already populated — skipping.")

        # Affiliations
        if not Affiliation.objects.filter(user=user).exists():
            Affiliation.objects.bulk_create([
                Affiliation(
                    user=user, institution="Cold Spring Harbor Laboratory",
                    role="Research Geneticist", department="Carnegie Institution of Washington",
                    start_date="1941-01-01", end_date="1967-12-31", order=0,
                ),
                Affiliation(
                    user=user, institution="Cornell University",
                    role="Professor", department="Plant Breeding and Genetics",
                    start_date="1936-01-01", end_date="1941-12-31", order=1,
                ),
                Affiliation(
                    user=user, institution="University of Missouri",
                    role="Graduate Researcher", department="Botany",
                    start_date="1923-01-01", end_date="1927-12-31", order=2,
                ),
            ])
            self.stdout.write("Seeded affiliations for seed user.")

        # Publications
        if not Publication.objects.filter(user=user).exists():
            Publication.objects.bulk_create([
                Publication(
                    user=user, title="The origin and behavior of mutable loci in maize",
                    journal="Proceedings of the National Academy of Sciences",
                    year=1950, role="Author",
                    url="https://doi.org/10.1073/pnas.36.6.344", order=0,
                ),
                Publication(
                    user=user, title="Induction of instability at selected loci in maize",
                    journal="Genetics", year=1953, role="Author",
                    url="https://doi.org/10.1093/genetics/38.6.579", order=1,
                ),
            ])
            self.stdout.write("Seeded publications for seed user.")

        # Recognitions
        if not Recognition.objects.filter(user=user).exists():
            Recognition.objects.bulk_create([
                Recognition(
                    user=user, title="Nobel Prize in Physiology or Medicine",
                    issuer="Nobel Foundation", date="1983", order=0,
                ),
                Recognition(
                    user=user, title="National Medal of Science",
                    issuer="United States Government", date="1970", order=1,
                ),
                Recognition(
                    user=user, title="Thomas Hunt Morgan Medal",
                    issuer="Genetics Society of America", date="1981", order=2,
                ),
            ])
            self.stdout.write("Seeded recognitions for seed user.")
