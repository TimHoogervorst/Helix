"""Read scoping — the shared "visible rows" definition.

The single definition of which rows a viewer can see on a read surface:
effective Read on the row's Project, or the row's Folder sitting inside
(or equal to) a subtree shared into a Project the viewer reads.

Issue #475 births this definition; every later read-scoping ticket
(LIMS entity lists, ELN entry lists, mention search, Metric evaluation)
reuses it.
"""

from __future__ import annotations

from django.db.models import Q

from .policies import _is_org_admin, accessible_project_ids


def visible_rows_q(user):
    """Return a Q selecting the rows *user* can read.

    A row is visible when the viewer holds effective Read on the row's
    Project — a direct Grant, a Team Grant, or the Organization Admin /
    Superuser override — or the row's Folder sits inside (or equals) a
    subtree rooted at a Folder Share whose target Project the viewer
    reads.

    The accessible Project set is resolved once via
    :func:`accessible_project_ids`. Shared-subtree coverage is collected
    from the stored Source Path. No caching.
    """
    project_ids = accessible_project_ids(user)
    if not project_ids:
        return Q(pk__in=[])

    # Organization Admins and Superusers already read every Project, so
    # Shared paths add nothing for admins — skip the extra predicate.
    if _is_org_admin(user):
        return Q(project_id__in=project_ids)

    folder_q = _shared_subtree_folder_q(project_ids)
    if folder_q is None:
        return Q(project_id__in=project_ids)
    return Q(project_id__in=project_ids) | folder_q


def visible_folders_q(user):
    """Return a Q selecting folders *user* can read.

    Folder rows store their project directly, so shared-subtree coverage
    needs a primary-key lookup rather than the ``folder_id`` lookup used for
    content rows.
    """
    project_ids = accessible_project_ids(user)
    if not project_ids:
        return Q(pk__in=[])
    if _is_org_admin(user):
        return Q(project_id__in=project_ids)

    folder_q = _shared_subtree_folder_q(project_ids, lookup_field="pk")
    if folder_q is None:
        return Q(project_id__in=project_ids)
    return Q(project_id__in=project_ids) | folder_q


def _shared_subtree_folder_q(project_ids, lookup_field="folder_id"):
    """Return a Q matching rows whose Source Path crosses a shared Folder."""
    from .models import FolderShare

    shared_folder_ids = list(
        FolderShare.objects.filter(
            target_project_id__in=project_ids,
        ).values_list("source_folder_id", flat=True)
    )
    if not shared_folder_ids:
        return None

    path_q = Q()
    for folder_id in shared_folder_ids:
        path_q |= Q(source_path__contains=[{"kind": "folder", "id": folder_id}])

    if lookup_field == "pk":
        path_q |= Q(pk__in=shared_folder_ids)

    return path_q
