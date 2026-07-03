# ELN Workspace

The rich-text editing workspace for ELN Entry items.

## Console Integration

Which Console slots does this workspace fill?

| Slot | Component | Description |
|------|-----------|-------------|
| `detail.card` | `ElnDetailCard` | Entry metadata, references, content preview |
| `workspace.content` | `ElnWorkspace` | TipTap rich-text editor |

## Dedicated URL

`/eln/:id` — standalone editor (shareable, bookmarkable). Wraps `ElnWorkspace` in a
standalone page shell (`pages/ElnDetail.tsx`).

## Slot Props Contract

### `ElnDetailCard`
| Prop | Type | Description |
|------|------|-------------|
| `entry` | `LibraryEntryItem` | The selected entry |
| `viewState` | `ViewState` | Current console view state |
| `onClose` | `() => void` | Close the detail panel |
| `onCollapse` | `() => void` | Collapse from expanded to detail |
| `isDetailExiting` | `boolean` | Exit animation flag |

### `ElnWorkspace`
| Prop | Type | Description |
|------|------|-------------|
| `entry` | `LibraryEntryItem` | The selected entry |
| `isExiting` | `boolean` | Exit animation flag |

## Files

| File | Purpose |
|------|---------|
| `ElnDetailCard.tsx` | Summary card rendered in the Console Detail panel |
| `ElnWorkspace.tsx` | TipTap editor surface rendered in the Console Workspace panel |

## Dependencies

- **Depends on:** `console/core` (panel shell contracts), `types/library`, `components/ElnEditor`, `components/ContentPreview`, `components/ReferenceBadge`
- **Consumed by:** `core-mods/library/console/LibraryConsole`, `pages/ElnDetail`

## Extending

Plugins can inject action buttons into `workspace.header-right` via future slot
registration. The ELN editor (`ElnEditor`) can be extended with TipTap extensions.
