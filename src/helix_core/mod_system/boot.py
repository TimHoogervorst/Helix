"""Fail-fast maintenance-window boot orchestration.

The callbacks deliberately form the seam between Django/Vite and the boot
contract.  Keeping the order here explicit makes it impossible for a later
phase to publish user-facing boot data after an earlier phase failed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


Step = Callable[[Any], Any]


@dataclass(frozen=True)
class BootOperations:
    install: Callable[[], Any]
    validate: Step
    catalog: Step
    build: Step
    load_backend_apps: Step
    migrations: Step
    read_desired_activation: Step
    validate_active_graph: Step
    register_active_backend: Step
    resolve_backend: Step
    serve_boot_data: Step


class BootFailure(RuntimeError):
    """A boot phase failed before user-facing boot data was served."""

    def __init__(self, phase: str, cause: BaseException) -> None:
        super().__init__(f"Helix boot failed during {phase}: {cause}")
        self.phase = phase


def run_boot_sequence(operations: BootOperations) -> Any:
    """Run the 1.0.0 cutover sequence and return the served boot data."""
    value: Any = None
    for phase, operation in _phases(operations):
        try:
            value = operation() if phase == "install" else operation(value)
        except BaseException as exc:
            raise BootFailure(phase, exc) from exc
    return value


def _phases(operations: BootOperations):
    return (
        ("install", operations.install),
        ("validate", operations.validate),
        ("catalog", operations.catalog),
        ("build", operations.build),
        ("load_backend_apps", operations.load_backend_apps),
        ("migrations", operations.migrations),
        ("read_desired_activation", operations.read_desired_activation),
        ("validate_active_graph", operations.validate_active_graph),
        ("register_active_backend", operations.register_active_backend),
        ("resolve_backend", operations.resolve_backend),
        ("serve_boot_data", operations.serve_boot_data),
    )
