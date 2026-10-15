from dataclasses import replace

import pytest

from helix_core.mod_system.boot import BootFailure, BootOperations, run_boot_sequence


def _operations(events):
    def step(name):
        def operation(value):
            events.append(name)
            return value

        return operation

    return BootOperations(
        install=lambda: events.append("install") or "installed",
        validate=step("validate"),
        catalog=step("catalog"),
        build=step("build"),
        load_backend_apps=step("load_backend_apps"),
        migrations=step("migrations"),
        read_desired_activation=step("read_desired_activation"),
        validate_active_graph=step("validate_active_graph"),
        register_active_backend=step("register_active_backend"),
        resolve_backend=step("resolve_backend"),
        serve_boot_data=step("serve_boot_data"),
    )


def test_boot_runs_the_maintenance_window_sequence_in_order():
    events = []

    result = run_boot_sequence(_operations(events))

    assert events == [
        "install",
        "validate",
        "catalog",
        "build",
        "load_backend_apps",
        "migrations",
        "read_desired_activation",
        "validate_active_graph",
        "register_active_backend",
        "resolve_backend",
        "serve_boot_data",
    ]
    assert result == "installed"


def test_boot_stops_before_user_facing_boot_data_when_a_phase_fails():
    events = []
    operations = _operations(events)

    def fail(value):
        events.append("validate")
        raise ValueError("invalid Mod")

    operations = replace(operations, validate=fail)

    with pytest.raises(BootFailure) as caught:
        run_boot_sequence(operations)

    assert caught.value.phase == "validate"
    assert isinstance(caught.value.__cause__, ValueError)
    assert events == ["install", "validate"]
