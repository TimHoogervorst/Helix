## Problem Statement

The ELN detail page (`ElnDetail.tsx`) wraps the editor in `ConsoleWorkspacePanel`, which was designed for the old console pattern (Master-Detail-Workspace panels). In the new Helix sidebar-based layout, the ELN entry page should be a full-page 3-column experience: sidebar (from Layout) | centered content area (max-w-3xl) | metadata panel (288px, visible at xl breakpoint). Additionally, `/eln/new` and `/eln/:id` should be a single route, and the embedded editor mode (used inside Library console) should be removed entirely.

## Solution

Restructure `ElnDetail.tsx` into a 3-column layout. The page owns its own top toolbar (breadcrumbs, action buttons, user avatars, Share/Sign & Witness buttons). The content area centers the editor at `max-w-3xl`. A metadata panel slides in on the right at `xl` breakpoint. Remove `ElnNew.tsx`, `ElnWorkspace.tsx`, the `embedded` prop from `ElnEditor`, and all embedded-mode code paths.

## User Stories

1. As a researcher, I want to see my ELN entry in a centered content column with a right-side metadata panel, so that I can reference metadata while editing.
2. As a researcher, I want breadcrumbs showing my folder path at the top of the entry page, so that I know where this entry lives.
3. As a researcher, I want to see action buttons (History, Comments, Star) in the top toolbar, so that I know these features exist (placeholder for now).
4. As a researcher, I want to see Share and Sign & Witness buttons in the top toolbar, so that I know collaboration features are planned.
5. As a researcher, I want to see user avatars of collaborators in the top toolbar, so that I know who else is working on this entry.
6. As a researcher, I want a status badge showing "Draft" in the breadcrumb area, so that I know the entry's state at a glance.
7. As a developer, I want a single `/eln/:id` route handling both new and existing entries, so that route logic is simpler.
8. As a developer, I want the embedded editor mode removed entirely, so that the codebase has fewer conditional code paths.
9. As a developer, I want the paper-page wrapper removed from the editor, so that the editor content fills the available space naturally.
10. As a researcher on a small screen, I want the metadata panel to hide below the xl breakpoint, so that I have more room for content editing.

## Implementation Decisions

### Route Changes
- `/eln/new` route is removed. Redirect `/eln/new` to `/eln/new` by passing `undefined` as `entryId` to `ElnEditor`, which already handles the "new entry" case when no `entryId` is provided.
- All ELN navigation goes through `/eln/:id`. A new entry is created by navigating to `/eln/new` route, which internally renders `ElnDetail` with no id — `ElnEditor` enters "edit-new" mode.
- Actually: the route `/eln/new` should render `ElnDetail` without an `id` param. Add `<Route path="/eln/new" element={<ElnDetail />} />` to App.tsx, which renders ElnDetail with `useParams<{ id: string }>()` returning undefined for `id`.

### Files to DELETE
- `frontend/src/pages/ElnNew.tsx` — 5 lines, just wraps ElnEditor. Absorbed into `/eln/:id`.
- `frontend/src/workspaces/eln/ElnWorkspace.tsx` — embedded mode workspace. No longer needed.
- `frontend/src/workspaces/eln/ElnDetailCard.tsx` — detail card used in console pattern. No longer needed in page-mode ELN.

### ElnDetail.tsx — New 3-Column Layout

The page structure:
```
<div className="flex min-w-0 flex-1 flex-col">
  <!-- Top toolbar -->
  <div className="flex items-center justify-between border-b border-hairline px-6 py-2.5">
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <!-- Breadcrumbs: folder icon + folder names + chevrons + entry display_id -->
      <!-- Status badge: lock icon + "Draft" in mono uppercase -->
    </div>
    <div className="flex items-center gap-1">
      <!-- History, Comments, Star icon buttons -->
      <!-- Separator -->
      <!-- User avatars (MK, JS, AR in colored circles) -->
      <!-- Share button (with text) -->
      <!-- Sign & Witness button (primary, with text) -->
    </div>
  </div>

  <!-- Content + Metadata -->
  <div className="flex min-w-0 flex-1">
    <main className="min-w-0 flex-1">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-8">
        <ElnEditor entryId={id} />
      </div>
    </main>
    <aside className="hidden w-72 shrink-0 border-l border-hairline bg-surface/60 xl:block">
      <!-- Metadata panel (placeholder sections — filled in PRD #5) -->
    </aside>
  </div>
</div>
```

### ElnEditor.tsx Changes
- Remove `embedded` prop from `ElnEditorProps` interface
- Remove all `is-embedded` conditional rendering
- Remove the `paper-page` wrapper div
- Remove `EditorBubbleMenu` import and all usage
- Remove `initialFolderId` prop (folder selector handled differently)
- Remove `EditorBubbleMenu` import entirely (component deleted in PRD #6)
- The editor always renders in "full" mode — no mode switching

### Top Toolbar Buttons (all with tooltips)

| Button | Icon | Tooltip |
|--------|------|---------|
| History | `History` | "Placeholder — version history coming soon" |
| Comments | `MessageSquare` | "Placeholder — comments coming soon" |
| Star | `Star` | "Placeholder — bookmark coming soon" |
| Share | `Share2` | "Placeholder — sharing coming soon" |
| Sign & Witness | `CircleCheck` | "Placeholder — sign & witness coming soon" |

### Breadcrumbs
- Rework the existing breadcrumb component to match prototype styling
- Shows: folder icon + project name + chevron + entry display ID
- Status badge: "Draft" with lock icon in a small bordered panel

### User Avatars
- Display 3 overlapping avatar circles with initials: "MK" (enzyme), "JS" (flask), "AR" (solvent)
- Hardcoded — no real user data
- Font: mono, 9.5px, with 2px white border for overlap effect

### Metadata Panel (placeholder sections)
- **Metadata**: Owner, Witness, Project, Started, Instrument, Status — all with placeholder values
- **Linked entities**: Section header + placeholder entries with icons
- **Attachments**: Section header + placeholder file entries
- **Activity**: Section header + placeholder activity items
- All section headers use mono, uppercase, tracking-widest text at 10px

### Files to Modify
- **MODIFY**: `frontend/src/App.tsx` — route changes, remove ElnNew import
- **MODIFY**: `frontend/src/pages/ElnDetail.tsx` — major rewrite to 3-column layout
- **MODIFY**: `frontend/src/components/ElnEditor.tsx` — remove embedded mode, paper page, bubble menu
- **DELETE**: `frontend/src/pages/ElnNew.tsx`
- **DELETE**: `frontend/src/workspaces/eln/ElnWorkspace.tsx`
- **DELETE**: `frontend/src/workspaces/eln/ElnDetailCard.tsx`

## Testing Decisions

### What Makes a Good Test
- Test that ElnDetail renders the top toolbar with breadcrumbs and action buttons
- Test that ElnDetail renders the metadata panel at xl breakpoint (use `window.resizeTo` or mock matchMedia)
- Test that ElnEditor no longer accepts or uses `embedded` prop
- Test that the paper-page wrapper is not rendered
- Test that route `/eln/new` renders the editor in new-entry mode
- Remove tests for embedded mode, bubble menu, and paper-page styling

### Modules Under Test
- `ElnDetail.test.tsx` — new 3-column layout, toolbar buttons, breadcrumbs
- `ElnEditor.test.tsx` — remove embedded mode tests, remove bubble menu tests, update for new structure
- `App.test.tsx` — route changes, `/eln/new` behavior

### Prior Art
- Existing Vitest tests (update, don't rewrite from scratch)
- React Testing Library patterns used throughout the codebase

## Out of Scope
- Working breadcrumbs with real folder data (use placeholder path)
- Real status badge logic (always "Draft")
- Working History, Comments, Star, Share, Sign & Witness buttons
- Real user avatars from backend
- Working metadata panel (placeholders only — real data in PRD #5)
- Content area redesign (title, tags, description — that is PRD #4)

## Further Notes

- The console pattern (Master-Detail-Workspace) still exists for Library and LIMS. The ELN page is the first to break out of this pattern into a full-page layout. This is intentional — the ELN editor is the primary work surface and deserves full attention.
- The Share and Sign & Witness buttons are deliberately placed in the top toolbar next to History/Comments (Option C from the grilling session). They will move to the metadata panel when more collaboration features are added.
- The `EditorBubbleMenu` component is removed from ElnEditor but the file itself is not deleted yet — that cleanup happens in PRD #6. If tests import it, those imports should be removed.
- `LibraryConsole.tsx` imports `ElnWorkspace` for the expanded state. This import will break when `ElnWorkspace.tsx` is deleted. For now, the expanded state in Library should navigate to `/eln/:id` instead of rendering an embedded workspace. This change is scoped to PRD #6.
