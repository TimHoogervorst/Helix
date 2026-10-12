# Hello World Mod

This is the smallest dual-artifact Mod template. The repository has one
`modManifest.json`; the frontend and backend packages publish from this same
directory.

## Validate and build

```bash
helix-mod-validate author .
npm install
npm run build
python -m build
```

The backend distribution advertises the `helix.mods` entry point
`example.helloworld = hello_world_mod`. The frontend distribution exports the
compiled `register(mod)` entry point as `@example/hello-world-mod`.

The example demonstrates a workspace, Slot, Block, namespaced route, Service,
Schema Type, migration, Platform Action, activation, and provider/version
provenance without importing Helix internals.
