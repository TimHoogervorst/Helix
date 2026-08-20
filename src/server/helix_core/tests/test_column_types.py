"""Tests for column type definitions, ColumnTypeRegistry, and the columnTypes
section of the mod-registry API response.

Covers:

* Each built-in type's ``get_operators()`` and ``validate()``
* ColumnTypeRegistry duplicate rejection and payload assembly
* Backend contract test: ``columnTypes`` section validated against JSON schema
* Frontend hydration: column types correctly stored from boot payload
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from helix_core.column_types import (
    AggregateMeta,
    BooleanColumnType,
    ColumnTypeRegistry,
    DateColumnType,
    DatetimeColumnType,
    FormulaColumnType,
    NumberColumnType,
    OperatorMeta,
    ProjectColumnType,
    ReferenceColumnType,
    DropdownColumnType,
    TextColumnType,
    UserColumnType,
    get_builtin_column_types,
    registry as column_type_registry,
)

# ── Load the shared JSON schema contract ─────────────────────────────────────

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"
SCHEMA_PATH = SCHEMA_DIR / "mod-registry-response.json"


def _load_schema():
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


MOD_REGISTRY_RESPONSE_SCHEMA = _load_schema()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _fresh_registry() -> ColumnTypeRegistry:
    """Return a fresh ColumnTypeRegistry with no registered types."""
    return ColumnTypeRegistry()


def _operator_ids(column_type) -> set[str]:
    """Return the set of operator IDs for a column type instance."""
    return {op.id for op in column_type.get_operators()}


def _aggregate_ids(column_type) -> set[str]:
    """Return the set of aggregate IDs for a column type instance."""
    return {agg.id for agg in column_type.get_aggregates()}


# ── OperatorMeta tests ───────────────────────────────────────────────────────


class OperatorMetaTests(TestCase):
    """Tests for the OperatorMeta dataclass."""

    def test_operator_meta_fields(self):
        op = OperatorMeta("eq", "Equals", "text", "exact")
        self.assertEqual(op.id, "eq")
        self.assertEqual(op.label, "Equals")
        self.assertEqual(op.operand_shape, "text")
        self.assertEqual(op.django_lookup_name, "exact")

    def test_operator_meta_is_frozen(self):
        op = OperatorMeta("eq", "Equals", "text", "exact")
        with self.assertRaises(Exception):
            op.id = "neq"  # type: ignore[misc]

    def test_operator_meta_equality(self):
        a = OperatorMeta("eq", "Equals", "text", "exact")
        b = OperatorMeta("eq", "Equals", "text", "exact")
        c = OperatorMeta("neq", "Not Equals", "text", "exact")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


# ── AggregateMeta tests ─────────────────────────────────────────────────────


class AggregateMetaTests(TestCase):
    """Tests for the AggregateMeta dataclass."""

    def test_aggregate_meta_fields(self):
        agg = AggregateMeta("count", "Count", "Count")
        self.assertEqual(agg.id, "count")
        self.assertEqual(agg.label, "Count")
        self.assertEqual(agg.django_aggregate_name, "Count")
        self.assertEqual(agg.result_operand_shape, "number")

    def test_aggregate_meta_with_custom_shape(self):
        agg = AggregateMeta("custom", "Custom", "CustomAgg", result_operand_shape="date")
        self.assertEqual(agg.result_operand_shape, "date")

    def test_aggregate_meta_default_shape(self):
        agg = AggregateMeta("sum", "Sum", "Sum")
        self.assertEqual(agg.result_operand_shape, "number")

    def test_aggregate_meta_is_frozen(self):
        agg = AggregateMeta("count", "Count", "Count")
        with self.assertRaises(Exception):
            agg.id = "sum"  # type: ignore[misc]

    def test_aggregate_meta_equality(self):
        a = AggregateMeta("count", "Count", "Count")
        b = AggregateMeta("count", "Count", "Count")
        c = AggregateMeta("sum", "Sum", "Sum")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


# ── Built-in type: Text ──────────────────────────────────────────────────────


class TextColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = TextColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "text")
        self.assertEqual(self.ct.display_name, "Text")
        self.assertEqual(self.ct.icon, "type")
        self.assertEqual(self.ct.operand_shape, "text")

    def test_get_default_value(self):
        self.assertEqual(self.ct.get_default_value(), "")

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "contains", "starts_with", "ends_with", "is_empty"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "text")
        self.assertEqual(shapes["neq"], "text")
        self.assertEqual(shapes["contains"], "text")
        self.assertEqual(shapes["is_empty"], "none")

    def test_validate_valid_string(self):
        self.assertTrue(self.ct.validate("hello"))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_number(self):
        result = self.ct.validate(42)
        self.assertIsInstance(result, str)
        self.assertIn("string", result)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct"})

    def test_aggregate_structure(self):
        aggregates = self.ct.get_aggregates()
        self.assertGreater(len(aggregates), 0)
        for agg in aggregates:
            self.assertIsInstance(agg, AggregateMeta)
            self.assertIsInstance(agg.id, str)
            self.assertIsInstance(agg.label, str)
            self.assertIsInstance(agg.django_aggregate_name, str)
            self.assertIsInstance(agg.result_operand_shape, str)


# ── Built-in type: Number ────────────────────────────────────────────────────


class NumberColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = NumberColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "number")
        self.assertEqual(self.ct.display_name, "Number")
        self.assertEqual(self.ct.icon, "hash")
        self.assertEqual(self.ct.operand_shape, "number")

    def test_get_default_value(self):
        self.assertEqual(self.ct.get_default_value(), 0)

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "gt", "gte", "lt", "lte", "between"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "number")
        self.assertEqual(shapes["gt"], "number")
        self.assertEqual(shapes["between"], "range")

    def test_django_lookup_names(self):
        lookups = {op.id: op.django_lookup_name for op in self.ct.get_operators()}
        self.assertEqual(lookups["eq"], "exact")
        self.assertEqual(lookups["gt"], "gt")
        self.assertEqual(lookups["between"], "range")

    def test_validate_int(self):
        self.assertTrue(self.ct.validate(42))

    def test_validate_float(self):
        self.assertTrue(self.ct.validate(3.14))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_numeric_string(self):
        """Numeric strings like '42' or '3.14' are accepted."""
        self.assertTrue(self.ct.validate("42"))
        self.assertTrue(self.ct.validate("3.14"))
        self.assertTrue(self.ct.validate("-5"))
        self.assertTrue(self.ct.validate("1e10"))

    def test_validate_rejects_bool(self):
        result = self.ct.validate(True)
        self.assertIsInstance(result, str)

    def test_validate_rejects_non_numeric_string(self):
        """Non-numeric strings like 'abc' are rejected with a clear message."""
        result = self.ct.validate("abc")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid number", result)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct", "sum", "avg", "min", "max", "stdev"})


# ── Built-in type: Date ──────────────────────────────────────────────────────


class DateColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = DateColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "date")
        self.assertEqual(self.ct.display_name, "Date")
        self.assertEqual(self.ct.icon, "calendar")
        self.assertEqual(self.ct.operand_shape, "date")

    def test_get_default_value(self):
        self.assertIsNone(self.ct.get_default_value())

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "gt", "gte", "lt", "lte", "between"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "date")
        self.assertEqual(shapes["gt"], "date")
        self.assertEqual(shapes["between"], "range")

    def test_validate_date_object(self):
        self.assertTrue(self.ct.validate(date(2025, 1, 15)))

    def test_validate_datetime_object(self):
        """datetime objects are also accepted (they are dates too)."""
        self.assertTrue(self.ct.validate(datetime(2025, 1, 15, 14, 30)))

    def test_validate_valid_iso_date_string(self):
        """ISO 8601 date strings (YYYY-MM-DD) are accepted."""
        self.assertTrue(self.ct.validate("2025-01-15"))
        self.assertTrue(self.ct.validate("2025-12-31"))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_invalid_date_string(self):
        """Invalid ISO 8601 date strings are rejected."""
        result = self.ct.validate("not-a-date")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid ISO 8601 date", result)

    def test_validate_rejects_number(self):
        result = self.ct.validate(42)
        self.assertIsInstance(result, str)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "min", "max"})


# ── Built-in type: Datetime ──────────────────────────────────────────────────


class DatetimeColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = DatetimeColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "datetime")
        self.assertEqual(self.ct.display_name, "Date & Time")
        self.assertEqual(self.ct.icon, "clock")
        self.assertEqual(self.ct.operand_shape, "date")

    def test_get_default_value(self):
        self.assertIsNone(self.ct.get_default_value())

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "gt", "gte", "lt", "lte", "between"})

    def test_validate_datetime_object(self):
        self.assertTrue(self.ct.validate(datetime(2025, 1, 15, 14, 30)))

    def test_validate_valid_iso_datetime_string(self):
        """ISO 8601 datetime strings are accepted."""
        self.assertTrue(self.ct.validate("2025-01-15T14:30:00"))
        self.assertTrue(self.ct.validate("2025-01-15T14:30:00+00:00"))
        self.assertTrue(self.ct.validate("2025-01-15"))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_invalid_datetime_string(self):
        """Invalid ISO 8601 datetime strings are rejected."""
        result = self.ct.validate("not-a-datetime")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid ISO 8601 datetime", result)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "min", "max"})


# ── Built-in type: Boolean ────────────────────────────────────────────────────


class BooleanColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = BooleanColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "boolean")
        self.assertEqual(self.ct.display_name, "Boolean")
        self.assertEqual(self.ct.icon, "toggle-left")
        self.assertEqual(self.ct.operand_shape, "boolean")

    def test_get_default_value(self):
        self.assertEqual(self.ct.get_default_value(), False)

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "boolean")
        self.assertEqual(shapes["neq"], "boolean")

    def test_validate_true(self):
        self.assertTrue(self.ct.validate(True))

    def test_validate_false(self):
        self.assertTrue(self.ct.validate(False))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_true_string(self):
        """String 'true' (case-insensitive) is accepted."""
        self.assertTrue(self.ct.validate("true"))
        self.assertTrue(self.ct.validate("True"))
        self.assertTrue(self.ct.validate("TRUE"))

    def test_validate_false_string(self):
        """String 'false' (case-insensitive) is accepted."""
        self.assertTrue(self.ct.validate("false"))
        self.assertTrue(self.ct.validate("False"))
        self.assertTrue(self.ct.validate("FALSE"))

    def test_validate_rejects_invalid_string(self):
        """Non-boolean strings are rejected."""
        result = self.ct.validate("yes")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid boolean", result)

    def test_validate_rejects_number(self):
        result = self.ct.validate(1)
        self.assertIsInstance(result, str)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count"})


# ── Built-in type: Dropdown ──────────────────────────────────────────────────


class DropdownColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = DropdownColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "dropdown")
        self.assertEqual(self.ct.display_name, "Dropdown")
        self.assertEqual(self.ct.icon, "list")
        self.assertEqual(self.ct.operand_shape, "dropdown")

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "in", "is_empty"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "dropdown")
        self.assertEqual(shapes["in"], "dropdown")
        self.assertEqual(shapes["is_empty"], "none")

    def test_validate_string(self):
        self.assertTrue(self.ct.validate("option1"))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_number(self):
        result = self.ct.validate(42)
        self.assertIsInstance(result, str)

    def test_validate_with_dropdown_options(self):
        """When dropdown_options are provided, validates value is in the list."""
        # Valid option
        self.assertTrue(self.ct.validate("a", dropdown_options=["a", "b", "c"]))
        # Invalid option
        result = self.ct.validate("z", dropdown_options=["a", "b", "c"])
        self.assertIsInstance(result, str)
        self.assertIn("not a valid option", result)

    def test_validate_without_dropdown_options(self):
        """When dropdown_options are not provided, any string is accepted."""
        self.assertTrue(self.ct.validate("anything-goes"))

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct"})


# ── Built-in type: Reference ─────────────────────────────────────────────────


class ReferenceColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = ReferenceColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "reference")
        self.assertEqual(self.ct.display_name, "Reference")
        self.assertEqual(self.ct.icon, "link")
        self.assertEqual(self.ct.operand_shape, "entity-picker")

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "is_any_of", "is_empty"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "entity-picker")
        self.assertEqual(shapes["is_any_of"], "entity-picker")
        self.assertEqual(shapes["is_empty"], "none")

    def test_validate_valid_reference(self):
        """Valid prefix+DIGITS format is accepted."""
        self.assertTrue(self.ct.validate("DNA42"))
        self.assertTrue(self.ct.validate("BLOOD1"))
        self.assertTrue(self.ct.validate("CHEM999"))

    def test_validate_int(self):
        self.assertTrue(self.ct.validate(42))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        """Empty string is acceptable (not required field)."""
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_invalid_format(self):
        """Strings without prefix+DIGITS format are rejected."""
        result = self.ct.validate("ref-123")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid reference", result)

        result = self.ct.validate("dna42")  # lowercase
        self.assertIsInstance(result, str)

        result = self.ct.validate("12345")  # digits only
        self.assertIsInstance(result, str)

    def test_validate_rejects_list(self):
        result = self.ct.validate([1, 2, 3])
        self.assertIsInstance(result, str)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct"})


# ── Built-in type: User ──────────────────────────────────────────────────────


class UserColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = UserColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "user")
        self.assertEqual(self.ct.display_name, "User")
        self.assertEqual(self.ct.icon, "user")
        self.assertEqual(self.ct.operand_shape, "entity-picker")

    def test_extends_reference(self):
        """User extends Reference."""
        self.assertIsInstance(self.ct, ReferenceColumnType)

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "is_in_group", "is_me"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "entity-picker")
        self.assertEqual(shapes["is_in_group"], "dropdown")

    def test_is_me_operator(self):
        """The is_me operator has the correct label, shape, and lookup name."""
        is_me = next(op for op in self.ct.get_operators() if op.id == "is_me")
        self.assertEqual(is_me.label, "By Me")
        self.assertEqual(is_me.operand_shape, "none")
        self.assertEqual(is_me.django_lookup_name, "is_me")

    def test_validate_accepts_strings_and_ints(self):
        """User validate() accepts strings, ints, and None."""
        self.assertTrue(self.ct.validate("user-1"))
        self.assertTrue(self.ct.validate("timhoogervorst"))
        self.assertTrue(self.ct.validate(42))
        self.assertTrue(self.ct.validate(None))
        self.assertTrue(self.ct.validate(""))

    def test_validate_rejects_list(self):
        """User validate() rejects non-string/int types."""
        result = self.ct.validate([1, 2, 3])
        self.assertIsInstance(result, str)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct"})


# ── Built-in type: Project ────────────────────────────────────────────────────


class ProjectColumnTypeTests(TestCase):
    def setUp(self):
        self.ct = ProjectColumnType()

    def test_id_and_display_name(self):
        self.assertEqual(self.ct.id, "project")
        self.assertEqual(self.ct.display_name, "Project")
        self.assertEqual(self.ct.icon, "building")
        self.assertEqual(self.ct.operand_shape, "project-picker")

    def test_get_operators(self):
        ids = _operator_ids(self.ct)
        self.assertEqual(ids, {"eq", "neq", "in"})

    def test_operator_operand_shapes(self):
        shapes = {op.id: op.operand_shape for op in self.ct.get_operators()}
        self.assertEqual(shapes["eq"], "project-picker")
        self.assertEqual(shapes["neq"], "project-picker")
        self.assertEqual(shapes["in"], "project-picker")

    def test_operator_django_lookup_names(self):
        lookups = {op.id: op.django_lookup_name for op in self.ct.get_operators()}
        self.assertEqual(lookups["eq"], "exact")
        self.assertEqual(lookups["neq"], "exact")
        self.assertEqual(lookups["in"], "in")

    def test_validate_int(self):
        self.assertTrue(self.ct.validate(3))

    def test_validate_none(self):
        self.assertTrue(self.ct.validate(None))

    def test_validate_empty_string(self):
        self.assertTrue(self.ct.validate(""))

    def test_validate_comma_separated(self):
        self.assertTrue(self.ct.validate("3,7,12"))

    def test_validate_comma_separated_with_spaces(self):
        self.assertTrue(self.ct.validate("3, 7, 12"))

    def test_validate_single_string_int(self):
        self.assertTrue(self.ct.validate("3"))

    def test_validate_rejects_non_numeric_string(self):
        result = self.ct.validate("abc")
        self.assertIsInstance(result, str)
        self.assertIn("not a valid project ID", result)

    def test_validate_rejects_list(self):
        result = self.ct.validate([1, 2, 3])
        self.assertIsInstance(result, str)

    def test_get_aggregates(self):
        ids = _aggregate_ids(self.ct)
        self.assertEqual(ids, {"count", "count_distinct"})


# ── ColumnTypeRegistry tests ─────────────────────────────────────────────────


class ColumnTypeRegistryRegistrationTests(TestCase):
    """Tests for register_column_type and duplicate rejection."""

    def setUp(self):
        self.registry = _fresh_registry()

    def test_register_and_retrieve(self):
        ct = TextColumnType()
        self.registry.register_column_type(ct)
        self.assertEqual(self.registry.get_column_type("text"), ct)

    def test_register_multiple_types(self):
        self.registry.register_column_type(TextColumnType())
        self.registry.register_column_type(NumberColumnType())
        self.registry.register_column_type(BooleanColumnType())
        self.assertEqual(len(self.registry), 3)

    def test_duplicate_id_raises(self):
        self.registry.register_column_type(TextColumnType())
        with self.assertRaises(ValueError) as ctx:
            self.registry.register_column_type(TextColumnType())
        self.assertIn("Duplicate column type ID 'text'", str(ctx.exception))

    def test_reject_duplicate_ids_raises(self):
        """reject_duplicate_ids raises ValueError for already-registered IDs."""
        self.registry.register_column_type(TextColumnType())
        with self.assertRaises(ValueError) as ctx:
            self.registry.reject_duplicate_ids(["text"])
        self.assertIn("Duplicate column type ID 'text'", str(ctx.exception))

    def test_reject_duplicate_ids_passes_for_new_ids(self):
        """reject_duplicate_ids does not raise when all IDs are new."""
        self.registry.register_column_type(TextColumnType())
        # "number" is not yet registered — should not raise.
        self.registry.reject_duplicate_ids(["number"])

    def test_reject_duplicate_ids_multiple(self):
        """reject_duplicate_ids checks all IDs in the list."""
        self.registry.register_column_type(TextColumnType())
        self.registry.register_column_type(NumberColumnType())
        with self.assertRaises(ValueError) as ctx:
            self.registry.reject_duplicate_ids(["boolean", "text", "date"])
        self.assertIn("Duplicate column type ID 'text'", str(ctx.exception))

    def test_contains(self):
        self.registry.register_column_type(TextColumnType())
        self.assertIn("text", self.registry)
        self.assertNotIn("number", self.registry)

    def test_len(self):
        self.assertEqual(len(self.registry), 0)
        self.registry.register_column_type(TextColumnType())
        self.assertEqual(len(self.registry), 1)

    def test_iter(self):
        ct = TextColumnType()
        self.registry.register_column_type(ct)
        items = list(self.registry)
        self.assertEqual(items, [ct])

    def test_get_column_type_missing(self):
        self.assertIsNone(self.registry.get_column_type("nonexistent"))


class ColumnTypeRegistryPayloadTests(TestCase):
    """Tests for get_registry_payload()."""

    def setUp(self):
        self.registry = _fresh_registry()

    def test_empty_registry_returns_empty_list(self):
        payload = self.registry.get_registry_payload()
        self.assertEqual(payload, [])

    def test_payload_structure(self):
        self.registry.register_column_type(TextColumnType())
        payload = self.registry.get_registry_payload()
        self.assertEqual(len(payload), 1)
        entry = payload[0]
        self.assertEqual(entry["id"], "text")
        self.assertEqual(entry["displayName"], "Text")
        self.assertEqual(entry["icon"], "type")
        self.assertEqual(entry["operandShape"], "text")
        self.assertEqual(entry["defaultValue"], "")
        self.assertIsInstance(entry["operators"], list)
        self.assertGreater(len(entry["operators"]), 0)
        self.assertIsInstance(entry["aggregates"], list)
        self.assertGreater(len(entry["aggregates"]), 0)

    def test_payload_operator_structure(self):
        self.registry.register_column_type(NumberColumnType())
        payload = self.registry.get_registry_payload()
        op = payload[0]["operators"][0]
        self.assertIn("id", op)
        self.assertIn("label", op)
        self.assertIn("operandShape", op)
        self.assertIn("djangoLookupName", op)

    def test_payload_aggregate_structure(self):
        self.registry.register_column_type(NumberColumnType())
        payload = self.registry.get_registry_payload()
        agg = payload[0]["aggregates"][0]
        self.assertIn("id", agg)
        self.assertIn("label", agg)
        self.assertIn("djangoAggregateName", agg)
        self.assertIn("resultOperandShape", agg)

    def test_payload_sorted_by_type_id(self):
        self.registry.register_column_type(BooleanColumnType())
        self.registry.register_column_type(TextColumnType())
        self.registry.register_column_type(NumberColumnType())
        payload = self.registry.get_registry_payload()
        ids = [entry["id"] for entry in payload]
        self.assertEqual(ids, ["boolean", "number", "text"])

    def test_payload_includes_all_operators(self):
        self.registry.register_column_type(TextColumnType())
        payload = self.registry.get_registry_payload()
        op_ids = {op["id"] for op in payload[0]["operators"]}
        self.assertEqual(op_ids, {"eq", "neq", "contains", "starts_with", "ends_with", "is_empty"})

    def test_payload_includes_all_aggregates_for_text(self):
        self.registry.register_column_type(TextColumnType())
        payload = self.registry.get_registry_payload()
        agg_ids = {agg["id"] for agg in payload[0]["aggregates"]}
        self.assertEqual(agg_ids, {"count", "count_distinct"})

    def test_payload_includes_all_aggregates_for_number(self):
        self.registry.register_column_type(NumberColumnType())
        payload = self.registry.get_registry_payload()
        agg_ids = {agg["id"] for agg in payload[0]["aggregates"]}
        self.assertEqual(agg_ids, {"count", "count_distinct", "sum", "avg", "min", "max", "stdev"})

    def test_payload_includes_all_aggregates_for_boolean(self):
        self.registry.register_column_type(BooleanColumnType())
        payload = self.registry.get_registry_payload()
        agg_ids = {agg["id"] for agg in payload[0]["aggregates"]}
        self.assertEqual(agg_ids, {"count"})

    def test_payload_includes_all_aggregates_for_date(self):
        self.registry.register_column_type(DateColumnType())
        payload = self.registry.get_registry_payload()
        agg_ids = {agg["id"] for agg in payload[0]["aggregates"]}
        self.assertEqual(agg_ids, {"count", "min", "max"})

    def test_payload_includes_is_me_operator_for_user(self):
        self.registry.register_column_type(UserColumnType())
        payload = self.registry.get_registry_payload()
        op_ids = {op["id"] for op in payload[0]["operators"]}
        self.assertIn("is_me", op_ids)
        is_me = next(op for op in payload[0]["operators"] if op["id"] == "is_me")
        self.assertEqual(is_me["label"], "By Me")
        self.assertEqual(is_me["operandShape"], "none")


# ── Built-in types list ──────────────────────────────────────────────────────


class BuiltinTypesListTests(TestCase):
    """Tests for get_builtin_column_types()."""

    def test_returns_all_builtin_types(self):
        types = get_builtin_column_types()
        self.assertEqual(len(types), 10)

    def test_all_types_have_unique_ids(self):
        types = get_builtin_column_types()
        ids = [ct.id for ct in types]
        self.assertEqual(len(ids), len(set(ids)))

    def test_all_types_are_column_type_instances(self):
        from helix_core.column_types import ColumnType

        for ct in get_builtin_column_types():
            self.assertIsInstance(ct, ColumnType)

    def test_registry_accepts_all_builtins(self):
        registry = _fresh_registry()
        for ct in get_builtin_column_types():
            registry.register_column_type(ct)
        self.assertEqual(len(registry), 10)

    def test_formula_is_read_only_and_has_no_query_operations(self):
        formula = FormulaColumnType()
        self.assertEqual(formula.id, "formula")
        self.assertEqual(formula.operand_shape, "text")
        self.assertEqual(formula.get_operators(), [])
        self.assertEqual(formula.get_aggregates(), [])


# ── Contract test: columnTypes in mod-registry response ──────────────────────


class ColumnTypesContractTests(TestCase):
    """Validate the columnTypes section against the shared JSON schema."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        self.client.force_authenticate(user=self.user)

    def test_column_types_in_response(self):
        """GET /api/mod-registry/ includes a columnTypes key."""
        response = self.client.get("/api/mod-registry/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("columnTypes", response.data)

    def test_column_types_is_non_empty_array(self):
        """columnTypes is a non-empty array of type definitions."""
        response = self.client.get("/api/mod-registry/")
        types = response.data["columnTypes"]
        self.assertIsInstance(types, list)
        self.assertGreater(len(types), 0)

    def test_each_column_type_has_required_fields(self):
        """Each column type entry has id, displayName, icon, operandShape, defaultValue, operators, aggregates."""
        response = self.client.get("/api/mod-registry/")
        for ct in response.data["columnTypes"]:
            self.assertIn("id", ct)
            self.assertIn("displayName", ct)
            self.assertIn("icon", ct)
            self.assertIn("operandShape", ct)
            self.assertIn("defaultValue", ct)
            self.assertIsInstance(ct["operators"], list)
            self.assertIn("aggregates", ct)
            self.assertIsInstance(ct["aggregates"], list)

    def test_response_matches_json_schema(self):
        """The full response (including columnTypes) matches the JSON schema."""
        from jsonschema import ValidationError, validate

        response = self.client.get("/api/mod-registry/")
        try:
            validate(instance=response.data, schema=MOD_REGISTRY_RESPONSE_SCHEMA)
        except ValidationError as exc:
            self.fail(f"Response does not match JSON schema: {exc.message}")

    def test_all_builtin_types_present(self):
        """All built-in column types plus mod-registered types are present."""
        response = self.client.get("/api/mod-registry/")
        type_ids = {ct["id"] for ct in response.data["columnTypes"]}
        expected = {"text", "number", "date", "datetime", "boolean", "dropdown", "reference", "user", "project", "formula", "tiptap_content"}
        self.assertEqual(type_ids, expected)

    def test_builtin_operators_have_correct_shape(self):
        """Each operator has id, label, operandShape, djangoLookupName."""
        response = self.client.get("/api/mod-registry/")
        for ct in response.data["columnTypes"]:
            for op in ct["operators"]:
                self.assertIn("id", op)
                self.assertIn("label", op)
                self.assertIn("operandShape", op)
                self.assertIn("djangoLookupName", op)
                # operandShape must be one of the valid shapes.
                valid_shapes = {
                    "text", "number", "date", "boolean",
                    "dropdown", "entity-picker", "range", "none",
                    "project-picker",
                }
                self.assertIn(op["operandShape"], valid_shapes)

    def test_aggregates_have_correct_structure(self):
        """Each aggregate has id, label, djangoAggregateName, resultOperandShape."""
        response = self.client.get("/api/mod-registry/")
        for ct in response.data["columnTypes"]:
            for agg in ct["aggregates"]:
                self.assertIn("id", agg)
                self.assertIn("label", agg)
                self.assertIn("djangoAggregateName", agg)
                self.assertIn("resultOperandShape", agg)

    def test_user_type_has_is_me_in_operators(self):
        """The user column type includes is_me operator with label 'By Me' and operandShape 'none'."""
        response = self.client.get("/api/mod-registry/")
        user_type = next(ct for ct in response.data["columnTypes"] if ct["id"] == "user")
        operator_ids = {op["id"] for op in user_type["operators"]}
        self.assertIn("is_me", operator_ids)
        is_me = next(op for op in user_type["operators"] if op["id"] == "is_me")
        self.assertEqual(is_me["label"], "By Me")
        self.assertEqual(is_me["operandShape"], "none")
        self.assertEqual(is_me["djangoLookupName"], "is_me")

    def test_aggregates_per_type_match_spec(self):
        """Each column type's aggregates match the spec catalog."""
        response = self.client.get("/api/mod-registry/")
        types = {ct["id"]: ct for ct in response.data["columnTypes"]}

        expected = {
            "text": {"count", "count_distinct"},
            "number": {"count", "count_distinct", "sum", "avg", "min", "max", "stdev"},
            "date": {"count", "min", "max"},
            "datetime": {"count", "min", "max"},
            "boolean": {"count"},
            "dropdown": {"count", "count_distinct"},
            "reference": {"count", "count_distinct"},
            "user": {"count", "count_distinct"},
            "project": {"count", "count_distinct"},
        }

        for type_id, expected_agg_ids in expected.items():
            ct = types.get(type_id)
            self.assertIsNotNone(ct, f"Missing column type: {type_id}")
            agg_ids = {agg["id"] for agg in ct["aggregates"]}
            self.assertEqual(
                agg_ids, expected_agg_ids,
                f"Aggregates mismatch for type '{type_id}'",
            )
