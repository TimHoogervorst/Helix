"""Strict Helix External Mod manifest 1.0.0 contract."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

_SCHEMA_PATH = Path(__file__).with_name("manifest_schema.json")
_SCHEMA = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
_SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
_COMPARATOR = re.compile(r"^(<=|>=|<|>|=)?\s*(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?$")


@dataclass(frozen=True)
class Dependency:
    id: str
    version: str


def _version(value: str) -> tuple[int, int, int, tuple[str, ...]]:
    match = _SEMVER.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid SemVer: {value!r}")
    prerelease = tuple(match.group(4).split(".")) if match.group(4) else ()
    return int(match.group(1)), int(match.group(2)), int(match.group(3)), prerelease


def _compare(left: tuple[int, int, int, tuple[str, ...]], right: tuple[int, int, int, tuple[str, ...]]) -> int:
    if left[:3] != right[:3]:
        return (left[:3] > right[:3]) - (left[:3] < right[:3])
    if not left[3] and not right[3]:
        return 0
    if not left[3]:
        return 1
    if not right[3]:
        return -1
    for a, b in zip(left[3], right[3]):
        if a == b:
            continue
        if a.isdigit() and b.isdigit():
            return (int(a) > int(b)) - (int(a) < int(b))
        if a.isdigit() != b.isdigit():
            return -1 if a.isdigit() else 1
        return (a > b) - (a < b)
    return (len(left[3]) > len(right[3])) - (len(left[3]) < len(right[3]))


def _valid_range(value: str) -> bool:
    if not value.strip():
        return False
    if _SEMVER.fullmatch(value.strip()):
        return True
    for alternative in value.split("||"):
        tokens = alternative.strip().split()
        if not tokens:
            return False
        for token in tokens:
            if token in {"*", "x", "X"}:
                continue
            if token.startswith("^") or token.startswith("~"):
                token = token[1:]
            match = _COMPARATOR.fullmatch(token)
            if not match:
                return False
            if match.group(2) is None:
                return False
            if match.group(5):
                _version(f"{match.group(2)}.{match.group(3) or 0}.{match.group(4) or 0}-{match.group(5)}")
            elif match.group(3) not in (None, "x", "X", "*") and match.group(4) not in (None, "x", "X", "*"):
                _version(f"{match.group(2)}.{match.group(3)}.{match.group(4)}")
    return True


def validate_manifest(data: Any) -> None:
    """Validate a raw manifest against the schema and npm-compatible grammar."""
    errors = sorted(Draft202012Validator(_SCHEMA).iter_errors(data), key=lambda e: list(e.path))
    if errors:
        raise ValueError(errors[0].message)
    if len(data["artifacts"]) != len(set(data["artifacts"])):
        raise ValueError("artifacts must not contain duplicates")
    dependency_ids = [dependency["id"] for dependency in data["dependsOn"]]
    if len(dependency_ids) != len(set(dependency_ids)):
        raise ValueError("dependsOn must not contain duplicate IDs")
    if not _valid_range(data["version"]):
        raise ValueError("version must be a valid SemVer")
    if not _valid_range(data["requiresHelix"]):
        raise ValueError("requiresHelix must be a valid npm range")
    for dependency in data["dependsOn"]:
        if not _valid_range(dependency["version"]):
            raise ValueError(f"dependency {dependency['id']} has an invalid npm range")


@dataclass(frozen=True)
class ModManifest:
    id: str
    display_name: str
    version: str
    requires_helix: str
    artifacts: tuple[str, ...]
    depends_on: tuple[Dependency, ...]
    description: str | None = None

    def __post_init__(self) -> None:
        raw = {
            "id": self.id,
            "displayName": self.display_name,
            "version": self.version,
            "requiresHelix": self.requires_helix,
            "artifacts": list(self.artifacts),
            "dependsOn": [{"id": dependency.id, "version": dependency.version} for dependency in self.depends_on],
        }
        if self.description is not None:
            raw["description"] = self.description
        validate_manifest(raw)

    @property
    def dependency_ids(self) -> list[str]:
        return [dependency.id for dependency in self.depends_on]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModManifest":
        validate_manifest(data)
        return cls(
            id=data["id"],
            display_name=data["displayName"],
            version=data["version"],
            requires_helix=data["requiresHelix"],
            artifacts=tuple(data["artifacts"]),
            depends_on=tuple(Dependency(**dependency) for dependency in data["dependsOn"]),
            description=data.get("description"),
        )
