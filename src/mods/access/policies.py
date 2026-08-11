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

    Current behaviour (without Grant/Team models):
      * Organization Admins return ``"edit"`` (effective full access).
      * All other active Users return ``None`` (no Project access).
      * Inactive Users always return ``None``.

    This is the documented policy boundary.  It will be extended when
    Grant and Team models are introduced.
    """
    from .models import OrganizationMembership, OrganizationRole

    if user is None or not user.is_authenticated:
        return None

    if not user.is_active:
        return None

    if user.pk is None:
        return None

    if OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationRole.ADMIN,
    ).exists():
        return "edit"

    # TODO: Resolve through Grants and Team Grants when those models exist.
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
    """Return ``True`` if *user* is an active Organization Admin."""
    from .models import OrganizationMembership, OrganizationRole

    if user is None or not user.is_authenticated:
        return False
    if not user.is_active:
        return False
    if user.pk is None:
        return False

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
      * ``via_project`` is set → ``"project_resource"``
      * *resource* has a ``project_id`` attribute → ``"project_resource"``
      * *resource* has an ``owner_id`` attribute → ``"personal"``
      * Fallback → ``"public"``
    """
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

    if required_level == "read":
        user_role = role(user, via_project)
        return user_role is not None  # read or edit

    if required_level == "edit":
        user_role = role(user, via_project)
        return user_role == "edit"

    if required_level == "admin":
        return _is_org_admin(user)

    if required_level == "owner":
        if resource is None:
            return False
        owner_id = getattr(resource, "owner_id", None)
        return owner_id is not None and owner_id == user.pk

    return False
