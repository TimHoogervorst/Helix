"""Shared test factories for the access mod test suite.

Import ``make_org``, ``make_user``, and ``ensure_membership`` from here so
they're defined once across all access test modules.

``make_user``/``ensure_membership`` are idempotent on purpose: the
``post_save`` signal in ``mods/access/signals.py`` auto-creates a USER
membership whenever a User is saved and an Organization exists, so tests
must never call ``OrganizationMembership.objects.create()`` directly (that
collides on the OneToOne UNIQUE). ``update_or_create`` converges instead.
"""

from core.models import Folder, Project, User
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)


def make_org(name="Test Lab"):
    return Organization.objects.create(name=name)


def make_project(name="Alpha", **kwargs):
    """Create a Project without a synthetic root Folder."""
    return Project.objects.create(name=name, **kwargs)


def add_child_folder(project, name, parent_name=None):
    if parent_name is None:
        return Folder.objects.create(name=name, parent=None, project=project)
    parent = Folder.objects.get(project=project, name=parent_name)
    return Folder.objects.create(name=name, parent=parent, project=project)


def add_grandchild_folder(project, name, child_name):
    parent = Folder.objects.get(project=project, name=child_name, parent__isnull=True)
    return Folder.objects.create(name=name, parent=parent, project=project)


def ensure_membership(user, org, role):
    """Create or update *user*'s membership, avoiding signal collision."""
    membership, _ = OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": role},
    )
    return membership


def make_user(username, org, role=OrganizationRole.USER, password="pass", **kwargs):
    """Create a User and ensure its OrganizationMembership has *role*."""
    user = User.objects.create_user(username=username, password=password, **kwargs)
    ensure_membership(user, org, role)
    return user


def make_superuser(username, password="pass"):
    """Create a Superuser with no membership (exercises the break-glass bypass)."""
    user = User.objects.create_superuser(username=username, password=password)
    OrganizationMembership.objects.filter(user=user).delete()
    return user
