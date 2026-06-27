# LIMS Workspace

The entity inspection workspace for LIMS Entity items.

## Console Integration

Which Console slots does this workspace fill?

| Slot | Component | Description |
|------|-----------|-------------|
| `detail.card` | `LimsDetailCard` | Entity metadata, references |
| `workspace.content` | `EntityWorkspace` | Tabbed view (Activity, Insights, Storage) |

## Dedicated URL

`/lims/:displayId` — standalone entity detail (shareable, bookmarkable). Wraps
`EntityWorkspace` in a standalone page shell (`pages/EntityWorkspace.tsx`).

## Slot Props Contract

### `LimsDetailCard`
| Prop | Type | Description |
|------|------|-------------|
| `viewState` | `ViewState` | Current console view state |
| `entity` | `EntityListItem` | The selected entity |
| `onClose` | `() => void` | Close the detail panel |
| `onCollapse` | `() => void` | Collapse from expanded to detail |
| `isExiting` | `boolean` | Exit animation flag |

### `EntityWorkspace`
| Prop | Type | Description |
|------|------|-------------|
| `entity` | `EntityListItem` | The selected entity |
| `isExiting` | `boolean` | Exit animation flag |

## Tab Structure (EntityWorkspace)

| Tab | Content | Purpose |
|-----|---------|---------|
| Activity | Timeline of actions | Activity log for the entity |
| Insights | Data visualizations | Charts, summaries |
| Storage | Storage locations | Where the entity is stored |

## Files

| File | Purpose |
|------|---------|
| `LimsDetailCard.tsx` | Summary card rendered in the Console Detail panel |
| `EntityWorkspace.tsx` | Tabbed detail surface rendered in the Workspace panel |

## Dependencies

- **Depends on:** `console/core` (panel shell contracts), `types/lims`, `components/ReferenceBadge`
- **Consumed by:** `console/instances/lims/LimsConsole`, `pages/EntityWorkspace`

## Extending

Additional tabs can be added to `EntityWorkspace.tsx` by extending the `TABS` config
array and implementing the corresponding content component.
