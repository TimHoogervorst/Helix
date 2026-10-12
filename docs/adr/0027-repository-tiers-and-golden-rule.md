# ADR-0027: Repository Tiers, Golden Rule, and Deferred Enforcement

> Date: 2026-10-12
> Status: Accepted
> Related issue: [#614](https://github.com/TimHoogervorst/Helix/issues/614)

## Decision

Helix exposes three repository tiers: **Platform** in `src/helix_core/`, **Bundled Mods** in `src/bundled/`, and **External Mods** in `src/mods/`. The golden rule is: **nothing inside Helix names an External Mod**. Bundled Mods ship in the versioned Helix artifact and are a closed, explicitly enumerated set; External Mods are composed into a deployment at build time through the open discovery path.

Golden-rule enforcement is deliberately deferred. The existing Phase 1 code edges remain in place while the boundary is made visible. The Phase 2b debt ledger is:

| Debt | Current edge | Planned direction |
|---|---|---|
| Library -> ELN | Library manifest/API/types/endpoint and model lookup references ELN | ELN capability/service boundary |
| LIMS -> ELN | LIMS views/services import ELN models | Registry/service boundary |
| Home -> ELN | Home tests reference ELN | Test seam without bundled-to-External naming |

No lint or allowlist is added in Phase 1; the ledger is the input to Phase 2b discovery work.

## Consequences

The directory layout communicates artifact ownership, but current bundled-to-External coupling is visible technical debt rather than a silently enforced rule. Future work must remove the three ledger entries before adding enforcement.
