"""
Prefix-based display-ID resolution, icon lookup, and cached prefix maps.

Splits out of the old ``references.services`` god module.  Caches the
prefix→model map via Django's cache framework.  Cross-mod queries use
the service registry (``registry.call(...)``) instead of direct model
imports for behavioural queries.
"""
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Model

# Direct imports for data/model relationships — the ORM requires the model
# class for ``model.objects.get(display_id=...)`` lookups.  Per the
# cross-mod boundary rule, data/FK imports stay as direct imports.
# These imports are deferred to the build functions below so that the
# module can be imported even when a particular mod is not installed.


# ── Cache keys ──────────────────────────────────────────────────────────────

PREFIX_CACHE_KEY = "mentions:prefix_map"
MODEL_TYPE_CACHE_KEY = "mentions:model_type_map"
WORKSPACE_CACHE_KEY = "mentions:workspace_map"
CACHE_TIMEOUT = 60 * 60 * 24  # 24 hours


# ── Entity model access ─────────────────────────────────────────────────────


def _get_entity_model() -> type[Model]:
    """Lazy-import to avoid circular imports at module level."""
    from mods.lims.models import Entity

    return Entity


# ── Cache-aware prefix / model-type map builders ─────────────────────────────


def _build_prefix_map() -> dict[str, type[Model]]:
    """Build the merged static+dynamic prefix→model map (no caching).

    Uses ``registry.call("lims.getEntityPrefixes")`` for the cross-mod
    EntityType prefix query instead of a direct import of
    ``mods.lims.models.EntityType``.
    """
    from helix_core.mod_system.registry import registry

    from mods.eln.models import NotebookEntry

    #: Map display_id prefix letter to the model it identifies.
    #: Entity prefixes are loaded dynamically from the EntityType table.
    pmap: dict[str, type[Model]] = {
        "E": NotebookEntry,
    }
    try:
        entity_prefixes = registry.call("lims.getEntityPrefixes")
    except ValueError:
        # Service not registered — fall back to empty dynamic prefixes.
        # This path is exercised during test runs where the real LIMS app
        # is not installed.
        entity_prefixes = []
    entity_model = _get_entity_model()
    for prefix in entity_prefixes:
        pmap[prefix] = entity_model
    return pmap


def _build_model_type_map() -> dict[type[Model], str]:
    """Build the model→type-string map including entity (no caching)."""
    from mods.eln.models import NotebookEntry

    #: Map model class to the short type string used in API responses.
    mmap: dict[type[Model], str] = {
        NotebookEntry: "entry",
    }
    mmap[_get_entity_model()] = "entity"
    return mmap


def get_prefix_map() -> dict[str, type[Model]]:
    """Return the full prefix→model map (static + dynamic), cached."""
    pmap = cache.get(PREFIX_CACHE_KEY)
    if pmap is None:
        pmap = _build_prefix_map()
        cache.set(PREFIX_CACHE_KEY, pmap, CACHE_TIMEOUT)
    return pmap


def get_model_type_map() -> dict[type[Model], str]:
    """Return the model→type-string map, cached."""
    mmap = cache.get(MODEL_TYPE_CACHE_KEY)
    if mmap is None:
        mmap = _build_model_type_map()
        cache.set(MODEL_TYPE_CACHE_KEY, mmap, CACHE_TIMEOUT)
    return mmap


def invalidate_prefix_cache(sender, **kwargs) -> None:
    """Signal handler — clears prefix, model-type, and workspace caches."""
    cache.delete(PREFIX_CACHE_KEY)
    cache.delete(MODEL_TYPE_CACHE_KEY)
    cache.delete(WORKSPACE_CACHE_KEY)


# ── Workspace-aware resolution ────────────────────────────────────────────────


def _build_workspace_map() -> dict[str, str]:
    """Build prefix→workspace_id map from RegisteredEntityType rows.

    Uses ``registry.call("lims.getWorkspaceMap")`` for the cross-mod
    query instead of a direct import of
    ``mods.lims.models.RegisteredEntityType``.
    """
    from helix_core.mod_system.registry import registry

    try:
        return registry.call("lims.getWorkspaceMap")
    except ValueError:
        # Service not registered — fall back to empty map.
        # This path is hit during test runs where the real LIMS app
        # is not installed.
        return {}


def get_workspace_id(prefix: str) -> str | None:
    """Return the workspace_id for *prefix* (cached), or ``None`` if unknown.

    The workspace map is built from :class:`RegisteredEntityType` rows and
    cached with the same TTL as the prefix and model-type maps.
    """
    wmap = cache.get(WORKSPACE_CACHE_KEY)
    if wmap is None:
        wmap = _build_workspace_map()
        cache.set(WORKSPACE_CACHE_KEY, wmap, CACHE_TIMEOUT)
    return wmap.get(prefix.upper())


# ── Resolution ──────────────────────────────────────────────────────────────


def resolve_display_id(display_id: str) -> tuple[Model, ContentType] | None:
    """
    Resolve a ``display_id`` like ``"E1"`` or ``"BLOOD1"`` to a model
    instance and its content type.

    Returns ``(instance, content_type)`` or ``None`` if unresolvable.
    """
    # Extract the prefix (leading letters) from the display_id.
    prefix = ""
    for char in display_id:
        if char.isalpha():
            prefix += char
        else:
            break

    if not prefix:
        return None

    pmap = get_prefix_map()
    model = pmap.get(prefix.upper())
    if model is None:
        return None

    try:
        instance = model.objects.get(display_id__iexact=display_id)
    except model.DoesNotExist:
        return None

    ct = ContentType.objects.get_for_model(model)
    return instance, ct


# ── Icon ─────────────────────────────────────────────────────────────────────


def get_icon(instance, model_type: str) -> str:
    """
    Return the emoji icon for a resolved reference.

    - ELN entries: hardcoded ``"📄"``
    - LIMS entities: the entity type's configured icon, or ``"🧪"`` if none set
    """
    if model_type == "entry":
        return "📄"
    # Entity
    try:
        entity_type = instance.entity_type
        if entity_type and getattr(entity_type, "icon", None):
            return entity_type.icon
    except AttributeError:
        pass
    return "🧪"
