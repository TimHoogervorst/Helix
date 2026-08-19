import json
from pathlib import Path

from helix_core.formulas import evaluate_formula, evaluate_row


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
