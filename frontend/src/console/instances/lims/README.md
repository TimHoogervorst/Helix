# LIMS Console

The LIMS Console — browsing and inspecting LIMS Entities.

## Route

`/lims` — with query params for state (`?search=`, `?select=`)

## Slot Composition

| Slot | Components | Description |
|------|-----------|-------------|
| `header` | (future) | Search, filter chips |
| `master.table` | `<LimsTable>` | Entity table |
| `detail.card` | `<LimsDetailCard>` | Entity summary card from workspace domain |
| `workspace.content` | `<EntityWorkspace>` | Tabbed detail view (Activity, Insights, Storage) |

## Items Rendered

| Item Type | Row Behavior | Detail Card | Workspace |
|-----------|-------------|------------|-----------|
| `entity` | Open detail | `LimsDetailCard` | `EntityWorkspace` |

## Files

| File | Purpose |
|------|---------|
| `LimsConsole.tsx` | Wire ConsolePage with slot composition, data fetching, view state |

## Dependencies

- **Depends on:** `console/core` (ConsolePage, useConsoleView), `workspaces/lims` (LimsDetailCard, EntityWorkspace)
- **Consumed by:** `App.tsx` (routing at `/lims`)

## Extending

Add a `header` slot (e.g. search bar, filter chips) by importing the component in `LimsConsole.tsx` and passing it as a prop to `<ConsolePage>`.
