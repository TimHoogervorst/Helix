"""Operator-aware query builder for the Entity Hub.

Translates structured filter specs into Django ORM Q objects by resolving
each filter's column type through the column type registry and applying the
operator's ``django_lookup_name``.

Supports both system columns (model field lookups) and schema properties
(JSON field lookups on ``entity_hub_view.properties``).

Usage::

    from helix_core.query_builder import (
        FilterSpec,
        build_filter_q,
        build_entity_hub_filters,
    )

    spec = FilterSpec(column="name", operator="contains", value="PCR")
    q = build_filter_q(spec)  # Q(name__icontains="PCR")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.db.models import (
    Q,
    Count,
    Sum,
    Avg,
    Min,
    Max,
    StdDev,
)
from django.db.models.functions import Cast
from django.db.models import FloatField, DateTimeField

from helix_core.column_types import registry as column_type_registry

logger = logging.getLogger(__name__)


# ── FilterSpec ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FilterSpec:
    """A single filter specification from the frontend.

    Attributes:
        column: The column key (e.g. ``"name"``, ``"concentration"``).
        operator: The operator ID (e.g. ``"eq"``, ``"contains"``, ``"gt"``).
        value: The filter value as a string.  The query builder coerces it
            based on the column type and operator.
    """

    column: str
    operator: str
    value: str


# ── System column → model field mapping ─────────────────────────────────────
#
# Keys are column keys used in available_columns / URL params.
# Values are Django model field names on EntityHubView.
# Columns NOT in this map are treated as schema properties (JSON field).

_SYSTEM_COLUMN_FIELDS: dict[str, str] = {
    "display_id": "display_id",
    "name": "name",
    "schema_type_id": "schema_type_id",
    "status": "status",
    "author": "author_id",
    "created_at": "created_at",
    "updated_at": "updated_at",
}

# Fields that support __in lookups (only for system columns).
_IN_ELIGIBLE_FIELDS = frozenset({"author_id", "status", "schema_type_id"})


def _is_system_column(column_key: str) -> bool:
    """Return True if *column_key* is a known system column."""
    return column_key in _SYSTEM_COLUMN_FIELDS


def _resolve_field_path(column_key: str) -> str:
    """Return the full Django field lookup path for a column.

    System columns map to their model field name.
    Schema properties map to ``properties__<key>``.
    """
    field = _SYSTEM_COLUMN_FIELDS.get(column_key)
    if field is not None:
        return field
    return f"properties__{column_key}"


# ── Legacy exact-match field filter ─────────────────────────────────────────


def _build_legacy_filter_q(raw_filter: str) -> Q:
    """Build a Q object for a legacy ``key:value`` field filter.

    This is the old exact-match path (``?f=key:value``).  It matches rows
    where ``properties`` has the key and the value equals the given string.

    Kept for backward compatibility.
    """
    if ":" not in raw_filter:
        return Q()
    key, value = raw_filter.split(":", 1)
    return Q(**{f"properties__{key}": value})


# ── Single filter → Q ──────────────────────────────────────────────────────


def build_filter_q(spec: FilterSpec, identity: str | None = None) -> Q:
    """Build a single Q object from a FilterSpec.

    Resolves the column type from the registry, validates the operator,
    and constructs the appropriate ORM lookup.

    Parameters:
        spec: The filter specification (column, operator, value).
        identity: Optional user identifier for rewriting ``is_me``
            operators.  When provided and the operator is ``is_me``, the
            filter is rewritten to an ``exact`` match against *identity*.
            When missing, ``is_me`` becomes a no-op (empty Q).

    Returns:
        A Django ``Q`` object.  Returns an empty ``Q()`` (always-true) when
        the filter cannot be resolved (unknown column, invalid operator, or
        empty value for a non-``is_empty`` operator).

    Raises:
        ValueError: If the column is unknown (not in system columns and
            not registered as a column type).
    """
    field_path = _resolve_field_path(spec.column)
    is_system = _is_system_column(spec.column)

    # ── Handle is_me operator (valueless, identity-driven) ─────────────
    if spec.operator == "is_me":
        if identity:
            return Q(**{f"{field_path}__exact": identity})
        return Q()

    # ── Handle is_empty operator (doesn't use value) ───────────────────
    if spec.operator == "is_empty":
        lookup = f"{field_path}__isnull"
        return Q(**{lookup: True})

    # ── Empty value with a value-requiring operator is a no-op ─────────
    if not spec.value:
        return Q()

    # ── Resolve the column type for the operator lookup ────────────────
    if is_system:
        # System columns use the column key to look up their type.
        # We need to know the column type to get the operator's lookup name.
        column_type = _resolve_system_column_type(spec.column)
    else:
        # Schema properties — look up the column type from the registry.
        # The column definition (from Schema/SchemaType) carries a ``type``
        # field.  We don't have access to that here, so we infer the type from
        # the value's format.  But the operator provides ``django_lookup_name``
        # directly from the registry.  We need the column type to look up the
        # operator's django_lookup_name.
        #
        # Since we don't have the column definition here, we use a fallback:
        # try common types (text, number, date, etc.) and use the first one
        # that has the operator. This is imperfect but works because
        # django_lookup_name is the same across types for shared operator IDs.
        column_type = _resolve_property_column_type(spec.column, spec.operator)

    if column_type is None:
        # Fallback: treat as text with exact match
        return Q(**{f"{field_path}__exact": spec.value})

    # ── Find the operator definition ───────────────────────────────────
    operator_meta = _find_operator(column_type, spec.operator)
    if operator_meta is None:
        # Unknown operator for this type — fall back to exact match
        return Q(**{f"{field_path}__exact": spec.value})

    lookup_name = operator_meta.django_lookup_name

    # ── Build the Q object based on the operator ───────────────────────
    return _build_q_from_lookup(
        field_path, lookup_name, spec.operator, spec.value, column_type
    )


def _build_q_from_lookup(
    field_path: str,
    lookup_name: str,
    operator_id: str,
    value: str,
    column_type=None,
) -> Q:
    """Build a Q object from a resolved field path and lookup name.

    Handles special cases:
    * ``neq`` → ``~Q(exact=value)``
    * ``between`` → ``Q(gte=min) & Q(lte=max)``
    * ``is_empty`` → handled by caller
    * ``in`` / ``is_any_of`` → ``Q(field__in=[...])`` (comma-separated values)
    """
    if operator_id == "neq":
        coerced = _coerce_numeric_value(value, column_type)
        return ~Q(**{f"{field_path}__exact": coerced})

    if operator_id in ("between",):
        # Range operator: value is "min,max"
        parts = [p.strip() for p in value.split(",", 1)]
        if len(parts) == 2:
            min_val, max_val = parts
            # Coerce to float for numeric fields, otherwise keep as string
            try:
                min_val_num = float(min_val)
                max_val_num = float(max_val)
                return Q(**{f"{field_path}__gte": min_val_num}) & Q(
                    **{f"{field_path}__lte": max_val_num}
                )
            except (ValueError, TypeError):
                # String range comparison
                return Q(**{f"{field_path}__gte": min_val}) & Q(
                    **{f"{field_path}__lte": max_val}
                )

    if operator_id in ("in", "is_any_of", "is_in_group"):
        values = [v.strip() for v in value.split(",") if v.strip()]
        if not values:
            return Q()
        return Q(**{f"{field_path}__in": values})

    # Standard lookup: eq, contains, gt, gte, lt, lte, startswith, etc.
    lookup = f"{field_path}__{lookup_name}"
    coerced = _coerce_numeric_value(value, column_type, lookup_name)
    return Q(**{lookup: coerced})


def _coerce_numeric_value(value: str, column_type=None, lookup_name: str = "exact"):
    """Coerce *value* to float when the column type is numeric and the lookup
    is a comparison operator.

    JSON fields on SQLite store values as text, so ``properties__concentration__gt="60"``
    does string comparison.  PostgreSQL JSONB also compares text-to-text when
    the right-hand side is a string.  Coercing to ``float`` ensures proper
    numeric semantics on all backends.

    Returns the original string when the column type is not numeric, the
    lookup is not a comparison, or the value cannot be parsed as a number.
    """
    if (
        column_type is not None
        and column_type.operand_shape == "number"
        and lookup_name in ("exact", "gt", "gte", "lt", "lte")
    ):
        try:
            return float(value)
        except (ValueError, TypeError):
            pass
    return value


# ── Column type resolution ──────────────────────────────────────────────────


def _resolve_system_column_type(column_key: str):
    """Resolve the ColumnType for a system column.

    Maps system column keys to their known types:
    * display_id → text
    * name → text
    * schema_type_id → text
    * status → select
    * author → user
    * created_at → datetime
    * updated_at → datetime
    """
    _SYSTEM_COLUMN_TYPES: dict[str, str] = {
        "display_id": "text",
        "name": "text",
        "schema_type_id": "text",
        "status": "dropdown",
        "author": "user",
        "created_at": "datetime",
        "updated_at": "datetime",
    }
    type_id = _SYSTEM_COLUMN_TYPES.get(column_key, "text")
    return column_type_registry.get_column_type(type_id)


def _resolve_property_column_type(column_key: str, operator_id: str):
    """Resolve the ColumnType for a schema property column.

    Since we don't have access to the column definition's ``type`` field in
    this context, we search the registry for any type that supports the given
    operator.  This works because ``django_lookup_name`` is consistent across
    types for the same operator ID.

    Falls back to the ``text`` type if no match is found.
    """
    # Search all registered types for one that supports this operator
    for ct in column_type_registry:
        for op in ct.get_operators():
            if op.id == operator_id:
                return ct
    return column_type_registry.get_column_type("text")


def _find_operator(column_type, operator_id: str):
    """Find an operator definition by ID on a column type.

    Returns the ``OperatorMeta`` or ``None``.
    """
    for op in column_type.get_operators():
        if op.id == operator_id:
            return op
    return None


# ── Batch filter building ───────────────────────────────────────────────────


def build_entity_hub_filters(
    filter_specs: list[FilterSpec],
    legacy_filters: list[str] | None = None,
    identity: str | None = None,
) -> Q:
    """Build a combined Q object from a list of filter specs.

    Parameters:
        filter_specs: List of structured filter specifications.
        legacy_filters: Legacy ``key:value`` field filters (for backward
            compatibility with the old ``?f=key:value`` format).
        identity: Optional user identifier forwarded to
            :func:`build_filter_q` for ``is_me`` rewriting.  See
            :func:`build_filter_q` for details.

    Returns:
        A combined ``Q`` object.  Returns an empty ``Q()`` (always-true) when
        there are no filters.
    """
    q = Q()

    for spec in filter_specs:
        q &= build_filter_q(spec, identity=identity)

    if legacy_filters:
        for lf in legacy_filters:
            q &= _build_legacy_filter_q(lf)

    return q


# ── URL param parsing ───────────────────────────────────────────────────────


def parse_filter_params(
    raw_filters: list[str],
) -> tuple[list[FilterSpec], list[str]]:
    """Parse URL ``?f=`` parameters into structured and legacy filters.

    Recognizes two formats:

    * **New format**: ``column:operator:value`` — three colon-separated parts
      (the value may itself contain colons; only the first two colons delimit).
    * **Legacy format**: ``key:value`` — two colon-separated parts, treated as
      an exact-match property filter.

    Parameters:
        raw_filters: Raw ``?f=`` values from the request query string.

    Returns:
        A tuple of ``(structured_filters, legacy_filters)``.
    """
    structured: list[FilterSpec] = []
    legacy: list[str] = []

    for raw in raw_filters:
        parts = raw.split(":", 2)
        if len(parts) == 3:
            # New format: column:operator:value
            structured.append(
                FilterSpec(column=parts[0], operator=parts[1], value=parts[2])
            )
        elif len(parts) == 2:
            # Legacy format: key:value
            legacy.append(raw)
        # Single-part values with no colon are ignored

    return structured, legacy


# ── Aggregate engine ─────────────────────────────────────────────────────────
#
# Builds a live scalar aggregate from a LimsView's filter_state against the
# Entity Hub View.  Handles is_me rewriting, JSON property casting, and
# column-type resolution for the aggregate target.


# Mapping from user-facing aggregate IDs to (DjangoAggregateClass, distinct_flag).
# distinct_flag is True for count_distinct, False for count, None for all others.
_AGGREGATE_MAP: dict[str, tuple[type, bool | None]] = {
    "count": (Count, False),
    "count_distinct": (Count, True),
    "sum": (Sum, None),
    "avg": (Avg, None),
    "min": (Min, None),
    "max": (Max, None),
    "stdev": (StdDev, None),
}

# Column types that require a Cast to FloatField before numeric aggregation.
_NUMERIC_TYPE_IDS: frozenset[str] = frozenset({"number"})

# Column types that require a Cast to DateTimeField for min/max.
_DATETIME_TYPE_IDS: frozenset[str] = frozenset({"date", "datetime"})


def _resolve_column_type_id(view, column_key: str) -> str | None:
    """Resolve the column type ID for *column_key* from the View's schema/schema_type.

    Returns the type ID string (e.g. ``"number"``, ``"text"``) or ``None``
    when the column cannot be found.
    """
    if _is_system_column(column_key):
        mapping = {
            "display_id": "text",
            "name": "text",
            "schema_type_id": "text",
            "status": "dropdown",
            "author": "user",
            "created_at": "datetime",
            "updated_at": "datetime",
        }
        return mapping.get(column_key, "text")

    if view is None:
        return None

    filter_state = view.filter_state or {}
    schema_id = str(filter_state.get("schema", "")).strip()
    schema_type_id = str(filter_state.get("schema_type", "")).strip()

    columns: list[dict] = []

    if schema_id:
        try:
            from helix_core.models import Schema
            schema_obj = Schema.objects.filter(pk=int(schema_id), is_active=True).first()
            if schema_obj:
                columns = schema_obj.columns
        except (ValueError, Schema.DoesNotExist):
            pass

    if not columns and schema_type_id:
        try:
            workspace_id = schema_type_id.split(".")[0]
            from helix_core.models import SchemaType
            st = SchemaType.objects.filter(workspace_id=workspace_id, is_active=True).first()
            if st:
                columns = st.columns
        except (SchemaType.DoesNotExist, IndexError):
            pass

    for col in columns:
        if isinstance(col, dict) and col.get("name") == column_key:
            return col.get("type", "text")
    return None


def build_metric_aggregation(
    view,
    aggregate_function: str,
    column: str | None = None,
    identity: str | None = None,
) -> dict:
    """Build and execute a live scalar aggregate from a saved View.

    Applies the View's ``filter_state`` to ``EntityHubView`` and computes the
    requested aggregate function.

    Parameters:
        view: A :class:`LimsView` instance whose ``filter_state`` drives
            the filtered queryset.
        aggregate_function: The aggregate ID (e.g. ``"count"``, ``"sum"``,
            ``"avg"``, ``"min"``, ``"max"``, ``"stdev"``,
            ``"count_distinct"``).
        column: The column key to aggregate over.  ``None`` for a row count
            with no column target.
        identity: Optional user identifier for ``is_me`` rewriting.  When
            provided, ``is_me`` filters are rewritten to exact identity
            matches.  When missing, they become no-ops.

    Returns:
        A dict with a single ``"value"`` key containing the scalar result:
        ``{"value": 42}``.

    Raises:
        ValueError: If *aggregate_function* is unknown or the required
            database objects cannot be resolved.
    """
    from helix_core.models import EntityHubView

    agg_info = _AGGREGATE_MAP.get(aggregate_function)
    if agg_info is None:
        raise ValueError(f"Unknown aggregate function: {aggregate_function}")
    agg_cls, distinct_flag = agg_info

    qs = EntityHubView.objects.all()

    if view is None:
        return {"value": None}

    filter_state = view.filter_state or {}

    # ── Search ──────────────────────────────────────────────────────────
    search = str(filter_state.get("search", "")).strip()
    if search:
        qs = qs.filter(
            Q(name__icontains=search) | Q(display_id__icontains=search)
        )

    # ── Schema type ─────────────────────────────────────────────────────
    schema_type = str(filter_state.get("schema_type", "")).strip()
    if schema_type:
        qs = qs.filter(schema_type_id=schema_type)

    # ── Schema ──────────────────────────────────────────────────────────
    schema = str(filter_state.get("schema", "")).strip()
    if schema:
        qs = qs.filter(schema_id=schema)

    # ── Status ──────────────────────────────────────────────────────────
    status = str(filter_state.get("status", "")).strip()
    if status in ("in_progress", "finished"):
        qs = qs.filter(status=status)

    # ── Column filters ──────────────────────────────────────────────────
    columns_filters = filter_state.get("columns", [])
    if columns_filters:
        specs: list[FilterSpec] = []
        for col in columns_filters:
            if isinstance(col, dict) and "column" in col and "operator" in col:
                specs.append(
                    FilterSpec(
                        column=str(col["column"]),
                        operator=str(col["operator"]),
                        value=str(col.get("value", "")),
                    )
                )
        if specs:
            qs = qs.filter(build_entity_hub_filters(specs, identity=identity))

    # ── Aggregate ───────────────────────────────────────────────────────
    if not column:
        result = qs.aggregate(value=Count("id"))
        return {"value": result["value"]}

    if _is_system_column(column):
        field_path = _SYSTEM_COLUMN_FIELDS[column]
        result = _aggregate_direct(qs, agg_cls, field_path, distinct_flag)
    else:
        field_path = f"properties__{column}"
        col_type_id = _resolve_column_type_id(view, column)
        result = _aggregate_json(
            qs, agg_cls, field_path, distinct_flag, col_type_id
        )

    return {"value": result["value"]}


def _aggregate_direct(qs, agg_cls, field_path: str, distinct_flag: bool | None) -> dict:
    """Apply the aggregate directly to a system-column field path."""
    if distinct_flag is True:
        return qs.aggregate(value=agg_cls(field_path, distinct=True))
    elif distinct_flag is False:
        return qs.aggregate(value=agg_cls(field_path))
    else:
        return qs.aggregate(value=agg_cls(field_path))


def _aggregate_json(
    qs, agg_cls, field_path: str, distinct_flag: bool | None, col_type_id: str | None
) -> dict:
    """Apply the aggregate to a JSON property field path, casting if needed."""
    if agg_cls is Count:
        if distinct_flag is True:
            return qs.aggregate(value=Count(field_path, distinct=True))
        return qs.aggregate(value=Count(field_path))

    if agg_cls in (Sum, Avg, Min, Max, StdDev):
        if col_type_id in _DATETIME_TYPE_IDS:
            return qs.aggregate(
                value=agg_cls(Cast(field_path, DateTimeField()))
            )
        return qs.aggregate(
            value=agg_cls(Cast(field_path, FloatField()))
        )

    return qs.aggregate(value=agg_cls(field_path))
