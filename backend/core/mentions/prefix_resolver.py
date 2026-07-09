"""
Prefix-based display-ID resolution, icon lookup, and cached prefix maps.

Splits out of the old ``references.services`` god module.  Caches the
prefix→model map via Django's cache framework so the per-request
``EntityType.objects.values_list()`` query is eliminated.
"""
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Model

from core_mods.eln.models import NotebookEntry
from core_mods.lims.models import EntityType


# ── Cache keys ──────────────────────────────────────────────────────────────

PREFIX_CACHE_KEY = "mentions:prefix_map"
MODEL_TYPE_CACHE_KEY = "mentions:model_type_map"
CACHE_TIMEOUT = 60 * 60 * 24  # 24 hours


# ── Static maps ─────────────────────────────────────────────────────────────

#: Map display_id prefix letter to the model it identifies.
#: Entity prefixes are loaded dynamically from the EntityType table.
PREFIX_MAP: dict[str, type[Model]] = {
    "E": NotebookEntry,
}

#: Map model class to the short type string used in API responses.
MODEL_TYPE_MAP: dict[type[Model], str] = {
    NotebookEntry: "entry",
}


# ── Entity model access ─────────────────────────────────────────────────────


def _get_entity_model() -> type[Model]:
    """Lazy-import to avoid circular imports at module level."""
    from core_mods.lims.models import Entity

    return Entity


# ── Cache-aware prefix / model-type map builders ─────────────────────────────


def _build_prefix_map() -> dict[str, type[Model]]:
    """Build the merged static+dynamic prefix→model map (no caching)."""
    pmap = dict(PREFIX_MAP)
    for et in EntityType.objects.values_list("prefix", flat=True):
        pmap[et] = _get_entity_model()
    return pmap


def _build_model_type_map() -> dict[type[Model], str]:
    """Build the model→type-string map including entity (no caching)."""
    mmap = dict(MODEL_TYPE_MAP)
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
    """Signal handler — clears prefix and model-type caches."""
    cache.delete(PREFIX_CACHE_KEY)
    cache.delete(MODEL_TYPE_CACHE_KEY)


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
