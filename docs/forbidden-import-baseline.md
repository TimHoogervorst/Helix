# Forbidden Import Baseline

External Mods may import the public `helix_core` facade, framework packages, and
their own source. They may not import private `helix_core` modules or another
Mod directly. `dependsOn` establishes presence and version compatibility only;
it never grants import permission.

Bundled Mods are checked against the explicit ledger in
`src/helix_core/mod_system/forbidden_import_baseline.json`. The ledger captures
the existing Phase 2b debt from #611 and #612. A Bundled violation is accepted
only when its complete Mod, code, path, line, and imported-module key is already
in that file. Any new violation fails catalog validation immediately.

The scan is static and runs without importing registration modules. Tests and
migrations are excluded because they are not shipped Mod artifacts.
