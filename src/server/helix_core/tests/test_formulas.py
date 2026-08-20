import json
from pathlib import Path

from helix_core.formulas import (
    evaluate_formula,
    evaluate_row,
    function_calls_in,
    validate_formula_columns,
)
from helix_core.mod_system.registry import registry


FIXTURES = json.loads((Path(__file__).resolve().parents[4] / "src/shell/src/shared/formulas/parity.json").read_text())


def test_parity_fixtures():
    for fixture in FIXTURES:
        if "formulas" in fixture:
            result = evaluate_row(fixture["row"], fixture["formulas"])
            for name, expected in fixture["expectedRow"].items():
                assert result[name]["ok"] is False
                assert result[name]["error"]["code"] == expected["error"]["code"]
            continue
        result = evaluate_formula(fixture["expression"], fixture["row"])
        assert result["ok"] == fixture["expected"]["ok"], fixture["name"]
        if result["ok"]:
            assert result["value"] == fixture["expected"]["value"], fixture["name"]
        else:
            assert result["error"]["code"] == fixture["expected"]["error"]["code"], fixture["name"]


def test_formula_dependencies_and_cycles():
    result = evaluate_row(
        {"Amount": 12, "Count": 3},
        {"Ratio": {"expression": "[Amount] / [Count]"}, "Rounded": {"expression": "ROUND([Ratio], 1)"}},
    )
    assert result["Rounded"] == {"ok": True, "value": 4}

    fixture = next(item for item in FIXTURES if item["name"] == "cycle")
    result = evaluate_row(fixture["row"], fixture["formulas"])
    assert result["First"]["error"]["code"] == "#CYCLE!"
    assert result["Second"]["error"]["code"] == "#CYCLE!"


def test_computed_field_schema_validation():
    valid = [
        {"name": "Amount", "type": "number"},
        {"name": "Ratio", "type": "formula", "expression": "[Amount] / 2", "resultType": "number"},
    ]
    assert validate_formula_columns(valid) is None

    unknown_reference = [
        {"name": "Ratio", "type": "formula", "expression": "[Missing]", "resultType": "number"},
    ]
    assert "unknown column" in validate_formula_columns(unknown_reference)

    self_reference = [
        {"name": "Ratio", "type": "formula", "expression": "[Ratio]", "resultType": "number"},
    ]
    assert "cannot reference itself" in validate_formula_columns(self_reference)

    cycle = [
        {"name": "First", "type": "formula", "expression": "[Second]", "resultType": "number"},
        {"name": "Second", "type": "formula", "expression": "[First]", "resultType": "number"},
    ]
    assert "cycle" in validate_formula_columns(cycle).lower()


def test_parity_fixtures_cover_catalog_and_match_backend_only_flags():
    catalog = {function["id"]: function for function in registry.get_formula_catalog()}
    covered_functions = set()

    for fixture in FIXTURES:
        expressions = []
        if "expression" in fixture:
            expressions.append(fixture["expression"])
        expressions.extend(
            formula["expression"] for formula in fixture.get("formulas", {}).values()
        )

        fixture_functions = set()
        for expression in expressions:
            fixture_functions.update(
                function_id
                for function_id in function_calls_in(expression)
                if function_id in catalog
            )

        if fixture.get("backendOnly", False):
            assert fixture_functions, f"Fixture {fixture['name']} has no catalogued function"

        for function_id in fixture_functions:
            covered_functions.add(function_id)
            assert fixture.get("backendOnly", False) == (
                not catalog[function_id]["clientImplemented"]
            ), f"Fixture {fixture['name']} disagrees for {function_id}"

    assert covered_functions == set(catalog), (
        "Parity fixtures must cover every catalogued function; "
        f"missing: {set(catalog) - covered_functions}"
    )
