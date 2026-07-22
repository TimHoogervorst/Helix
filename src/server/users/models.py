from django.conf import settings
from django.db import models


class Affiliation(models.Model):
    """A user's institutional affiliation with role and date range."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="affiliations",
    )
    institution = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    department = models.CharField(max_length=255)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "users_affiliation"
        ordering = ["order"]

    def __str__(self):
        return f"{self.institution} — {self.role}"


class Publication(models.Model):
    """A publication associated with a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="publications",
    )
    title = models.CharField(max_length=512)
    journal = models.CharField(max_length=255)
    year = models.PositiveIntegerField(null=True, blank=True)
    role = models.CharField(max_length=255)
    url = models.URLField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "users_publication"
        ordering = ["order"]

    def __str__(self):
        return self.title


class Recognition(models.Model):
    """A recognition or award associated with a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recognitions",
    )
    title = models.CharField(max_length=255)
    issuer = models.CharField(max_length=255)
    date = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "users_recognition"
        ordering = ["order"]

    def __str__(self):
        return f"{self.title} — {self.issuer}"
