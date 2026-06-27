# Workspaces Core

Shared workspace infrastructure — contracts, patterns, and utilities for all workspace domains.

## What is a Workspace?

A **Workspace** is the work surface for a specific item type. It has two faces:

| Face | Component | Panel | When |
|------|-----------|-------|------|
| **Detail Card** | `<Name>DetailCard` | Console Detail panel | User clicks a row |
| **Workspace** | `<Name>Workspace` | Console Workspace panel OR dedicated URL | User clicks expand or navigates directly |

## Workspace Contract

Every workspace domain must provide at minimum:

| Component | Props | Purpose |
|-----------|-------|---------|
| `<Name>DetailCard` | `{ item, viewState, onClose, onCollapse, isDetailExiting }` | Rendered in Detail panel |
| `<Name>Workspace` | `{ item, isExiting }` | Rendered in Workspace panel |

## Dedicated URLs

Workspaces can also be reached via dedicated URLs (e.g. `/eln/:id`, `/lims/:displayId`).
The same `<Name>Workspace>` component is used — wrapped in a standalone page shell
rather than the Console's Workspace panel.

## Dependencies

- **Depends on:** `console/core` (panel shell contracts)
- **Consumed by:** Every workspace domain
