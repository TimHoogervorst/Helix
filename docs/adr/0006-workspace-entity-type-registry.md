# ADR-0006: Workspace-Based Mention Resolution via Entity Type Registry

> Date: 2026-07-09
> Status: Accepted

---

## Context

The Mention system (currently split across `references/` app and `Mention` model in ELN) needs to resolve display IDs like `#DNA34` to navigation targets. Before the mod loader system existed, workspace discovery was hardcoded: the pins system used a static regex array (`/lims/...`, `/eln/...`), and `ReferenceBadge` branched on `type === "entity"` vs `type === "entry"` to build URLs. This meant every new mod that wanted mentionable content had to be manually wired into two or three different files.

Now that the mod system exists with a formal `register*()` API and LIMS is established as the entity data hub, we can make workspace discovery automatic. The core insight: if every mentionable thing is an entity registered in LIMS, and every entity type declares which workspace owns it, then the mention system needs zero per-mod wiring — it just asks LIMS.

Three approaches were considered:

| Approach | Per-mod wiring | Server authority | Auto-discovers new mods |
|----------|---------------|-------------------|------------------------|
| **Hardcoded type→URL branching** (status quo) | Yes (every file) | No | No |
| **Peer workspace registration + client-side prefix map** | One registration per mod | No (client duplicates server prefix knowledge) | Yes |
| **LIMS as central entity type registry** (chosen) | One registration per mod (to LIMS) | Yes (resolve endpoint returns workspaceId) | Yes |

---

## Decision

**Make LIMS the central registry for all entity types, and have the mention system resolve workspace targets by querying LIMS.**

The architecture has two layers:

### 1. Entity type registration (mod → LIMS)

Every mod that has mentionable content registers its entity types with LIMS at boot:

```
MolBio mod → registry.call("lims.registerEntityType", {
  prefix: "DNA",
  entityType: "dna_sequence",
  workspaceId: "molBio",
  displayName: "DNA Sequence",
})
```

LIMS validates prefix uniqueness and stores the registration. The backend mirrors this with a `RegisteredEntityType` model (`prefix`, `content_type`, `workspace_id`, `display_name`).

### 2. Mention resolution (mention system → LIMS → workspace)

When resolving a display ID like `DNA34`:

1. Extract prefix (`DNA`)
2. Look up in `RegisteredEntityType` → find workspace `molBio`
3. Return `workspaceId` in the resolve response
4. Frontend builds URL by convention: `/{workspaceId}/{displayId}` → `/molBio/DNA34`

The URL convention `/{workspaceId}/{displayId}` is the single integration point. Every workspace URL follows this pattern; no per-type route configuration is needed. The workspace route path (registered via `registerRoute()`) determines the URL namespace.

```
┌──────────────────────────────────────────────────┐
│  LIMS (central entity type registry)             │
│                                                  │
│  RegisteredEntityType rows:                      │
│  ┌────────┬──────────────┬──────────────┐        │
│  │ Prefix │ Entity Type  │ Workspace ID │        │
│  ├────────┼──────────────┼──────────────┤        │
│  │ E      │ eln_entry    │ eln          │        │
│  │ SAM    │ sample       │ lims         │        │
│  │ DNA    │ dna_sequence │ molBio       │        │
│  └────────┴──────────────┴──────────────┘        │
│                                                  │
│  POST /api/mentions/resolve/                     │
│  {"ids": ["DNA34"]}                              │
│  → [{ displayId: "DNA34", workspaceId: "molBio", │
│       title: "pUC19", ... }]                     │
└──────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Mention System (consumer only)                  │
│                                                  │
│  MentionBadge builds URL:                        │
│  /${workspaceId}/${displayId}                    │
│  → /molBio/DNA34                                 │
│                                                  │
│  Zero per-mod wiring. All entity types work.     │
└──────────────────────────────────────────────────┘
```

---

## Rationale

### Why LIMS as the registry

LIMS is already the data hub for structured entities. It owns `EntityType`, `Entity`, and the display ID system. Making it the registry for mentionable types is a natural consolidation — not a new responsibility bolted onto an unrelated module.

### Why not a standalone workspace registry

A separate `WorkspaceRegistry` that mods register with directly would require each mod to call two registrations (`registerWorkspace` + `registerWithMentions`). The mention system would then need to merge workspace data with entity type data to resolve prefixes. LIMS-as-registry is a single registration point.

### Why the URL convention instead of configured URL patterns

Configuring URL patterns per entity type (`urlPattern: "/molBio/sequences/{id}"`) adds flexibility but creates inconsistency. The convention `/{workspaceId}/{displayId}` is predictable, debuggable, and eliminates a class of misconfiguration bugs ("I registered my entity type but the links are 404"). If a mod needs a non-standard URL structure later, the workspace can expose a `buildUrl(displayId)` function as an override — but the convention remains the default.

### Why the server is the authority for workspaceId

The resolve endpoint already returns entity metadata. Adding `workspaceId` to the response costs one JOIN and eliminates the need for the client to maintain a duplicate prefix→workspace map. The server's `RegisteredEntityType` table is the single source of truth; the client's in-memory registry (populated via `registry.call`) is a cache for UI hints only.

### Why `register*()` remains synchronous

Entity type registration during mod boot is a synchronous operation — it stores a config object in an in-memory Map. No I/O, no async work. The `ModRegistry.call()` mechanism supports this: the service handler can be synchronous, and `register()` functions can call it without becoming async. This preserves the existing boot sequence contract.

---

## Consequences

### Current benefits

- **Zero per-mod wiring for mentions.** A mod registers its entity type with LIMS and its workspace with the mod system. Mentions, pins, and navigation all work automatically.
- **Single source of truth.** The `RegisteredEntityType` table (backend) and LIMS's in-memory registry (frontend) are the only places that map prefixes to workspaces.
- **Dead code elimination.** The hardcoded `WORKSPACE_ROUTES` array in `usePinnedWorkspaces.ts` and the `type → URL` branching in `MentionBadge.tsx` are replaced by generic, data-driven logic.
- **Consistent navigation.** Every mentionable entity's URL is `/{workspaceId}/{displayId}` — predictable for users and developers.

### Constraints

- **Every mentionable entity type must be registered with LIMS.** This includes ELN Entries, which become a custom entity type with prefix `E` registered by the ELN mod. The existing `ContentType` for `NotebookEntry` is linked via `RegisteredEntityType`.
- **Prefixes remain unique across all entity types.** The `RegisteredEntityType.prefix` column has a `unique=True` constraint, enforcing the same invariant as the existing `EntityType.prefix` field.
- **Workspace IDs must be valid URL segments.** Since the workspace `id` is used directly in URLs (`/{workspaceId}/...`), it must be a valid URL path segment. The existing mod ID convention (lowercase alphanumeric) already satisfies this.
- **LIMS must load before mods that register entity types.** The `dependsOn: ["lims"]` declaration in mod manifests ensures this. Mods that register entity types declare LIMS as a dependency.

### Note: Design evolution toward backend-owned registration

Since this ADR was accepted, [ADR-0008](0008-single-source-registration.md) (Single Source Registration) has shifted the registration model. Entity type registration is moving from frontend `registry.call("lims.registerEntityType", ...)` to backend `mod.py` → `register_schema_type()`. The frontend discovers entity types via `GET /api/mod-registry/` at boot rather than calling a frontend service. The resolution chain and URL convention `/{workspaceId}/{displayId}` remain the same — only the registration mechanism changes from frontend service call to backend-owned declaration. The `RegisteredEntityType` model, prefix uniqueness constraint, and LIMS-as-registry architecture are unaffected.

### Future considerations

- **Custom entity type behaviors.** The `RegisteredEntityType` table can gain columns for custom renderers, action sets, or validation rules — without changing the resolution architecture.
- **Mod separation in the database.** The `RegisteredEntityType.workspace_id` field is a natural boundary for multi-tenancy or database-per-mod isolation.
- **Custom URL patterns as an override.** If a workspace needs non-standard URLs (e.g., `/sequences/DNA34` instead of `/molBio/DNA34`), the workspace config can gain an optional `buildUrl(displayId)` function. The convention remains the default.
- **Dynamic registration after boot.** If hot-reloading mods becomes a requirement, the registration flow supports it — `registerEntityType()` is just a function call that updates in-memory state.
