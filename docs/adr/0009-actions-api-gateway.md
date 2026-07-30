# ADR-0009: Actions API Gateway — Unified Endpoint for All Database Mutations

> Date: 2026-07-24
> Status: Accepted
> Companion specs: [Spec 2 — Refined Action Model](../../.claude/spec-2-refined-action-model.md), [Spec 1 — Single-Source Registration](../../.claude/spec-1-single-source-registration.md)

---

## Context

The action logging system has three structural weaknesses. First, action types are ad-hoc strings (`eln.entry.created`, `lims.sample.aliquoted`) with no explicit catalog — the frontend ActivityFeed has no way to discover what actions exist without hardcoding. Second, block-level actions flow through a separate batched pipeline (`bus.collect()` + flush to a mod-specific batch endpoint) rather than through the same action API as HTTP-endpoint actions — two code paths for the same audit concern. Third, there is no distinction between core actions (create/edit/delete — universal to every model) and custom domain actions (registered, annotated, aliquoted — domain-specific). Custom actions are just strings passed to `@logs_action` without validation or cataloging.

Looking forward, the user's vision is that the Actions API becomes **the gateway for all database mutations** — not just audit logging, but the single entry point through which any code (HTTP endpoint, block, service function, external integration) makes changes to the database. This ADR establishes the foundation for that vision while staying scoped to action logging for now.

Three approaches were considered:

| Approach | Action catalog | Block actions | Future: mutation gateway |
|----------|---------------|---------------|------------------------|
| **Status quo — ad-hoc strings + dual pipeline** | No (strings only) | Separate batched pipeline (`bus.collect()`) | Not possible (two code paths) |
| **Per-mod action endpoints** | Optional (per-mod) | Per-mod endpoint | Fragmented (N endpoints to call) |
| **Unified `POST /api/actions/` endpoint** (chosen) | Yes (registered catalog, core + custom) | Same endpoint as HTTP | Natural (single entry point) |

---

## Decision

**All actions — whether from HTTP endpoints or blocks — go through a single unified `POST /api/actions/` endpoint. Core CRUD actions are auto-derived from every registered model/viewset. Custom domain actions are explicitly registered in the backend and map to a core action base. Blocks send actions at runtime via the unified endpoint rather than declaring action messages statically.**

### Action model

```
Core actions (auto-derived from every model/viewset):  created | edited | deleted
Custom actions (explicitly registered, map to a core):   registered → base: edited
                                                         annotated  → base: edited
                                                         aliquoted  → base: edited
```

When a custom action fires, the backend logs **both** the core action row and the custom action row. The ActivityFeed shows the custom action label when one was used, otherwise the core action label. Every action is always traceable to a core CRUD operation — the audit trail is never unclear about whether something was created, edited, or deleted.

### Unified endpoint

`POST /api/actions/` accepts:

| Field | Type | Purpose |
|-------|------|---------|
| `action_type` | string | The action type ID (e.g., `"lims.sample.registered"`) |
| `target_type` | string | ContentType `app_label.model` |
| `target_id` | integer | The affected record's primary key |
| `metadata` | JSON object | What changed, context, snapshot data |
| `performed_by` | FK to User | From request authentication |
| `workspace_id` | string | Which workspace context this action occurred in |
| `timestamp` | ISO 8601 datetime | From client, for offline/batched actions |

The backend:
1. Resolves `workspace_id` to the owning mod
2. Validates `action_type` against that mod's registered action catalog
3. Routes to the correct mod action table
4. Logs the core action row
5. If the action is a custom action, also logs the custom action row
6. Returns `201 Created` with the created action row(s)

### Block action flow — runtime, not static

Blocks no longer declare action messages statically in `registerBlock()`. Instead:

1. At boot, `GET /api/mod-registry/` returns the action catalog for each workspace
2. The block component receives the action catalog via `SlotContext.actions`
3. The renderer provides `sendAction(action_type, metadata)` to blocks via `BlockComponentProps`
4. When the user triggers a domain action, the block calls `sendAction()` — which calls `POST /api/actions/`

The block sends: `action_type`, `target_type`, `target_id`, `workspace_id`, `metadata`. The block doesn't know or care how logging works — it just says "this happened."

### Backend action catalog

Mods register custom actions in `mod.py`:

```python
def register():
    registry.register_custom_action(
        mod_id="lims",
        action_id="lims.sample.registered",
        label="Sample Registered",
        core="edited",
        target_model="mods.lims.models.Entity",
    )
```

Core actions (`created`, `edited`, `deleted`) are auto-derived when `register_action_model()` is called — the three core action IDs are derived from the model's app_label and name. No manual registration needed.

### What is removed

| Removed | Reason |
|---|---|
| `messages` field on `BlockRegistration` | Blocks send domain actions at runtime; no static action message declaration |
| `bus.collect()` + `bus.flush()` action batching | Blocks call `POST /api/actions/` directly |
| Per-mod batch action endpoints | Replaced by unified `POST /api/actions/` |

---

## Rationale

### Why a single unified endpoint

Two code paths for the same audit concern (HTTP endpoint logging vs. block action logging) means two places for bugs, two testing strategies, and two integrations for the ActivityFeed. A single endpoint means one validation path, one response contract, one audit trail. It also establishes the foundation for the endpoint to become the gateway for all database mutations — not just action logging.

### Why core + custom action model

Every mutating operation is fundamentally a create, edit, or delete. Custom actions add domain semantics ("registered", "aliquoted") but the underlying operation is still one of the three core types. By requiring every custom action to map to a core action, the audit trail maintains a clear, compliance-ready record: nothing is ever "just" registered — it was edited (the core action) with the custom label "Registered" (the domain action). This satisfies both CFR Part 11 (clear audit trail of what happened to each record) and domain expressiveness (users see "Sample Registered" not "Edited").

### Why block messages move to runtime

Static `messages` on `BlockRegistration` are declarative but inflexible. A block that can perform multiple domain actions (a registry table that can register, aliquot, and annotate samples) would need separate block registrations per action type — or the `messages` field would need to become a catalog, duplicating the backend's action catalog on the frontend. Runtime action sending via `sendAction()` lets a block send whatever action is appropriate for what the user actually did, using the backend's action catalog as the source of truth for valid action types.

### Why the action catalog lives in the backend

The backend already owns the models, the action tables, and the validation of `action_type` strings. Making it also own the catalog of valid action types is a natural consolidation. The frontend discovers the catalog via `GET /api/mod-registry/` — same discovery mechanism as workspace identity and schema types (see ADR-0008).

### Why actions become the mutation gateway

Currently, mutations flow through mod-specific endpoints (`POST /api/lims/entities/`, `PUT /api/eln/entries/123/`). Each endpoint independently handles validation, authorization, and action logging. As the system grows, this fragments cross-cutting concerns: authorization rules, audit logging, cache invalidation, and event publishing must be wired into every endpoint.

The unified `POST /api/actions/` endpoint is the natural chokepoint for all of these concerns. Once every mutation flows through it, adding a new cross-cutting concern (e.g., WebSocket notifications, cache invalidation, compliance validation) means adding it in one place. This ADR establishes the endpoint for action logging; a future ADR will broaden it to become the mutation gateway.

---

## Consequences

### Current benefits

- **Single audit trail path.** Every action — HTTP endpoint or block — flows through `POST /api/actions/`. One endpoint to test, monitor, and secure.
- **Discoverable action catalog.** `GET /api/mod-registry/` returns every action type a mod supports. The ActivityFeed and other consumers adapt to any mod without hardcoding.
- **Core action auto-derivation.** Mod authors get CRUD audit logging for free — register a model, and `created`/`edited`/`deleted` actions are logged automatically.
- **Domain-appropriate labels.** Users see "Sample Registered" in the ActivityFeed, not "Edited." Developers see the core action underneath for debugging.
- **Block simplicity.** Blocks call `sendAction("lims.sample.registered", { ... })` — no bus, no collect/flush, no batch endpoint. One function call, one HTTP request.
- **Compliance by construction.** Every custom action maps to a core action. The audit trail always answers "was this created, edited, or deleted?" — a CFR Part 11 requirement.

### Constraints

- **All mods with mutations must register actions.** Mods that currently use `ActionLoggingMixin` continue to work — core actions are auto-derived. Mods with custom actions must add `register_custom_action()` calls to `mod.py`.
- **Block authors must know valid action types.** The action catalog is available at dev-time via `GET /api/mod-registry/`. Sending an unregistered action type returns a `400 Bad Request` with a clear error.
- **`messages` field is removed from `BlockRegistration`.** This is a breaking change to the block registration API. Blocks that currently declare `messages` must be updated to use `sendAction()` from `BlockComponentProps`.
- **`bus.collect()` / `bus.flush()` for actions is removed.** The workspace event bus continues to exist for non-action events (block lifecycle, UI state changes). Only the action collection and batching pipeline is removed.
- **Unified endpoint is synchronous.** Each `POST /api/actions/` call writes action rows synchronously. For high-frequency block actions (rapid typing, many table edits), the client should debounce or batch calls. The endpoint is designed to accept batched arrays in a future iteration.

### Future considerations

- **Action endpoint as mutation gateway.** The `POST /api/actions/` endpoint will eventually accept not just action log entries but full mutations — the endpoint validates, authorizes, executes the mutation, and logs the action in one transaction. This ADR establishes the endpoint and the action catalog; the mutation execution layer is deferred.
- **Batched action submission.** The endpoint may accept an array of actions (`POST /api/actions/batch/`) for use cases like auto-save where multiple actions should be written atomically. The single-action endpoint comes first.
- **Per-action metadata schemas.** Currently `metadata` is a freeform JSON blob. Custom actions could optionally declare a JSON Schema for their metadata, enabling validation and auto-generated UI for action metadata.
- **Action-sourced event stream.** With all actions flowing through one endpoint, a future event stream (WebSocket, SSE) can push actions to connected clients in real time — the ActivityFeed updates live instead of on workspace navigation.
- **Action permissions.** Currently all actions inherit the permission model of the target entity. Custom actions could declare their own permission requirements in the catalog.
- **Action retention and archival.** The unified endpoint is a natural point to enforce retention policies (archive actions older than N months to cold storage).
