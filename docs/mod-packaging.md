# External Mod Packaging

This document describes the packaging boundary used by installed backend Mod
artifacts.

## Package root

Each Mod package has one root `modManifest.json`. The manifest is read as data,
before registration code runs. It must contain the required fields shown in the
[generated manifest reference](mod-manifest-1.0.0.md), and unknown properties
are rejected.

The in-repository ELN is the dogfood package and is linked through the root npm
workspace. Its backend uses the same editable Python distribution entry-point
contract as separately installed Mods.

```text
my-mod/
  modManifest.json
  index.ts       # when the frontend artifact is declared
  mod.py         # when the backend artifact is declared
  migrations/    # when the backend owns database state
```

Separately published backend packages use standard Python entry-point metadata
and are discovered without importing registration code.

## Frontend artifact

A frontend artifact should publish compiled ESM and declarations, expose a
side-effect-free `register(mod)` entry point, and treat React, React DOM, TipTap,
and the Mod API as host-provided peer dependencies. The current source loader
uses the in-repository `index.ts` entry points; external distribution tooling is
future work.

## Backend artifact

A backend artifact publishes a `helix.mods` entry point whose name is the
canonical Mod ID and whose value is the package root. That root embeds
`modManifest.json`, exports a side-effect-free `register(mod)` entry point,
exposes one explicit `ModAppConfig`, and carries its migrations. External
backend code imports the public `helix_core` package rather than private
Platform or other Mod modules. Package roots are resolved from entry point
metadata; filesystem globs and `helix.mods.json` path declarations are not
supported.

## Validation order

1. Read and validate every manifest without executing registration code.
2. Confirm artifact declarations and dependency graph consistency.
3. Load registrations in dependency order.
4. Resolve the resulting registrations before serving the application.

The generated [TypeScript API reference](generated/typescript-api.md), [Python
API reference](generated/python-api.md), and [validator diagnostic reference](generated/validator-diagnostics.md)
are derived from the source files currently present. Run the documentation check
after changing the schema, public exports, loader, registry, or validator.

The permanent hello-world golden fixture lives at
[`src/mods/hello_world`](../src/mods/hello_world). It is the canonical
tutorial and the smallest dual-artifact package used by the contract tests.
