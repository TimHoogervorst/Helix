# Console Components

Reusable chrome widgets shared across Console instances. These components decorate
the shell — they don't own item logic or workspace content.

## Slot Contracts

Chrome components register into **named slots** on `<ConsolePage>`. Each slot has a
props contract the component must satisfy:

| Slot | Components | Contract |
|------|-----------|----------|
| `header` | `Breadcrumbs`, `NewDropdown` | `{ path, onNavigate, onUp, ...instanceProps }` |
| `master.toolbar` | (future) | `{ selectedItems, ...actions }` |
| `master.footer` | (future) | `{ hasMore, onLoadMore, loadingMore }` |
| `workspace.header-left` | (future) | `{ item, ...workspaceContext }` |
| `workspace.header-right` | (future) | `{ item, ...workspaceContext }` |

## Design Principle

Chrome components are **props-over-hooks**: they receive everything they need via props
from the Console instance that composes them. This keeps them pure, testable, and
reusable across instances.

## Files

| File | Purpose |
|------|---------|
| `Breadcrumbs.tsx` | Folder path breadcrumbs with root/segment navigation and back button |

## Dependencies

- **Depends on:** React (no Console Core dependency — pure props-in)
- **Consumed by:** `console/instances/library/LibraryConsole`, any future Console instance

## Adding a New Chrome Component

1. Create the component with a clear props interface (e.g. `BreadcrumbsProps`)
2. Add tests in `__tests__/`
3. Register it in the appropriate slot in a Console instance
4. Update this README's Files table
