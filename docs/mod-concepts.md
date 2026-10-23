# External Mod Concepts

An External Mod is a self-contained extension composed into a Helix deployment at
build time. Bundled Mods and External Mods use the same registration API; the
difference is how the deployment supplies them, not a privileged capability set.

## Identity

Every Mod has one strict `modManifest.json` at its package root. The canonical
identity is a lowercase ASCII `vendor.name` ID. Package names, Python import
packages, Django app labels, and the Mod ID are separate names and must not be
derived from one another by convention.

The manifest describes identity and compatibility only. Registrations describe
capabilities and are executed by the loader after validation. A manifest does not
declare routes, models, services, or UI blocks.

## Artifacts

`artifacts` is a non-empty set containing `frontend`, `backend`, or both. A
frontend-only Mod does not need a Python distribution. A backend-only Mod does
not need a JavaScript artifact. A dual-artifact Mod uses one identity and version
for both halves.

## Dependencies

`dependsOn` contains objects with an `id` and an npm-compatible SemVer range.
Dependencies describe presence and compatibility, not permission to import a
private implementation. The deployment validates the complete graph before
registration and loads dependencies before dependents.

## Installed and active

Installation and activation are different concerns. An installed Mod is present
and structurally valid; an inactive Mod keeps its backend app available for
models and migrations but contributes no registrations; an active Mod
contributes registrations. A removed Mod has no available artifact, but its
manifest and durable provenance remain inspectable. Organization Admins change
desired activation through `POST /api/mod-lifecycle/`. Changes are atomic,
dependency-aware, audit logged, and take effect after a restart. Startup
validates the persisted graph again before registration.

## Tutorial

The **hello-world repository** described in [External Mod Contract #615](https://github.com/TimHoogervorst/Helix/issues/615)
is the canonical tutorial and golden integration example at
[`src/mods/hello_world`](../src/mods/hello_world).
