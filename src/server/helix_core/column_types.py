"""Column Type Registry — backend type definitions for column filtering.

Provides the ``ColumnType`` base class, ``OperatorMeta`` dataclass, and
``ColumnTypeRegistry`` singleton.  Built-in column types are registered in
``HelixCoreConfig.ready()`` so that ``GET /api/mod-registry/`` includes a
top-level ``columnTypes`` key.

Usage::

    from helix_core.column_types import (
        ColumnType,
        ColumnTypeRegistry,
        OperatorMeta,
        AggregateMeta,
        registry as column_type_registry,
    )

    # Register a custom column type in a mod's mod.py.register():
    column_type_registry.register_column_type(MyCustomType())
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar


# ── OperatorMeta ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class OperatorMeta:
    """Metadata for a single filter operator.

    Attributes:
        id: Unique operator identifier (e.g. ``"eq"``, ``"contains"``).
        label: Human-readable label (e.g. ``"Equals"``, ``"Contains"``).
        operand_shape: Drives which frontend input component to render.
            Valid values: ``"text"``, ``"number"``, ``"date"``, ``"boolean"``,
            ``"dropdown"``, ``"entity-picker"``, ``"range"``, ``"none"``.
        django_lookup_name: The Django ORM field lookup suffix
            (e.g. ``"exact"``, ``"icontains"``, ``"gt"``).
    """

    id: str
    label: str
    operand_shape: str
    django_lookup_name: str


# ── AggregateMeta ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AggregateMeta:
    """Metadata for a single aggregate function.

    Attributes:
        id: Unique aggregate identifier (e.g. ``"count"``, ``"sum"``).
        label: Human-readable label (e.g. ``"Count"``, ``"Sum"``).
        django_aggregate_name: The Django ORM aggregate name used at
            query-build time (e.g. ``"Count"``, ``"Sum"``, ``"Avg"``).
        result_operand_shape: The operand shape of the result value.
            Drives frontend rendering for the metric result
            (e.g. ``"number"``).
    """

    id: str
    label: str
    django_aggregate_name: str
    result_operand_shape: str = "number"


# ── Operator shape constants ────────────────────────────────────────────────

# Shared operator instances so each ColumnType subclass doesn't recreate them.
# Use factory functions because OperatorMeta is frozen and we want each type
# to have its own operand_shape variants.

def _make_text_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "text", "exact"),
        OperatorMeta("neq", "Not Equals", "text", "exact"),
        OperatorMeta("contains", "Contains", "text", "icontains"),
        OperatorMeta("starts_with", "Starts With", "text", "istartswith"),
        OperatorMeta("ends_with", "Ends With", "text", "iendswith"),
        OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
    ]


def _make_number_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "number", "exact"),
        OperatorMeta("neq", "Not Equals", "number", "exact"),
        OperatorMeta("gt", "Greater Than", "number", "gt"),
        OperatorMeta("gte", "Greater Than or Equal", "number", "gte"),
        OperatorMeta("lt", "Less Than", "number", "lt"),
        OperatorMeta("lte", "Less Than or Equal", "number", "lte"),
        OperatorMeta("between", "Between", "range", "range"),
    ]


def _make_date_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "date", "exact"),
        OperatorMeta("neq", "Not Equals", "date", "exact"),
        OperatorMeta("gt", "After", "date", "gt"),
        OperatorMeta("gte", "After or On", "date", "gte"),
        OperatorMeta("lt", "Before", "date", "lt"),
        OperatorMeta("lte", "Before or On", "date", "lte"),
        OperatorMeta("between", "Between", "range", "range"),
    ]


def _make_datetime_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "date", "exact"),
        OperatorMeta("neq", "Not Equals", "date", "exact"),
        OperatorMeta("gt", "After", "date", "gt"),
        OperatorMeta("gte", "After or On", "date", "gte"),
        OperatorMeta("lt", "Before", "date", "lt"),
        OperatorMeta("lte", "Before or On", "date", "lte"),
        OperatorMeta("between", "Between", "range", "range"),
    ]


def _make_boolean_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "boolean", "exact"),
        OperatorMeta("neq", "Not Equals", "boolean", "exact"),
    ]


def _make_dropdown_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "dropdown", "exact"),
        OperatorMeta("neq", "Not Equals", "dropdown", "exact"),
        OperatorMeta("in", "In", "dropdown", "in"),
        OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
    ]


def _make_reference_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "entity-picker", "exact"),
        OperatorMeta("neq", "Not Equals", "entity-picker", "exact"),
        OperatorMeta("is_any_of", "Is Any Of", "entity-picker", "in"),
        OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
    ]


def _make_project_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "project-picker", "exact"),
        OperatorMeta("neq", "Not Equals", "project-picker", "exact"),
        OperatorMeta("in", "In", "project-picker", "in"),
    ]


def _make_user_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "entity-picker", "exact"),
        OperatorMeta("neq", "Not Equals", "entity-picker", "exact"),
        OperatorMeta("is_in_group", "Is In Group", "dropdown", "in"),
        OperatorMeta("is_me", "By Me", "none", "is_me"),
    ]


# ── Aggregate factory functions ─────────────────────────────────────────────

# Mirrors the operator factory pattern: each type family gets its own list
# of AggregateMeta instances declared via a shared factory helper.


def _make_text_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
    ]


def _make_number_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
        AggregateMeta("sum", "Sum", "Sum"),
        AggregateMeta("avg", "Average", "Avg"),
        AggregateMeta("min", "Min", "Min"),
        AggregateMeta("max", "Max", "Max"),
        AggregateMeta("stdev", "Std Dev", "StdDev"),
    ]


def _make_date_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("min", "Min", "Min"),
        AggregateMeta("max", "Max", "Max"),
    ]


def _make_datetime_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("min", "Min", "Min"),
        AggregateMeta("max", "Max", "Max"),
    ]


def _make_boolean_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
    ]


def _make_dropdown_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
    ]


def _make_reference_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
    ]


def _make_project_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
    ]


def _make_user_aggregates() -> list[AggregateMeta]:
    return [
        AggregateMeta("count", "Count", "Count"),
        AggregateMeta("count_distinct", "Count Distinct", "Count"),
    ]


# ── ColumnType base class ────────────────────────────────────────────────────


class ColumnType:
    """Base class for column type definitions.

    Subclasses declare their identity via class-level attributes and override
    :meth:`get_operators` and :meth:`validate`.

    Attributes:
        id: Lowercase string identifier (e.g. ``"text"``, ``"number"``).
        display_name: Human-readable label (e.g. ``"Text"``, ``"Number"``).
        icon: Lucide icon token string (e.g. ``"type"``, ``"hash"``).
        color: Color token key string (e.g. ``"flask"``, ``"solvent"``).
            Falls back to ``"muted"`` when not set on a subclass.
        operand_shape: The primary operand shape for cell editing and
            rendering.  Drives which frontend cell editor component to use.
            Valid values: ``"text"``, ``"number"``, ``"date"``,
            ``"boolean"``, ``"dropdown"``, ``"entity-picker"``, ``"range"``,
            ``"none"``.
    """

    id: ClassVar[str]
    display_name: ClassVar[str]
    icon: ClassVar[str]
    color: ClassVar[str] = "muted"
    operand_shape: ClassVar[str]

    def get_operators(self) -> list[OperatorMeta]:
        """Return the list of filter operators available for this column type."""
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement get_operators()"
        )

    def get_aggregates(self) -> list[AggregateMeta]:
        """Return the list of aggregate functions available for this column type."""
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement get_aggregates()"
        )

    def validate(self, value, **context) -> bool | str:
        """Validate a value against this column type.

        Parameters:
            value: The value to validate.
            **context: Additional context (e.g. ``dropdown_options`` for
                dropdown types, ``required`` flag).

        Returns:
            ``True`` if the value is valid, or a string error message if
            the value is invalid.
        """
        return True

    def get_default_value(self) -> object:
        """Return the default value for this column type.

        Used by the frontend to initialise empty cells.  Subclasses may
        override this to provide a type-appropriate default (e.g. ``0``
        for numbers, ``""`` for text, ``False`` for booleans).
        """
        return ""


# ── Built-in column types ────────────────────────────────────────────────────


class TextColumnType(ColumnType):
    id = "text"
    display_name = "Text"
    icon = "type"
    color = "flask"
    operand_shape = "text"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_text_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_text_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        return isinstance(value, str) or f"Expected a string, got {type(value).__name__}"

    def get_default_value(self) -> object:
        return ""


class NumberColumnType(ColumnType):
    id = "number"
    display_name = "Number"
    icon = "hash"
    color = "solvent"
    operand_shape = "number"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_number_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_number_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        if isinstance(value, bool):
            return "Expected a number, got bool"
        if isinstance(value, (int, float)):
            return True
        if isinstance(value, str):
            try:
                float(value)
                return True
            except (ValueError, TypeError):
                return f"'{value}' is not a valid number"
        return f"Expected a number, got {type(value).__name__}"

    def get_default_value(self) -> object:
        return 0


class DateColumnType(ColumnType):
    id = "date"
    display_name = "Date"
    icon = "calendar"
    color = "warn"
    operand_shape = "date"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_date_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_date_aggregates()

    def get_default_value(self) -> object:
        return None

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        from datetime import date, datetime

        if isinstance(value, datetime):
            return True
        if isinstance(value, date):
            return True
        if isinstance(value, str):
            # ISO 8601 date: YYYY-MM-DD
            try:
                date.fromisoformat(value)
                return True
            except (ValueError, TypeError):
                return f"'{value}' is not a valid ISO 8601 date (expected YYYY-MM-DD)"
        return f"Expected a date, got {type(value).__name__}"


class DatetimeColumnType(ColumnType):
    id = "datetime"
    display_name = "Date & Time"
    icon = "clock"
    color = "warn"
    operand_shape = "date"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_datetime_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_datetime_aggregates()

    def get_default_value(self) -> object:
        return None

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        from datetime import datetime

        if isinstance(value, datetime):
            return True
        if isinstance(value, str):
            # ISO 8601 datetime
            try:
                datetime.fromisoformat(value)
                return True
            except (ValueError, TypeError):
                return (
                    f"'{value}' is not a valid ISO 8601 datetime "
                    f"(expected e.g. 2025-01-15T14:30:00)"
                )
        return f"Expected a datetime, got {type(value).__name__}"


class BooleanColumnType(ColumnType):
    id = "boolean"
    display_name = "Boolean"
    icon = "toggle-left"
    color = "success"
    operand_shape = "boolean"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_boolean_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_boolean_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        if isinstance(value, bool):
            return True
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in ("true", "false"):
                return True
            return f"'{value}' is not a valid boolean (expected true/false)"
        return f"Expected a boolean, got {type(value).__name__}"

    def get_default_value(self) -> object:
        return False


class DropdownColumnType(ColumnType):
    id = "dropdown"
    display_name = "Dropdown"
    icon = "list"
    color = "enzyme"
    operand_shape = "dropdown"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_dropdown_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_dropdown_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        if not isinstance(value, str):
            return f"Expected a string, got {type(value).__name__}"
        # If dropdown_options are provided, validate the value is in the list.
        dropdown_options: list[str] | None = context.get("dropdown_options")
        if dropdown_options is not None and value not in dropdown_options:
            return f"'{value}' is not a valid option"
        return True


class ReferenceColumnType(ColumnType):
    id = "reference"
    display_name = "Reference"
    icon = "link"
    color = "primary"
    operand_shape = "entity-picker"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_reference_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_reference_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        if isinstance(value, int):
            return True
        if not isinstance(value, str):
            return f"Expected a string or int, got {type(value).__name__}"
        # Validate prefix+DIGITS format, e.g. "DNA42".
        import re
        if re.match(r"^[A-Z]+\d+$", value):
            return True
        return (
            f"'{value}' is not a valid reference (expected format: "
            f"uppercase prefix followed by digits, e.g. DNA42)"
        )


class FormulaColumnType(ColumnType):
    """Schema column type for expressions evaluated by the frontend."""

    id = "formula"
    display_name = "Formula"
    icon = "sigma"
    color = "primary"
    operand_shape = "text"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_text_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_text_aggregates()

    def validate(self, value, **context) -> bool | str:
        if not isinstance(value, str) or not value.strip():
            return "Formula expression must be a non-empty string"
        import ast

        try:
            ast.parse(value, mode="eval")
        except SyntaxError as exc:
            return f"Invalid formula expression: {exc.msg}"
        return True


class UserColumnType(ReferenceColumnType):
    """User column type — extends reference with group-based operator."""

    id = "user"
    display_name = "User"
    icon = "user"
    color = "primary"
    operand_shape = "entity-picker"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_user_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_user_aggregates()

    def validate(self, value, **context) -> bool | str:
        """Validate a user reference value.

        Accepts strings, ints, and None/empty values.  More permissive than
        the base reference type because usernames don't always follow the
        prefix+DIGITS format.
        """
        if value is None or value == "":
            return True
        return (
            isinstance(value, (str, int))
            or f"Expected a username (string or int), got {type(value).__name__}"
        )


class ProjectColumnType(ColumnType):
    """Project column type — filter entities by project membership.

    Supports single and multi-select lookup against ``EntityHubView.project_id``
    via operators ``eq``, ``neq``, and ``in``.  Filter values are Project PKs;
    the frontend renders a multi-select dropdown showing project icon, colour,
    and name.
    """

    id = "project"
    display_name = "Project"
    icon = "building"
    color = "primary"
    operand_shape = "project-picker"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_project_operators()

    def get_aggregates(self) -> list[AggregateMeta]:
        return _make_project_aggregates()

    def validate(self, value, **context) -> bool | str:
        if value is None or value == "":
            return True
        if isinstance(value, int):
            return True
        if isinstance(value, str):
            if not value.strip():
                return True
            parts = value.split(",")
            for p in parts:
                p = p.strip()
                if not p:
                    continue
                try:
                    int(p)
                except ValueError:
                    return f"'{p}' is not a valid project ID"
            return True
        return f"Expected an integer or comma-separated string, got {type(value).__name__}"


# ── Built-in type registry (for quick lookup) ────────────────────────────────

_BUILTIN_TYPES: list[type[ColumnType]] = [
    TextColumnType,
    NumberColumnType,
    DateColumnType,
    DatetimeColumnType,
    BooleanColumnType,
    DropdownColumnType,
    ReferenceColumnType,
    FormulaColumnType,
    UserColumnType,
    ProjectColumnType,
]


def get_builtin_column_types() -> list[ColumnType]:
    """Return instantiated list of all built-in column type subclasses."""
    return [cls() for cls in _BUILTIN_TYPES]


# ── ColumnTypeRegistry singleton ─────────────────────────────────────────────


class ColumnTypeRegistry:
    """Singleton registry for column type definitions.

    Column types are registered in ``HelixCoreConfig.ready()`` and can be
    extended by mods via ``column_type_registry.register_column_type()`` in
    their ``mod.py.register()`` function.

    Duplicate type IDs cause a ``ValueError`` at registration time.
    """

    def __init__(self) -> None:
        self._types: dict[str, ColumnType] = {}

    def register_column_type(self, column_type: ColumnType) -> None:
        """Register a column type instance.

        Parameters:
            column_type: An instance of a :class:`ColumnType` subclass.

        Raises:
            ValueError: If a column type with the same ``id`` is already
                registered.
        """
        type_id = column_type.id
        self.reject_duplicate_ids([type_id])
        self._types[type_id] = column_type

    def reject_duplicate_ids(self, type_ids: list[str]) -> None:
        """Validate that none of the given *type_ids* are already registered.

        Called automatically by :meth:`register_column_type`.  Mods can also
        call this directly to pre-validate a set of IDs before registration.

        Parameters:
            type_ids: A list of candidate column type ID strings.

        Raises:
            ValueError: If any of the given IDs is already registered.
        """
        for type_id in type_ids:
            if type_id in self._types:
                raise ValueError(
                    f"Duplicate column type ID '{type_id}': "
                    f"'{self._types[type_id].__class__.__name__}' is already "
                    f"registered. Column type IDs must be unique across all mods."
                )

    def get_registry_payload(self) -> list[dict]:
        """Return the column types payload for the mod-registry API.

        Each entry includes ``id``, ``displayName``, ``icon``, ``color``,
        ``operandShape``, ``operators``, ``defaultValue``, and
        ``aggregates``.

        Returns:
            A list of dicts, one per registered column type, suitable for
            inclusion in the ``GET /api/mod-registry/`` response.
        """
        result: list[dict] = []
        for type_id, ct in sorted(self._types.items()):
            result.append({
                "id": ct.id,
                "displayName": ct.display_name,
                "icon": ct.icon,
                "color": ct.color,
                "operandShape": ct.operand_shape,
                "defaultValue": ct.get_default_value(),
                "operators": [
                    {
                        "id": op.id,
                        "label": op.label,
                        "operandShape": op.operand_shape,
                        "djangoLookupName": op.django_lookup_name,
                    }
                    for op in ct.get_operators()
                ],
                "aggregates": [
                    {
                        "id": agg.id,
                        "label": agg.label,
                        "djangoAggregateName": agg.django_aggregate_name,
                        "resultOperandShape": agg.result_operand_shape,
                    }
                    for agg in ct.get_aggregates()
                ],
            })
        return result

    def get_column_type(self, type_id: str) -> ColumnType | None:
        """Look up a registered column type by its ID.

        Returns ``None`` if no type with the given ID is registered.
        """
        return self._types.get(type_id)

    def __contains__(self, type_id: str) -> bool:
        return type_id in self._types

    def __len__(self) -> int:
        return len(self._types)

    def __iter__(self):
        return iter(self._types.values())


# ── singleton ────────────────────────────────────────────────────────────────

registry = ColumnTypeRegistry()
