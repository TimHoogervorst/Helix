# Library Console

The Library Console — filesystem-like browsing of Folders and ELN Entries.

## Route

`/library` — with query params for state (`?path=`, `?search=`, `?select=`)

## Slot Composition

| Slot | Components | Description |
|------|-----------|-------------|
| `header` | `<Breadcrumbs>`, `<LibraryNewDropdown>` | Folder path breadcrumbs + "New Folder/Entry" button |
| `master.table` | `<LibraryTable>` | Mixed folder + entry table |
| `master.footer` | — (inline) | Pagination / load-more handled via `ConsolePage` footer |
| `detail.card` | `<ElnDetailCard>` | Entry summary card from workspace domain |
| `workspace.content` | `<ElnWorkspace>` | TipTap rich-text editor from workspace domain |

## Items Rendered

| Item Type | Row Behavior | Detail Card | Workspace |
|-----------|-------------|------------|-----------|
| `folder` | Navigate into folder OR open detail | — | — |
| `entry` | Open detail | `ElnDetailCard` | `ElnWorkspace` |

## Files

| File | Purpose |
|------|---------|
| `LibraryConsole.tsx` | Wire ConsolePage with slot composition, data fetching, view state |
| `LibraryTable.tsx` | Master table row renderer (folder + entry rows) |
| `LibraryNewDropdown.tsx` | "+" button for creating folders and ELN entries |

## Dependencies

- **Depends on:** `console/core` (ConsolePage, useConsoleView), `workspaces/eln` (ElnDetailCard, ElnWorkspace), `console/components` (Breadcrumbs)
- **Consumed by:** `App.tsx` (routing at `/library`)

## Extending

Add a chrome component to the `header` slot by importing it in `LibraryConsole.tsx` and passing it as a prop to `<ConsolePage>`.
