#!/usr/bin/env python3
"""Capture and compare D2-D4 evidence against one live Helix deployment.

This script deliberately lives in ELN's package-tests artifact so operators
can copy it outside the checkout before physically removing the ELN package.
It talks to Platform only through authenticated public HTTP endpoints.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen


FORMAT_VERSION = 1


class AcceptanceFailure(RuntimeError):
    pass


class PlatformClient:
    def __init__(self, base_url: str, token: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/") + "/"
        self.token = token
        self.timeout = timeout

    def get(self, path: str) -> tuple[bytes, str]:
        url = urljoin(self.base_url, path.lstrip("/"))
        request = Request(url, headers={"Authorization": f"Token {self.token}"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read(), response.headers.get("Content-Type", "")
        except (HTTPError, URLError) as exc:
            status = getattr(exc, "code", "connection error")
            raise AcceptanceFailure(f"GET {url} failed ({status}): {exc}") from exc

    def get_headers(self, path: str) -> tuple[bytes, dict[str, str]]:
        url = urljoin(self.base_url, path.lstrip("/"))
        request = Request(url, headers={"Authorization": f"Token {self.token}"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read(), dict(response.headers.items())
        except (HTTPError, URLError) as exc:
            status = getattr(exc, "code", "connection error")
            raise AcceptanceFailure(f"GET {url} failed ({status}): {exc}") from exc

    def post_json(self, path: str, payload: dict[str, Any]) -> tuple[int, Any, dict[str, str]]:
        url = urljoin(self.base_url, path.lstrip("/"))
        request = Request(
            url,
            data=_canonical(payload),
            headers={
                "Authorization": f"Token {self.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            response = urlopen(request, timeout=self.timeout)
        except HTTPError as exc:
            response = exc
        except URLError as exc:
            raise AcceptanceFailure(f"POST {url} failed (connection error): {exc}") from exc
        with response:
            raw = response.read()
            try:
                body = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                body = raw.decode("utf-8", errors="replace")
            return response.status, body, dict(response.headers.items())

    def get_json(self, path: str) -> Any:
        body, _ = self.get(path)
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise AcceptanceFailure(f"GET {path} returned invalid JSON") from exc


def _canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _json_pointer(value: Any, pointer: str) -> Any:
    if not pointer.startswith("/"):
        raise AcceptanceFailure(f"Expected a JSON Pointer starting with '/': {pointer}")
    current = value
    for raw in pointer[1:].split("/"):
        segment = raw.replace("~1", "/").replace("~0", "~")
        try:
            current = current[int(segment)] if isinstance(current, list) else current[segment]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AcceptanceFailure(f"JSON Pointer is missing from the saved snapshot: {pointer}") from exc
    return current


def _compose(checkout: Path, project: str, *args: str) -> None:
    command = [
        "docker", "compose", "-p", project,
        "-f", "docker-compose.yml",
        "-f", "docker-compose.lifecycle.yml",
        *args,
    ]
    subprocess.run(command, cwd=checkout, check=True)


def preflight(checkout: Path, project: str) -> dict[str, Any]:
    """Diagnose Docker/Compose readiness without starting or changing services."""
    checkout = checkout.resolve()
    required = (checkout / "docker-compose.yml", checkout / "docker-compose.lifecycle.yml")
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise AcceptanceFailure(f"Preflight checkout is missing compose files: {', '.join(missing)}")

    checks = (
        (["docker", "--version"], "Docker CLI"),
        (["docker", "compose", "version"], "Docker Compose"),
        (["docker", "info", "--format", "{{.ServerVersion}}"], "Docker daemon"),
        (["docker", "compose", "-p", project, "-f", "docker-compose.yml",
          "-f", "docker-compose.lifecycle.yml", "config", "--quiet"], "Compose configuration"),
    )
    results = {}
    for command, label in checks:
        try:
            result = subprocess.run(command, cwd=checkout, check=True, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise AcceptanceFailure(f"Preflight failed at {label}: Docker CLI is not installed or not on PATH.") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or str(exc)).strip()
            raise AcceptanceFailure(f"Preflight failed at {label}: {detail}") from exc
        results[label] = (result.stdout or result.stderr).strip()

    try:
        status = subprocess.run(
            ["docker", "compose", "-p", project, "-f", "docker-compose.yml",
             "-f", "docker-compose.lifecycle.yml", "ps", "--all", "--format", "json"],
            cwd=checkout, check=True, capture_output=True, text=True,
        )
        results["existing_services"] = status.stdout.strip() or "none"
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise AcceptanceFailure(f"Preflight failed while inspecting existing services: {detail}") from exc
    results["mutations"] = "none; only CLI, daemon, config, and service status were inspected"
    return results


def named_volume_inventory(checkout: Path, project: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for service, wanted_destination in (
        ("db", "/var/lib/postgresql/data"),
        ("backend", "/helix-acceptance-media"),
    ):
        ps = subprocess.run(
            [
                "docker", "compose", "-p", project,
                "-f", "docker-compose.yml", "-f", "docker-compose.lifecycle.yml",
                "ps", "-q", service,
            ],
            cwd=checkout,
            check=True,
            capture_output=True,
            text=True,
        )
        container_id = ps.stdout.strip()
        if not container_id:
            raise AcceptanceFailure(f"Compose service '{service}' is not running")
        inspected = subprocess.run(
            ["docker", "inspect", container_id],
            cwd=checkout,
            check=True,
            capture_output=True,
            text=True,
        )
        containers = json.loads(inspected.stdout)
        mounts = containers[0].get("Mounts", [])
        mount = next((item for item in mounts if item.get("Destination") == wanted_destination), None)
        if mount is None or mount.get("Type") != "volume" or not mount.get("Name"):
            raise AcceptanceFailure(f"{service} is not using a named volume at {wanted_destination}")
        result[wanted_destination] = mount["Name"]
    return result


def assert_same_named_volumes(checkout: Path, project: str, baseline: dict[str, Any]) -> None:
    current = named_volume_inventory(checkout, project)
    if current != baseline.get("named_volumes"):
        raise AcceptanceFailure(
            f"D2/D3/D4 storage volumes differ: D2={baseline.get('named_volumes')}, current={current}"
        )


def assert_eln_removed(checkout: Path, project: str, frontend_url: str) -> None:
    backend_code = (
        "import importlib.metadata as m, importlib.util, pathlib\n"
        "assert not pathlib.Path('/build/mods/eln').exists()\n"
        "try:\n    spec = importlib.util.find_spec('mods.eln')\n"
        "except ModuleNotFoundError:\n    spec = None\n"
        "assert spec is None\n"
        "assert 'helix.eln' not in {e.name for e in m.entry_points(group='helix.mods')}"
    )
    frontend_code = (
        "const fs=require('node:fs'); "
        "if(fs.existsSync('/repo/src/mods/eln')) process.exit(2); "
        "try { require.resolve('@helix/eln'); process.exit(3); } "
        "catch (e) { if(e.code !== 'MODULE_NOT_FOUND') throw e; }"
    )
    _compose(checkout, project, "exec", "-T", "backend", "python", "-c", backend_code)
    _compose(checkout, project, "exec", "-T", "frontend", "node", "-e", frontend_code)
    path = urljoin(frontend_url.rstrip("/") + "/", "src/mods/eln/index.ts")
    try:
        with urlopen(path, timeout=10):
            raise AcceptanceFailure("The removed ELN frontend entry point is still loadable from Vite")
    except HTTPError as exc:
        if exc.code != 404:
            raise AcceptanceFailure(f"Removed ELN frontend path returned HTTP {exc.code}, expected 404") from exc
    except URLError as exc:
        raise AcceptanceFailure(f"Cannot verify removed ELN frontend entry point at {path}: {exc}") from exc


def install_replacement(
    checkout: Path,
    project: str,
    package_dir: Path,
    package_folder: str,
    mod_id: str,
    client: PlatformClient,
    frontend_url: str,
) -> None:
    if package_folder in {"eln", ".", ".."} or "/" in package_folder or "\\" in package_folder:
        raise AcceptanceFailure("Replacement package folder must be a new simple directory name, distinct from eln")
    if not package_dir.is_dir() or not (package_dir / "modManifest.json").is_file():
        raise AcceptanceFailure("Replacement artifact must be a separate package directory with modManifest.json")
    if package_dir.resolve().is_relative_to(checkout.resolve()):
        raise AcceptanceFailure("Replacement package must come from a separate checkout outside the deployment")
    manifest = json.loads((package_dir / "modManifest.json").read_text(encoding="utf-8"))
    if manifest.get("id") != mod_id or mod_id == "helix.eln":
        raise AcceptanceFailure("Replacement manifest identity must match --replacement-mod-id and differ from helix.eln")
    destination = checkout / "src" / "mods" / package_folder
    if destination.exists():
        raise AcceptanceFailure(f"Replacement destination already exists: {destination}")
    shutil.copytree(package_dir, destination)
    _compose(checkout, project, "build", "--no-cache", "backend", "frontend")
    _compose(checkout, project, "up", "-d", "--force-recreate", "--renew-anon-volumes", "backend", "frontend")

    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            boot = client.get_json("/api/mod-boot/")
            if mod_id in boot.get("activeMods", []):
                break
        except (OSError, json.JSONDecodeError):
            pass
        time.sleep(2)
    else:
        raise AcceptanceFailure(f"Replacement Mod '{mod_id}' did not become active after rebuild/restart")

    frontend_entry = urljoin(frontend_url.rstrip("/") + "/", f"src/mods/{package_folder}/index.ts")
    try:
        with urlopen(frontend_entry, timeout=15) as response:
            if response.status != 200:
                raise AcceptanceFailure(f"Replacement frontend entry returned HTTP {response.status}")
    except (HTTPError, URLError) as exc:
        raise AcceptanceFailure(f"Replacement frontend entry is not loadable: {exc}") from exc


def _run_rejection_cases(
    client: PlatformClient,
    baseline: dict[str, Any],
    tables: list[str],
    cases: list[dict[str, Any]],
    checkout: Path,
    project: str,
) -> None:
    required = {"invalidMapping", "incompatibleVersion", "incompatibleRole", "missingRequiredValidator"}
    labels = {case.get("label") for case in cases}
    if not required <= labels:
        raise AcceptanceFailure(f"D4 rejection cases must include: {sorted(required)}")
    for case in cases:
        status, _body, _headers = client.post_json("/api/action-invocations/", case["payload"])
        expected_statuses = case.get("expectedStatuses", [400, 403, 409])
        if status not in expected_statuses:
            raise AcceptanceFailure(
                f"Replacement rejection case {case['label']} returned HTTP {status}; expected one of {expected_statuses}"
            )
        observed = capture(
            client,
            baseline["record_ids"],
            tables,
            [
                {"record_id": item["record_id"], "revision_id": item["revision_id"], "attachment_id": item["attachment_id"]}
                for item in baseline.get("renditions", [])
            ],
        )
        observed["named_volumes"] = named_volume_inventory(checkout, project)
        compare(baseline, observed)


def _all_pages(client: PlatformClient, path: str) -> dict[str, Any]:
    first = client.get_json(path)
    if not isinstance(first, dict) or "results" not in first:
        return first
    results = list(first["results"])
    next_url = first.get("next")
    while next_url:
        # API pagination may return an absolute URL; PlatformClient resolves it
        # relative to the same base without changing the auth boundary.
        page = client.get_json(next_url)
        results.extend(page.get("results", []))
        next_url = page.get("next")
    return {**first, "results": results, "next": None}


def _file_evidence(client: PlatformClient, record_id: str, revision: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for attachment in revision.get("attachments", []):
        revision_id = revision["id"]
        download = (
            f"/api/records/{record_id}/attachments/{attachment['id']}/content/?"
            + urlencode({"revision_id": revision_id})
        )
        body, _ = client.get(download)
        actual = hashlib.sha256(body).hexdigest()
        expected = attachment.get("sha256")
        if expected and actual != expected:
            raise AcceptanceFailure(
                f"Attachment {attachment['id']} at revision {revision_id} has SHA-256 {actual}; expected {expected}"
            )
        results.append({
            "id": attachment["id"],
            "revision_id": revision_id,
            "filename": attachment.get("filename"),
            "size": len(body),
            "sha256": actual,
        })
    return results


def _rendition_evidence(client: PlatformClient, references: list[dict[str, str]]) -> list[dict[str, Any]]:
    results = []
    for reference in references:
        record_id = reference["record_id"]
        revision_id = reference["revision_id"]
        attachment_id = reference["attachment_id"]
        path = (
            f"/api/records/{record_id}/attachments/{attachment_id}/content/?"
            + urlencode({"revision_id": revision_id})
        )
        body, _ = client.get(path)
        results.append({
            "record_id": record_id,
            "revision_id": revision_id,
            "attachment_id": attachment_id,
            "size": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        })
    return sorted(results, key=lambda item: (item["record_id"], item["revision_id"], item["attachment_id"]))


def collect_record(client: PlatformClient, record_id: str) -> dict[str, Any]:
    detail = client.get_json(f"/api/records/{record_id}/")
    revisions = client.get_json(f"/api/records/{record_id}/revisions/")
    activity = _all_pages(client, f"/api/records/{record_id}/actions/?page_size=100")
    export = client.get_json(f"/api/records/{record_id}/export/")

    exact_revisions = []
    files = []
    for group in revisions.get("groups", []):
        group_id = group["group_id"]
        for revision in group.get("revisions", []):
            exact = client.get_json(
                f"/api/records/{record_id}/groups/{group_id}/revisions/{revision['id']}/"
            )
            exact_revisions.append(exact)
            files.extend(_file_evidence(client, record_id, exact))

    # Keep byte identity per revision and attachment; repeated links to the
    # same immutable attachment are meaningful and intentionally retained.
    files.sort(key=lambda item: (item["revision_id"], item["id"]))
    return {
        "record_id": record_id,
        "detail": detail,
        "revisions": revisions,
        "exact_revisions": exact_revisions,
        "activity": activity,
        "export": export,
        "files": files,
    }


def collect_browse_evidence(client: PlatformClient, records: list[dict[str, Any]]) -> dict[str, Any]:
    current = _all_pages(client, "/api/records/?page_size=100")
    queries = []
    seen_names = set()
    for record in records:
        name = record["detail"].get("name", "")
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        matches = _all_pages(client, "/api/records/?" + urlencode({"q": name, "page_size": 100}))
        queries.append({
            "name": name,
            "count": matches["count"],
            "record_ids": sorted(item["id"] for item in matches.get("results", [])),
        })
    return {
        "count": current["count"],
        "record_ids": sorted(item["id"] for item in current.get("results", [])),
        "queries": queries,
    }


def capture(
    client: PlatformClient,
    record_ids: list[str],
    table_names: list[str],
    rendition_references: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    if not record_ids:
        raise AcceptanceFailure("Provide the record IDs from the D2 run; the harness never reseeds or discovers replacement fixtures.")
    if len(record_ids) != len(set(record_ids)):
        raise AcceptanceFailure("Record IDs must be unique")
    records = [collect_record(client, record_id) for record_id in record_ids]
    return {
        "format_version": FORMAT_VERSION,
        "record_ids": record_ids,
        "record_count": len(records),
        "records": records,
        "browse": collect_browse_evidence(client, records),
        "renditions": _rendition_evidence(client, rendition_references or []),
        "database_tables": sorted(set(table_names)),
    }


def compare(baseline: dict[str, Any], observed: dict[str, Any]) -> None:
    if baseline.get("format_version") != FORMAT_VERSION:
        raise AcceptanceFailure("Unsupported evidence bundle format")
    if baseline.get("record_ids") != observed.get("record_ids"):
        raise AcceptanceFailure("The checked record ID list differs from the D2 baseline")
    if baseline.get("database_tables") != observed.get("database_tables"):
        before = set(baseline.get("database_tables", []))
        after = set(observed.get("database_tables", []))
        raise AcceptanceFailure(
            f"Database table inventory changed; missing={sorted(before - after)}, added={sorted(after - before)}"
        )
    if baseline.get("named_volumes") != observed.get("named_volumes"):
        raise AcceptanceFailure("PostgreSQL or media volume identity changed since D2")
    if _canonical(baseline.get("renditions", [])) != _canonical(observed.get("renditions", [])):
        raise AcceptanceFailure("Historical Rendition identities or bytes changed")
    if len(baseline.get("records", [])) != len(observed.get("records", [])):
        raise AcceptanceFailure("Record count changed")
    if _canonical(baseline.get("browse")) != _canonical(observed.get("browse")):
        raise AcceptanceFailure("Platform current-record browsing, query results, or counts changed")
    for before, after in zip(baseline["records"], observed["records"], strict=True):
        for evidence_key in ("detail", "revisions", "exact_revisions", "activity", "export", "files"):
            if _canonical(before[evidence_key]) != _canonical(after[evidence_key]):
                raise AcceptanceFailure(
                    f"Record {before['record_id']} changed in {evidence_key}; D2 identity/value/provenance evidence differs"
                )


def verify_replacement(
    client: PlatformClient,
    baseline: dict[str, Any],
    expected: dict[str, Any],
    outcome: dict[str, Any],
    table_names: list[str],
) -> None:
    if sorted(set(table_names)) != baseline.get("database_tables"):
        raise AcceptanceFailure("Post-replacement database table inventory differs from D2")
    provider = expected["provider"]
    actual_provider = (outcome.get("providers") or [{}])[0]
    for key in ("modId", "modVersion", "actionId", "contractId", "contractVersion"):
        if actual_provider.get(key) != provider.get(key):
            raise AcceptanceFailure(f"Replacement provider mismatch for {key}")
    if outcome.get("replayed"):
        raise AcceptanceFailure("The replacement registration invocation unexpectedly replayed an earlier result")

    baseline_by_id = {item["record_id"]: item for item in baseline["records"]}
    for record_id in expected["preservedRecordIds"]:
        if record_id not in baseline_by_id:
            raise AcceptanceFailure(f"Preserved record {record_id} was not captured in D2 evidence")
        before = baseline_by_id[record_id]
        after = collect_record(client, record_id)
        for section in ("detail", "revisions", "exact_revisions", "export", "files"):
            if _canonical(before[section]) != _canonical(after[section]):
                raise AcceptanceFailure(f"Previously registered record {record_id} changed in {section}")
        old_ids = {item["id"] for item in before["activity"].get("results", [])}
        current_ids = {item["id"] for item in after["activity"].get("results", [])}
        if not old_ids <= current_ids or current_ids - old_ids - {outcome.get("actionId")}:
            raise AcceptanceFailure(f"Previously registered record {record_id} lost or gained unexpected Action provenance")

    created = outcome.get("createdRecords", {})
    expected_rows = expected["createdRecords"]
    if set(created) != {row["key"] for row in expected_rows}:
        raise AcceptanceFailure("Replacement result keys do not match the remaining saved Registry Table rows")
    action_id = outcome.get("actionId")
    participant_ids = {
        item.get("targetId") for item in outcome.get("participants", [])
        if item.get("targetRole") == "createdRecord"
    }
    document_updates = expected["documentUpdates"]
    if len(document_updates) != 1:
        raise AcceptanceFailure("Expected exactly one atomic document reference update")
    document_update = document_updates[0]
    document_participants = [
        item for item in outcome.get("participants", []) if item.get("targetRole") == "document"
    ]
    if len(document_participants) != 1:
        raise AcceptanceFailure("Registration Action must contain exactly one document participant")
    document_participant = document_participants[0]
    if document_participant.get("before", {}).get("revisionId") != document_update["beforeRevisionId"]:
        raise AcceptanceFailure("Registration Action did not read the expected saved document Revision")
    if document_participant.get("after", {}).get("revisionId") != document_update["revisionId"]:
        raise AcceptanceFailure("Registration Action did not commit the expected document Revision")
    if document_participant.get("role") != "edited":
        raise AcceptanceFailure("Registration did not persist a document reference update")

    for row in expected_rows:
        result = created[row["key"]]
        record_id = result["id"]
        if record_id not in participant_ids:
            raise AcceptanceFailure(f"Created record {record_id} is missing from the shared Action participants")
        if record_id in baseline_by_id:
            raise AcceptanceFailure(f"Replacement reused a pre-existing Platform record ID {record_id}")
        detail = client.get_json(f"/api/records/{record_id}/")
        if detail.get("schema_id") != row["schemaId"]:
            raise AcceptanceFailure(f"Created record {record_id} has the wrong target Schema")
        if _canonical(detail.get("field_values")) != _canonical(row["fieldValues"]):
            raise AcceptanceFailure(f"Created record {record_id} values differ from the saved Registry Table row")
        if _canonical(detail.get("metadata", {})) != _canonical(row.get("metadata", {})):
            raise AcceptanceFailure(f"Created record {record_id} provenance differs from the saved row provenance")
        activity = _all_pages(client, f"/api/records/{record_id}/actions/?page_size=100")
        ids = {item["id"] for item in activity.get("results", [])}
        if action_id not in ids:
            raise AcceptanceFailure(f"Created record {record_id} is not associated with the shared registration Action")

    record_id = document_update["recordId"]
    group_id = document_update["groupId"]
    revision_id = document_update["revisionId"]
    exact = client.get_json(f"/api/records/{record_id}/groups/{group_id}/revisions/{revision_id}/")
    if _canonical(exact.get("snapshot")) != _canonical(document_update["expectedSnapshot"]):
        raise AcceptanceFailure("Committed document Revision does not contain the exact registered row references")
    if document_update["beforeRevisionId"] not in {
        revision["id"] for group in client.get_json(f"/api/records/{record_id}/revisions/")["groups"]
        for revision in group["revisions"]
    }:
        raise AcceptanceFailure("The prior document Revision was not retained")
    document_activity = _all_pages(client, f"/api/records/{record_id}/actions/?page_size=100")
    document_action_ids = {item["id"] for item in document_activity.get("results", [])}
    if action_id not in document_action_ids:
        raise AcceptanceFailure("The source document is missing the registration Action association")
    baseline_document = baseline_by_id[record_id]
    old_action_ids = {item["id"] for item in baseline_document["activity"].get("results", [])}
    if document_action_ids - old_action_ids != {action_id}:
        raise AcceptanceFailure("Unexpected extra Activity was written; a producer may have rerun during registration")

    for contract in expected.get("contracts", []):
        _body, headers = client.get_headers(
            f"/api/contracts/{contract['kind']}/{contract['id']}/{contract['version']}/"
        )
        if headers.get("ETag", "").strip('"') != contract["fingerprint"]:
            raise AcceptanceFailure(f"Replacement dependency fingerprint changed for {contract['id']}@{contract['version']}")


def read_table_inventory(path: Path) -> list[str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    names = value.get("tables") if isinstance(value, dict) else value
    if not isinstance(names, list) or any(not isinstance(item, str) for item in names):
        raise AcceptanceFailure("Table inventory must be a JSON array of names or an object with a 'tables' array")
    return names


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    readiness = subparsers.add_parser("preflight", help="Check Docker readiness without changing services or volumes")
    readiness.add_argument("--checkout", required=True, type=Path, help="Independent disposable deployment checkout")
    readiness.add_argument("--compose-project", required=True, help="Run-specific unchanged compose project name")
    for name in ("capture", "verify"):
        child = subparsers.add_parser(name)
        child.add_argument("--api", required=True, help="Platform API base URL, such as http://localhost:8000")
        child.add_argument("--token", default=os.environ.get("HELIX_ACCEPTANCE_TOKEN"), help="DRF token; defaults to HELIX_ACCEPTANCE_TOKEN")
        child.add_argument("--record-ids", help="Comma-separated D2 Platform record IDs; required for capture")
        child.add_argument("--tables", required=True, type=Path, help="JSON table inventory from the same PostgreSQL database")
        child.add_argument("--evidence", required=True, type=Path, help="D2 evidence bundle path")
        child.add_argument("--renditions", type=Path, help="D2 JSON list of rendition record_id/revision_id/attachment_id references")
        child.add_argument("--checkout", required=True, type=Path, help="Disposable deployment checkout used by the named compose project")
        child.add_argument("--compose-project", required=True, help="Unchanged COMPOSE_PROJECT_NAME from D2")
        if name == "verify":
            child.add_argument("--frontend-url", default="http://localhost:5173")
    replacement = subparsers.add_parser("replace", help="Install an independent provider and execute the D4 registration acceptance")
    replacement.add_argument("--api", required=True)
    replacement.add_argument("--token", default=os.environ.get("HELIX_ACCEPTANCE_TOKEN"))
    replacement.add_argument("--checkout", required=True, type=Path)
    replacement.add_argument("--compose-project", required=True)
    replacement.add_argument("--replacement-package", required=True, type=Path)
    replacement.add_argument("--replacement-folder", required=True)
    replacement.add_argument("--replacement-mod-id", required=True)
    replacement.add_argument("--frontend-url", default="http://localhost:5173")
    replacement.add_argument("--tables", required=True, type=Path)
    replacement.add_argument("--evidence", required=True, type=Path)
    replacement.add_argument("--rejection-cases", required=True, type=Path)
    replacement.add_argument("--invocation", required=True, type=Path)
    replacement.add_argument("--expected-results", required=True, type=Path)
    replacement.add_argument("--output", required=True, type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "preflight":
        print(json.dumps(preflight(args.checkout, args.compose_project), indent=2))
        return 0
    if not args.token:
        raise AcceptanceFailure("Pass --token or set HELIX_ACCEPTANCE_TOKEN")
    client = PlatformClient(args.api, args.token)
    tables = read_table_inventory(args.tables)
    if args.command == "capture":
        ids = [item.strip() for item in (args.record_ids or "").split(",") if item.strip()]
        rendition_references = json.loads(args.renditions.read_text(encoding="utf-8")) if args.renditions else []
        if not isinstance(rendition_references, list):
            raise AcceptanceFailure("Rendition references must be a JSON array")
        bundle = capture(client, ids, tables, rendition_references)
        bundle["named_volumes"] = named_volume_inventory(args.checkout.resolve(), args.compose_project)
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        args.evidence.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Captured {bundle['record_count']} records, {len(bundle['database_tables'])} tables to {args.evidence}")
        return 0
    baseline = json.loads(args.evidence.read_text(encoding="utf-8"))
    if args.command == "verify":
        # Fail on a still-importable/loadable package before any Platform API
        # request, so a merely disabled Mod cannot satisfy D3.
        assert_eln_removed(args.checkout.resolve(), args.compose_project, args.frontend_url)
        assert_same_named_volumes(args.checkout.resolve(), args.compose_project, baseline)
        observed = capture(
            client,
            baseline["record_ids"],
            tables,
            [
                {"record_id": item["record_id"], "revision_id": item["revision_id"], "attachment_id": item["attachment_id"]}
                for item in baseline.get("renditions", [])
            ],
        )
        observed["named_volumes"] = named_volume_inventory(args.checkout.resolve(), args.compose_project)
        compare(baseline, observed)
        print(f"Verified absent ELN packages, {observed['record_count']} unchanged records, and {len(tables)} tables against {args.evidence}")
        return 0

    install_replacement(
        args.checkout.resolve(), args.compose_project, args.replacement_package.resolve(),
        args.replacement_folder, args.replacement_mod_id, client, args.frontend_url,
    )
    assert_same_named_volumes(args.checkout.resolve(), args.compose_project, baseline)
    # Confirm the removed package stays absent while the independent provider
    # is active and its frontend source is served.
    assert_eln_removed(args.checkout.resolve(), args.compose_project, args.frontend_url)
    expected = json.loads(args.expected_results.read_text(encoding="utf-8"))
    for contract in expected.get("contracts", []):
        _body, headers = client.get_headers(
            f"/api/contracts/{contract['kind']}/{contract['id']}/{contract['version']}/"
        )
        if headers.get("ETag", "").strip('"') != contract["fingerprint"]:
            raise AcceptanceFailure(f"Replacement did not activate the expected exact contract {contract['id']}")
    _run_rejection_cases(
        client,
        baseline,
        tables,
        json.loads(args.rejection_cases.read_text(encoding="utf-8")),
        args.checkout.resolve(),
        args.compose_project,
    )
    invocation = json.loads(args.invocation.read_text(encoding="utf-8"))
    status, outcome, _headers = client.post_json("/api/action-invocations/", invocation)
    if status != 200 or not isinstance(outcome, dict):
        raise AcceptanceFailure(f"Replacement registration failed with HTTP {status}: {outcome}")
    verify_replacement(client, baseline, expected, outcome, tables)
    roundtrip_command = expected.get("roundTripCommand")
    roundtrip = expected.get("roundTrip")
    if (
        not isinstance(roundtrip_command, list)
        or not roundtrip_command
        or not all(isinstance(part, str) for part in roundtrip_command)
        or not isinstance(roundtrip, dict)
    ):
        raise AcceptanceFailure("D4 expected-results must provide a real replacement editor roundTripCommand and roundTrip evidence")
    subprocess.run(roundtrip_command, cwd=args.replacement_package.resolve(), check=True)
    updated = client.get_json(
        f"/api/records/{roundtrip['recordId']}/groups/{roundtrip['groupId']}/revisions/{roundtrip['revisionId']}/"
    )
    if roundtrip["beforeRevisionId"] == roundtrip["revisionId"]:
        raise AcceptanceFailure("Replacement editor did not create a new Revision")
    if _canonical(updated.get("snapshot")) != _canonical(roundtrip["expectedSnapshot"]):
        raise AcceptanceFailure("Replacement editor load/edit/save changed or discarded unsupported saved content")
    history = client.get_json(f"/api/records/{roundtrip['recordId']}/revisions/")
    history_ids = {
        revision["id"]
        for group in history["groups"]
        for revision in group["revisions"]
    }
    if roundtrip["beforeRevisionId"] not in history_ids:
        raise AcceptanceFailure("Replacement editor save did not retain the prior document Revision")
    before = client.get_json(
        f"/api/records/{roundtrip['recordId']}/groups/{roundtrip['groupId']}/revisions/{roundtrip['beforeRevisionId']}/"
    )
    pointers = roundtrip.get("unsupportedJsonPointers", [])
    if not pointers:
        raise AcceptanceFailure("roundTrip must list JSON Pointers for the unsupported sibling values under test")
    for pointer in pointers:
        if _canonical(_json_pointer(before["snapshot"], pointer)) != _canonical(_json_pointer(updated["snapshot"], pointer)):
            raise AcceptanceFailure(f"Replacement editor changed unsupported sibling at JSON Pointer {pointer}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"registration": outcome, "roundTrip": updated}, indent=2) + "\n", encoding="utf-8")
    print(f"Activated {args.replacement_mod_id}, rejected an invalid batch without effects, and registered saved rows through one Action")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AcceptanceFailure, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"ACCEPTANCE FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
