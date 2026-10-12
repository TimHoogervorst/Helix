# External Mod Packaging

This document describes the packaging boundary that the current repository can
document without pretending that package discovery is already implemented.

## Package root

Each Mod package has one root `modManifest.json`. The manifest is read as data,
before registration code runs. It must contain the required fields shown in the
[generated manifest reference](mod-manifest-1.0.0.md), and unknown properties
are rejected.

Repository Mod folders currently provide the dogfood shape:

```text
my-mod/
  modManifest.json
  index.ts       # when the frontend artifact is declared
  mod.py         # when the backend artifact is declared
  migrations/    # when the backend owns database state
```

The exact npm distribution metadata and Python entry-point metadata for a
separately published package are not implemented in this workspace. Do not add
metadata examples that imply they are accepted by the current loader. The
planned packaged shape is captured by the parent [External Mod Contract #615](https://github.com/TimHoogervorst/Helix/issues/615).

## Frontend artifact

A frontend artifact should publish compiled ESM and declarations, expose a
side-effect-free `register(mod)` entry point, and treat React, React DOM, TipTap,
and the Mod API as host-provided peer dependencies. The current source loader
uses the in-repository `index.ts` entry points; external distribution tooling is
future work.

## Backend artifact

A backend artifact should expose a side-effect-free registration entry point and
carry its migrations. External backend code imports the public `helix_core`
package rather than private Platform or other Mod modules. The current repository
loader supports `mod.py` packages and `helix.mods.json` path composition; Python
entry-point discovery is future work.

## Validation order

1. Read and validate every manifest without executing registration code.
2. Confirm artifact declarations and dependency graph consistency.
3. Load registrations in dependency order.
4. Resolve the resulting registrations before serving the application.

The generated [TypeScript API reference](generated/typescript-api.md), [Python
API reference](generated/python-api.md), and [validator diagnostic reference](generated/validator-diagnostics.md)
are derived from the source files currently present. Run the documentation check
after changing the schema, public exports, loader, registry, or validator.

The hello-world repository from #615 is the canonical tutorial once published;
this repository deliberately does not create a substitute fixture or invent its
generated inputs.
