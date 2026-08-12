"""Core Action authorization policies.

The documented policy boundary for Helix access control.  ``role()``
resolves effective Project Role; ``can()`` evaluates authorization
against the hardcoded Core Action policy matrix.

These functions will be extended by later Grant and Shared Folder
slices without changing their signatures.
"""

from __future__ import annotations

from typing import Optional

from django.contrib.auth import get_user_model

User = get_user_model()

# ── hardcoded policy matrix ──────────────────────────────────────────────
#
# Each entry maps a (core_action, resource_category) pair to the
# minimum access level required.
#
# Resource categories:
#   * project_resource — content owned by a Project (entries, entities,
#     folders).
#   * organization_admin — Organization-level administration (Teams,
#     Projects, Grants, Shared Folders, global config).
#   * personal — data owned by an individual User (profile, preferences).
#   * public — operations available to any authenticated User.
#
# Required levels:
#   * read — Project Read role or higher
#   * edit — Project Edit role or higher (includes Organization Admin)
#   * admin — Organization Admin role
#   * owner — the resource's owner
#   * authenticated — any active User
#   * public — any request

POLICY_MATRIX: dict[tuple[str, str], str] = {
    # Project resource reads require at minimum Read access.
    ("read", "project_resource"): "read",
    # Project resource mutations require Edit access.
    ("created", "project_resource"): "edit",
    ("edited", "project_resource"): "edit",
    ("deleted", "project_resource"): "edit",
    # Organization information is readable by all authenticated users.
    ("read", "organization_admin"): "authenticated",
    # Organization administration mutations require Admin.
    ("created", "organization_admin"): "admin",
    ("edited", "organization_admin"): "admin",
    ("deleted", "organization_admin"): "admin",
    # Personal data uses owner policy.
    ("read", "personal"): "owner",
    ("created", "personal"): "owner",
    ("edited", "personal"): "owner",
    ("deleted", "personal"): "owner",
    # Public operations require authentication.
    ("read", "public"): "authenticated",
    ("created", "public"): "authenticated",
    ("edited", "public"): "authenticated",
    ("deleted", "public"): "authenticated",
}

# Human-readable descriptions for the UI.
POLICY_DESCRIPTIONS: dict[str, str] = {
    "project_resource": "Project content — entries, entities, and folders",
    "organization_admin": "Organization administration — teams, projects, grants, and settings",
    "personal": "Personal data — profile, preferences, and owned objects",
    "public": "Public operations — available to all authenticated users",
}

# ── public API ───────────────────────────────────────────────────────────


def role(user, project=None):
    """Return the effective Project Role for *user* on *project*.

    Returns the strongest Project Role (``None``, ``"read"``, or
    ``"edit"``) that *user* holds on *project*, considering direct
    Grants, Team Grants, and Organization Admin bypass.

      * Organization Admins and Superusers return ``"edit"`` (effective full
        access, the break-glass bypass).
      * Active Users get the strongest of direct and active-Team Grants.
      * Edit wins over Read.
      * Inactive Users always return ``None``.
      * Anonymous / unsaved Users always return ``None``.
    """
    from .models import Grant, OrganizationMembership, OrganizationRole, ProjectRole

    if user is None or not user.is_authenticated:
        return None

    if not user.is_active:
        return None

    if user.pk is None:
        return None

    if user.is_superuser:
        return "edit"

    if OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationRole.ADMIN,
    ).exists():
        return "edit"

    if project is None:
        return None

    project_id = project.pk if hasattr(project, "pk") else project

    direct = (
        Grant.objects.filter(project_id=project_id, user=user)
        .values_list("role", flat=True)
        .first()
    )
    if direct == ProjectRole.EDIT:
        return "edit"

    user_group_ids = list(user.groups.values_list("pk", flat=True))
    if user_group_ids:
        team_grant_role = (
            Grant.objects.filter(
                project_id=project_id,
                team__group_id__in=user_group_ids,
            )
            .order_by("role")
            .values_list("role", flat=True)
            .first()
        )
        if team_grant_role == ProjectRole.EDIT:
            return "edit"
        if team_grant_role == ProjectRole.READ:
            return "read"

    if direct == ProjectRole.READ:
        return "read"

    return None


def can(user, action, resource=None, via_project=None):
    """Evaluate whether *user* can perform *action* on *resource*.

    Parameters:
        user: The User instance.
        action: Triple-dotted action identifier
            (e.g. ``"eln.entry.created"``) or a bare core verb
            (``"read"``, ``"created"``, ``"edited"``, ``"deleted"``).
        resource: The resource instance (optional — the hardcoded matrix
            resolves by resource *category*, not instance identity).
        via_project: Optional Project for Shared Folder path resolution
            (reserved for future use).

    Returns:
        ``True`` if the action is permitted, ``False`` otherwise.

    Evaluation order:
      1. Resolve the core verb from *action* (extracting from custom
         Action mappings when necessary).
      2. Organisation Admin bypass — admins can do everything.
      3. Determine the resource category from *resource*.
      4. Look up the hardcoded matrix for (verb, category).
      5. Verify the user meets the required level via :func:`role` or
         ownership checks.
    """
    from helix_core.mod_system.registry import CORE_ACTION_VERBS, registry

    if user is None or not user.is_authenticated:
        return False

    if not user.is_active:
        return False

    if user.pk is None:
        return False

    # ── 1. Resolve the core verb ─────────────────────────────────────
    verb = action.rsplit(".", 1)[-1] if "." in action else action

    if verb not in CORE_ACTION_VERBS:
        # Custom action — resolve mapped core verb from the catalog.
        mod_id = action.split(".")[0]
        catalog = registry.get_action_catalog(mod_id)
        for entry in catalog:
            if entry.get("id") == action:
                mapped_core = entry.get("action_type")
                if mapped_core:
                    verb = mapped_core
                    break

    if verb not in CORE_ACTION_VERBS:
        return False

    # ── 2. Organisation Admin bypass ─────────────────────────────────
    if _is_org_admin(user):
        return True

    # ── 3. Determine resource category ───────────────────────────────
    category = _classify_resource(resource, via_project)

    # ── 4. Look up the policy matrix ─────────────────────────────────
    required_level = POLICY_MATRIX.get((verb, category))
    if required_level is None:
        # No policy entry — deny by default.
        return False

    # ── 5. Verify the required level ─────────────────────────────────
    return _check_level(user, required_level, resource, via_project)


def effective_role(user, resource):
    """Resolve the effective role *user* holds on *resource*.

    The resource may be a Folder, Entry, or Entity.  Returns the
    strongest role (``"edit"``, ``"read"``, or ``None``) the viewer
    holds, considering:

      * the Organization Admin / Superuser bypass (always ``"edit"``),
      * direct and Team Grants on the resource's Project, and
      * every Folder Share path covering the resource — level
        intersection with the target Project role, the read cap on the
        shared top-level Folder, and subtree coverage.

    This is the single enforcement seam for per-resource authorization.
    """
    from .models import FolderShare, ShareLevel

    if user is None or not user.is_authenticated:
        return None
    if not user.is_active:
        return None
    if user.pk is None:
        return None

    if _is_org_admin(user):
        return "edit"

    if resource is None or not hasattr(resource, "project_id"):
        return None

    best = role(user, resource.project_id)
    if best == "edit":
        return "edit"

    folder_id = _resolve_folder_id(resource)
    if folder_id is None:
        return best

    shares = FolderShare.objects.filter(
        source_folder__project_id=resource.project_id,
    ).select_related("source_folder").only(
        "id", "source_folder_id", "target_project_id", "level",
    )

    resource_ancestors = _ancestor_ids_for_folder(folder_id)

    for share in shares:
        covers = (
            share.source_folder_id == folder_id
            or share.source_folder_id in resource_ancestors
        )
        if not covers:
            continue

        target_role = role(user, share.target_project_id)
        if target_role is None:
            continue

        if _is_resource_the_shared_folder(resource, share):
            derived = "read"
        elif target_role == "edit" and share.level == ShareLevel.READ_WRITE:
            derived = "edit"
        else:
            derived = "read"

        if derived == "edit":
            return "edit"
        if best is None:
            best = "read"

    return best


def accessible_project_ids(user):
    """Return the set of Project IDs the viewer can access.

    Covers direct Grants, Team Grants, and the Organization Admin and
    Superuser override (which returns every Project).  The grant paths are
    resolved in a single query.  Anonymous, inactive, and unsaved Users
    get an empty set.
    """
    from django.db.models import Q

    from core.models import Project
    from .models import Grant, OrganizationMembership, OrganizationRole

    if user is None or not user.is_authenticated:
        return set()
    if not user.is_active:
        return set()
    if user.pk is None:
        return set()

    if user.is_superuser:
        return set(Project.objects.values_list("pk", flat=True))

    if OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationRole.ADMIN,
    ).exists():
        return set(Project.objects.values_list("pk", flat=True))

    group_ids = list(user.groups.values_list("pk", flat=True))
    grant_filter = Q(user=user)
    if group_ids:
        grant_filter |= Q(team__group_id__in=group_ids)

    return set(
        Grant.objects.filter(grant_filter).values_list("project_id", flat=True)
    )


def get_policy_matrix():
    """Return the hardcoded policy matrix as a list for the API.

    Each entry is a dict with keys ``id``, ``core_action``,
    ``resource``, ``resource_label``, and ``required_level``.
    """
    matrix: list[dict] = []
    for (verb, category), level in POLICY_MATRIX.items():
        matrix.append({
            "id": f"{verb}_{category}",
            "core_action": verb,
            "resource": category,
            "resource_label": POLICY_DESCRIPTIONS.get(category, category),
            "required_level": level,
        })
    return matrix


# ── internal helpers ─────────────────────────────────────────────────────


def _is_org_admin(user) -> bool:
    """Return ``True`` if *user* is an active Organization Admin or Superuser."""
    from .models import OrganizationMembership, OrganizationRole

    if user is None or not user.is_authenticated:
        return False
    if not user.is_active:
        return False
    if user.pk is None:
        return False

    if user.is_superuser:
        return True

    return OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationRole.ADMIN,
        user__is_active=True,
    ).exists()


def _classify_resource(resource, via_project=None) -> str:
    """Determine the resource category for policy lookup.

    Returns one of ``"project_resource"``, ``"organization_admin"``,
    ``"personal"``, or ``"public"``.

    Heuristics (crude for now — refined when Projects carry model FKs):
      * *resource* has a ``_policy_resource_category`` attribute → use it
      * ``via_project`` is set → ``"project_resource"``
      * *resource* has a ``project_id`` attribute → ``"project_resource"``
      * *resource* has an ``owner_id`` attribute → ``"personal"``
      * Fallback → ``"public"``
    """
    if resource is not None and hasattr(resource, "_policy_resource_category"):
        return resource._policy_resource_category

    if via_project is not None:
        return "project_resource"

    if resource is None:
        return "public"

    if hasattr(resource, "project_id"):
        return "project_resource"

    if hasattr(resource, "owner_id"):
        return "personal"

    return "public"


def _check_level(user, required_level: str, resource=None, via_project=None) -> bool:
    """Verify that *user* meets *required_level* for *resource*.

    Returns ``True`` when the user satisfies the level; ``False``
    otherwise.
    """
    if required_level == "public":
        return True

    if required_level == "authenticated":
        return user.is_authenticated and user.is_active

    effective_role = _effective_project_role(user, resource, via_project)

    if required_level == "read":
        return effective_role is not None

    if required_level == "edit":
        return effective_role == "edit"

    if required_level == "admin":
        return _is_org_admin(user)

    if required_level == "owner":
        if resource is None:
            return False
        owner_id = getattr(resource, "owner_id", None)
        return owner_id is not None and owner_id == user.pk

    return False


def _effective_project_role(user, resource=None, via_project=None):
    """Resolve the effective Project Role considering shared folders.

    When *via_project* is explicitly provided and differs from the
    resource's owning project, the result is the intersection of the
    user's target Project Role and the Folder Share level.  When there
    is no matching share, the effective role is ``None`` (deny).

    The shared top-level Folder itself is always capped at Read
    through the target path (never Edit).
    """
    if via_project is None and resource is not None and hasattr(resource, "project_id"):
        via_project = resource.project_id

    if via_project is None:
        return None

    resource_project_id = (
        resource.project_id
        if resource is not None and hasattr(resource, "project_id")
        else None
    )

    own_via = (
        via_project is not None
        and resource_project_id is not None
        and via_project == resource_project_id
    )

    if own_via or resource_project_id is None:
        return role(user, via_project)

    share = _find_folder_share(resource, via_project)
    if share is None:
        return None

    target_role = role(user, via_project)
    if target_role is None:
        return None

    if _is_resource_the_shared_folder(resource, share):
        return "read"

    from .models import ShareLevel

    if target_role == "read":
        return "read"

    if share.level == ShareLevel.READ_WRITE:
        return "edit"

    return "read"


def _is_resource_the_shared_folder(resource, share) -> bool:
    """Return True if *resource* is the shared source Folder itself."""
    from core.models import Folder

    if not isinstance(resource, Folder):
        return False
    return resource.id == share.source_folder_id


def _resolve_folder_id(resource):
    """Return the closest folder ID for *resource*.

    When *resource* is a Folder, returns its ``id``.  When *resource*
    is another model (Entry, Entity) with a ``folder_id`` FK, returns
    that.  Returns ``None`` otherwise.
    """
    if resource is None:
        return None
    if hasattr(resource, "id") and type(resource).__name__ == "Folder":
        return resource.id
    return getattr(resource, "folder_id", None)


def _find_folder_share(resource, via_project):
    """Find the FolderShare that covers *resource* for *via_project*.

    Returns the FolderShare if one exists where *resource* is a
    descendant of the shared source folder, or ``None``.
    """
    from .models import FolderShare

    if resource is None or not hasattr(resource, "project_id"):
        return None

    folder_id = _resolve_folder_id(resource)

    candidates = list(
        FolderShare.objects.filter(
            target_project_id=via_project,
            source_folder__project_id=resource.project_id,
        ).select_related("source_folder")
    )

    if not candidates:
        return None

    if folder_id is not None:
        resource_ancestors = _ancestor_ids_for_folder(folder_id)
        for share in candidates:
            if share.source_folder_id == folder_id or share.source_folder_id in resource_ancestors:
                return share
        return None

    return candidates[0] if candidates else None


def _ancestor_ids_for_folder(folder_id):
    """Return a set of ancestor folder IDs for *folder_id*."""
    from core.models import Folder

    ids = set()
    try:
        folder = Folder.objects.only("id", "parent_id").get(pk=folder_id)
    except Folder.DoesNotExist:
        return ids
    node = folder.parent
    while node is not None:
        ids.add(node.id)
        node_id = node.parent_id
        if node_id is None:
            break
        try:
            node = Folder.objects.only("id", "parent_id").get(pk=node_id)
        except Folder.DoesNotExist:
            break
    return ids
