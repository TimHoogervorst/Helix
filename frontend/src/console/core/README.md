# Console Core

The **Console** is the platform's canonical three-panel browsing-and-work pattern.
It provides a progressive-disclosure shell with named slots: List → Detail → Expanded.

## Architecture

The Console is a **shell with named slots**. It owns panel layout, view states,
and animations. Everything else is injected through slots:

| Concern | Who owns it | Where it lives |
|---------|------------|----------------|
| Panel shells, view state machine | Console core (here) | `console/core/` |
| Reusable chrome widgets | Console components | `console/components/` |
| Concrete console composition | Console instances | `console/instances/` |
| Detail + Workspace content | Workspace domains | `workspaces/` |

## The Three View States

| State | Master | Detail | Workspace | Transition |
|-------|--------|--------|-----------|------------|
| **List** | Full-width | Hidden | Hidden | Initial state |
| **Detail** | Shared-width | Slides in | Hidden | Click a row |
| **Expanded** | Collapsed strip | Visible | Slides in | Click expand |

Transitions are strict: List → Detail → Expanded. Reverse: Expanded → Detail → List.

## Named Slots

| Slot | Position | Multi? | Purpose |
|------|----------|--------|---------|
| `header` | Above three-panel layout | Yes | Breadcrumbs, buttons, filters |
| `master.table` | Master panel body | No | The item table |
| `master.toolbar` | Above/below table | Yes | Filter chips, bulk actions |
| `master.footer` | Below table | Yes | Pagination, load-more, status |
| `detail.card` | Detail panel body | No | Item summary card (workspace-owned) |
| `workspace.content` | Workspace panel body | No | Full work surface (workspace-owned) |
| `workspace.header-left` | Top-left of workspace | Yes | Back button, item title |
| `workspace.header-right` | Top-right of workspace | Yes | Save status, actions |

## How to Create a New Console Instance

1. Create `console/instances/<name>/` with a `README.md`
2. Wire `<ConsolePage>` with your slot composition
3. Register workspace domains for your item types

## How to Create a New Workspace

1. Copy `workspaces/_template/` → `workspaces/<name>/`
2. Implement `DetailCard` and `Workspace` components
3. Wire them into your Console instance's slot composition

## Files

| File | Purpose |
|------|---------|
| `ConsolePage.tsx` | Three-panel layout shell with named slots |
| `ConsoleProvider.tsx` | View state context shared across the console |
| `ConsoleMasterPanel.tsx` | Master panel table wrapper |
| `ConsoleDetailPanel.tsx` | Detail panel shell with action buttons |
| `ConsoleWorkspacePanel.tsx` | Workspace panel shell with dedicated-link header |
| `ConsoleCollapsedStrip.tsx` | Thin strip shown when master is collapsed |
| `useConsoleView.ts` | View state machine (List → Detail → Expanded) |

## Dependencies

- **Depends on:** React, React Router
- **Consumed by:** Every Console instance, every Workspace domain
