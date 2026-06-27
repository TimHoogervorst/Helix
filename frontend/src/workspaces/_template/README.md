# <New Workspace>

<!-- Describe the item type and what the user does in this workspace. -->

## Quick Start

1. Copy this folder: `cp -r workspaces/_template workspaces/<name>`
2. Implement `<Name>DetailCard.tsx` — receives `{ item, viewState, onClose, onCollapse, isExiting }`
3. Implement `<Name>Workspace.tsx` — receives `{ item, isExiting }`
4. Add tests in `__tests__/`
5. Wire into a Console instance's slot composition
6. Add the dedicated URL route in `App.tsx`
7. Register in `workspaces/README.md` (index of all workspace domains)

## Console Integration

| Slot | Component | Description |
|------|-----------|-------------|
| `detail.card` | `<Name>DetailCard` | ... |
| `workspace.content` | `<Name>Workspace` | ... |

## Dedicated URL

`/<route>/:id`

## Files

| File | Purpose |
|------|---------|
| `<Name>DetailCard.tsx` | ... |
| `<Name>Workspace.tsx` | ... |
| `__tests__/` | Tests for both components |

## Dependencies

- **Depends on:** `console/core`
- **Consumed by:** `console/instances/<name>`, `pages/<Name>Detail`
