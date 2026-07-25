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
            ``"select"``, ``"entity-picker"``, ``"range"``, ``"none"``.
        django_lookup_name: The Django ORM field lookup suffix
            (e.g. ``"exact"``, ``"icontains"``, ``"gt"``).
    """

    id: str
    label: str
    operand_shape: str
    django_lookup_name: str


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


def _make_select_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "select", "exact"),
        OperatorMeta("neq", "Not Equals", "select", "exact"),
        OperatorMeta("in", "In", "select", "in"),
        OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
    ]


def _make_reference_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "entity-picker", "exact"),
        OperatorMeta("neq", "Not Equals", "entity-picker", "exact"),
        OperatorMeta("is_any_of", "Is Any Of", "entity-picker", "in"),
        OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
    ]


def _make_user_operators() -> list[OperatorMeta]:
    return [
        OperatorMeta("eq", "Equals", "entity-picker", "exact"),
        OperatorMeta("neq", "Not Equals", "entity-picker", "exact"),
        OperatorMeta("is_in_group", "Is In Group", "select", "in"),
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
    """

    id: ClassVar[str]
    display_name: ClassVar[str]
    icon: ClassVar[str]

    def get_operators(self) -> list[OperatorMeta]:
        """Return the list of filter operators available for this column type."""
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement get_operators()"
        )

    def validate(self, value) -> bool | str:
        """Validate a value against this column type.

        Returns:
            ``True`` if the value is valid, or a string error message if
            the value is invalid.
        """
        return True


# ── Built-in column types ────────────────────────────────────────────────────


class TextColumnType(ColumnType):
    id = "text"
    display_name = "Text"
    icon = "type"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_text_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        return isinstance(value, str) or f"Expected a string, got {type(value).__name__}"


class NumberColumnType(ColumnType):
    id = "number"
    display_name = "Number"
    icon = "hash"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_number_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        if isinstance(value, bool):
            return f"Expected a number, got bool"
        if isinstance(value, (int, float)):
            return True
        return f"Expected a number, got {type(value).__name__}"


class DateColumnType(ColumnType):
    id = "date"
    display_name = "Date"
    icon = "calendar"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_date_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        from datetime import date

        if isinstance(value, date):
            return True
        return isinstance(value, str) or f"Expected a date string, got {type(value).__name__}"


class DatetimeColumnType(ColumnType):
    id = "datetime"
    display_name = "Date & Time"
    icon = "clock"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_datetime_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        from datetime import datetime

        if isinstance(value, datetime):
            return True
        return isinstance(value, str) or f"Expected a datetime string, got {type(value).__name__}"


class BooleanColumnType(ColumnType):
    id = "boolean"
    display_name = "Boolean"
    icon = "toggle-left"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_boolean_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        return isinstance(value, bool) or f"Expected a boolean, got {type(value).__name__}"


class SelectColumnType(ColumnType):
    id = "select"
    display_name = "Select"
    icon = "list"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_select_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        return isinstance(value, str) or f"Expected a string, got {type(value).__name__}"


class ReferenceColumnType(ColumnType):
    id = "reference"
    display_name = "Reference"
    icon = "link"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_reference_operators()

    def validate(self, value) -> bool | str:
        if value is None:
            return True
        return (
            isinstance(value, (str, int))
            or f"Expected a string or int, got {type(value).__name__}"
        )


class UserColumnType(ReferenceColumnType):
    """User column type — extends reference with group-based operator."""

    id = "user"
    display_name = "User"
    icon = "user"

    def get_operators(self) -> list[OperatorMeta]:
        return _make_user_operators()


# ── Built-in type registry (for quick lookup) ────────────────────────────────

_BUILTIN_TYPES: list[type[ColumnType]] = [
    TextColumnType,
    NumberColumnType,
    DateColumnType,
    DatetimeColumnType,
    BooleanColumnType,
    SelectColumnType,
    ReferenceColumnType,
    UserColumnType,
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

        Each entry includes ``id``, ``displayName``, ``icon``, ``operators``
        (each with ``id``, ``label``, ``operandShape``), and
        ``django_lookup_name``.

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
                "operators": [
                    {
                        "id": op.id,
                        "label": op.label,
                        "operandShape": op.operand_shape,
                        "djangoLookupName": op.django_lookup_name,
                    }
                    for op in ct.get_operators()
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
