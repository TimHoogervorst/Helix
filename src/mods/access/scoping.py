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
from django.db.models.expressions import RawSQL

from .policies import _is_org_admin, accessible_project_ids

# Depth guard for the shared-subtree recursive CTE.  Prevents runaway
# recursion on a corrupted (cyclic) Folder tree; well above any realistic
# folder depth.
MAX_FOLDER_TREE_DEPTH = 50


def visible_rows_q(user):
    """Return a Q selecting the rows *user* can read.

    A row is visible when the viewer holds effective Read on the row's
    Project — a direct Grant, a Team Grant, or the Organization Admin /
    Superuser override — or the row's Folder sits inside (or equals) a
    subtree rooted at a Folder Share whose target Project the viewer
    reads.

    The accessible Project set is resolved once via
    :func:`accessible_project_ids`.  Shared-subtree coverage is collected
    with a PostgreSQL recursive CTE composed into the filter, relying on
    the indexed ``Folder.parent`` foreign key, with a depth guard.  No
    caching.
    """
    project_ids = accessible_project_ids(user)
    if not project_ids:
        return Q(pk__in=[])

    # Organization Admins and Superusers already read every Project, so
    # the subtree CTE adds nothing — skip it.
    if _is_org_admin(user):
        return Q(project_id__in=project_ids)

    folder_q = _shared_subtree_folder_q(project_ids)
    if folder_q is None:
        return Q(project_id__in=project_ids)
    return Q(project_id__in=project_ids) | folder_q


def _shared_subtree_folder_q(project_ids):
    """Return a Q matching Folders inside subtrees shared into *project_ids*.

    The CTE seeds from every FolderShare targeting an accessible Project
    and walks ``Folder.parent`` downward, so the source Folder and
    all of its nested descendants are included.  Returns ``None`` when no
    FolderShare targets an accessible Project, so callers can skip the
    CTE entirely.
    """
    from core.models import Folder

    from .models import FolderShare

    if not FolderShare.objects.filter(
        target_project_id__in=project_ids
    ).exists():
        return None

    shares_table = FolderShare._meta.db_table
    folders_table = Folder._meta.db_table
    placeholders = ", ".join(["%s"] * len(project_ids))
    sql = (
        "WITH RECURSIVE shared_subtree(id, depth) AS ("
        f" SELECT source_folder_id, 0 FROM {shares_table}"
        f" WHERE target_project_id IN ({placeholders})"
        " UNION ALL"
        f" SELECT f.id, s.depth + 1 FROM {folders_table} f"
        " INNER JOIN shared_subtree s ON f.parent_id = s.id"
        " WHERE s.depth < %s"
        ") SELECT id FROM shared_subtree"
    )
    params = list(project_ids) + [MAX_FOLDER_TREE_DEPTH]
    return Q(folder_id__in=RawSQL(sql, params))
