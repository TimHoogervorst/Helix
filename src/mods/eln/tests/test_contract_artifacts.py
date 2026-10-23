"""ELN owns validation of its shipped portable document contracts."""

import json
from pathlib import Path

from helix_core.mod_system.contracts import resolve_artifacts, validate_dependency_closure


def test_eln_portable_document_artifacts_validate_as_a_recursive_contract_batch():
    package = Path(__file__).resolve().parents[1]
    manifest = json.loads((package / "modManifest.json").read_text(encoding="utf-8"))
    artifacts = resolve_artifacts(package, manifest["contracts"])

    assert {contract["id"] for contract in artifacts} == {
        "helix.eln.document", "helix.eln.block", "helix.eln.mark",
    }
    validate_dependency_closure(artifacts)
