# Grilling Alignment

> Date: 2026-07-13
> Purpose: Quick-reference constraints for grilling sessions on any design doc in this project. Keep each session consistent with decisions already made.

---

## Hard Constraints (do not reopen without strong reason)

| # | Constraint | Source |
|---|-----------|--------|
| 1 | **Triple-dotted event naming:** `"{mod}.{target}.{verb_past}"` — same string on bus, in DB, in UI subscriptions | [cross-cutting-events.md](cross-cutting-events.md) |
| 2 | **Block lifecycle events are framework-emitted, never block-emitted.** Block author never calls `bus.emit()`. | [slot-system.md](slot-system.md) |
| 3 | **All three block lifecycle events always fire** (`created`, `edited`, `deleted`). No opt-out from emission. Message overrides available, not event suppression. | [slot-system.md](slot-system.md) |
| 4 | **Action type = event name.** Mechanically derived from block ID + lifecycle verb. No `action.actionType` field. | [slot-system.md](slot-system.md) |
| 5 | **Services never return ORM objects.** Platform SDK types or plain dicts only. | [cross-cutting-events.md](cross-cutting-events.md) |
| 6 | **No `provides` on manifests.** Registry is the single source of truth. Frontend and backend meta shapes match: `id`, `displayName`, `version`, `dependsOn`. | [cross-cutting-events.md](cross-cutting-events.md) |
| 7 | **`version` is required on all manifests.** Documentation-only for now. Parse later. | [cross-cutting-events.md](cross-cutting-events.md) |
| 8 | **No `registerEventListener()`.** Blocks use declarative `listensTo` + `onEvent`. Components use imperative `bus.on()` in `useEffect`. | [slot-system.md](slot-system.md) |
| 9 | **Action logging owned by workspace shell, not editor.** Editor emits facts; workspace translates to action log entries. | [slot-system.md](slot-system.md) |
| 10 | **Slots for embedded UI extension only.** Flat registrations stay for app-level concerns (routes, hubs, settings). | [slot-system.md](slot-system.md) |

## Three Content Types in Slots

Whenever discussing what goes into a slot, use these exact types. No "block" as a catch-all.

| Type | Use case | Has `onClick`? | Has `onEvent`? | Has `node`? |
|------|---------|---------------|---------------|------------|
| `button` | Header actions, toolbar items | Yes | No | No |
| `block` | Editor content (tables, comments, protocols) | No | Yes (`listensTo`) | Yes |
| `component` | Sidebar panels, custom UI (ActivityFeed, lock indicator) | No | No (uses `bus.on()`) | No |

## Implementation Order (don't reorder without understanding dependencies)

```
1. Platform SDK + Mod Manifest   [backend-mod-system.md]  ← helix_core created here
2. Unified Backend Registry      [backend-mod-system.md]
3. Declarative Action Mixins     [actions-system-design.md]    ← Backend-only
4. Slot System + Event Bus       [slot-system.md]              ← Frontend-only
5. Block-Declared Actions        [actions-system-design.md]    ← Needs 3 + 4
6. Cross-Mod ActivityFeed        [actions-system-design.md]    ← Needs 4 + 5
7. Backend Service Registry      [backend-mod-system.md]       ← Needs 2
8. External Mod Contract         [backend-mod-system.md]       ← Needs 7
```

Phases 3 and 4 can run in parallel (backend vs. frontend). Everything else is sequential.

> **Note:** The Platform SDK (`helix_core`) is created in Phase 1 alongside the mod manifest, not deferred to Phase 8. This avoids building manifest/registry code in `core/` and migrating it later. Existing SDK-shaped code (`AbstractBaseAction`, `BrowsableItem`, `log_action`, pagination, permissions) moves to `helix_core/` immediately. Phase 8 is now external mod contract only (helix.mods.json, pip packaging, registry.override()).

## Doc-to-Doc Cross-References

Each doc should link to these companions in its header:

| Doc | Links to |
|-----|---------|
| [mod-system.md](mod-system.md) | slot-system.md (blocks are slot content now) |
| [slot-system.md](slot-system.md) | mod-system.md, actions-system-design.md, cross-cutting-events.md |
| [actions-system-design.md](actions-system-design.md) | mod-system.md, slot-system.md, backend-mod-system.md, cross-cutting-events.md |
| [backend-mod-system.md](backend-mod-system.md) | mod-system.md, actions-system-design.md, cross-cutting-events.md |
| [cross-cutting-events.md](cross-cutting-events.md) | All four above |

## During a Grilling Session

1. **Open this doc first.** Check hard constraints before proposing changes.
2. **Consult the glossary.** [CONTEXT.md](../CONTEXT.md) defines canonical terms. Use them, don't invent synonyms.
3. **If a constraint needs changing,** update this doc as part of the session's output — don't leave it stale.
4. **Cross-reference the reconciliation doc.** [cross-cutting-events.md](cross-cutting-events.md) is the authoritative source for decisions that span multiple docs.
