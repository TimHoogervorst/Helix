## Problem Statement

After implementing the sidebar and 3-column ELN layout, several things need cleanup: the old `styles.css` still contains dead CSS for the removed topbar, paper-page, embedded editor mode, and bubble menu. Console pages (Library, LIMS, Settings) may have layout issues with the new sidebar shell. The `LibraryConsole.tsx` imports the now-deleted `ElnWorkspace`. Search bars that were in the old topbar need to be removed or relocated. The `EditorBubbleMenu` component and its tests need to be deleted. All placeholder buttons need proper tooltip attributes. A final audit must confirm no "OpenScience" strings remain.

## Solution

Systematically remove dead code, fix console page layouts for sidebar compatibility, wire all placeholder tooltips, delete the `EditorBubbleMenu` component, and run full verification. This is the final polish PRD that brings the entire Helix redesign to a clean, shippable state.

## User Stories

1. As a developer, I want dead CSS classes removed from styles.css, so that the stylesheet is maintainable and its purpose is clear.
2. As a developer, I want the EditorBubbleMenu component deleted, so that there is no dead code in the codebase.
3. As a user, I want the Library console to work correctly with the sidebar layout, so that I can browse entries and folders.
4. As a user, I want the LIMS console to work correctly with the sidebar layout, so that I can browse entities.
5. As a user, I want the Settings page to work correctly with the sidebar layout, so that I can configure the application.
6. As a developer, I want all console pages to remove their search bars (previously in the topbar), so that search is not duplicated.
7. As a user, I want all icon-only buttons to have tooltip labels, so that I can understand what each button does on hover.
8. As a developer, I want the Library expanded state to navigate to `/eln/:id` instead of rendering an embedded ElnWorkspace, so that the ELN entry opens as a full page.
9. As a developer, I want `npm run build` and `npm test` to pass with zero failures, so that the codebase is in a clean state.
10. As a user, I want zero "OpenScience" strings anywhere in the UI, so that the rebranding to Helix is complete.

## Implementation Decisions

### Dead CSS Removal from styles.css
Remove all CSS that targets removed components/patterns:
- Old nav/topbar styles (`.nav-left`, `.nav-right`, `.nav-search-bar`, `.nav-search-input-wrap`, etc.)
- Paper-page styles (`.paper-page`, `.eln-full-layout` in its current form)
- Embedded editor styles (`.eln-embedded-toolbar`, `.is-embedded`, `.editor-container.is-embedded`)
- Bubble menu styles (search for `.bubble-menu` or `EditorBubbleMenu`-related selectors)
- Old editor top bar styles (`.editor-top-bar`, `.title-col`, `.actions` — these will be replaced by the new layout)
- Any style targeting elements that no longer exist

Audit approach:
- After removing known dead styles, grep for class names in `.tsx` files to confirm no remaining references
- Remove any CSS class not referenced in any component file

### Delete EditorBubbleMenu
- **DELETE**: `frontend/src/components/EditorBubbleMenu.tsx`
- **DELETE**: `frontend/src/components/__tests__/EditorBubbleMenu.test.tsx`
- Remove any remaining imports of `EditorBubbleMenu` (should already be removed in PRD #3)

### Fix LibraryConsole.tsx
- Remove `ElnWorkspace` import (already deleted in PRD #3)
- The expanded state previously rendered `<ElnWorkspace>` as the workspace panel. Change this to navigate to `/eln/:id` instead:
  - When a user expands an entry in Library, navigate to `/eln/${item.id}` using `useNavigate`
  - Remove the `ElnWorkspace`-related code from the expanded view state
- Verify the Library console renders correctly with the new sidebar layout
- Remove any search bar rendered by LibraryConsole (search was in the old topbar)

### Fix LimsConsole.tsx
- Verify the LIMS console renders correctly with the new sidebar layout
- Remove any search bar rendered at the console level (search was in the old topbar)
- The LIMS console may have its own internal search/filter UI — do NOT remove that, only remove the topbar-style search

### Fix EntityWorkspace.tsx
- Verify the Entity Workspace page renders correctly with the new sidebar layout
- No major changes expected — it should work inside the new Layout's `<Outlet />`

### Fix Settings.tsx
- Verify the Settings page renders correctly with the new sidebar layout
- No major changes expected — it should work inside the new Layout's `<Outlet />`

### Wire Remaining Placeholder Tooltips
Ensure every icon-only button has `title` and `aria-label`:
- Sidebar search: `title="Search coming soon"`
- Home nav button: `title="Home — coming soon"`
- Starred nav button: `title="Starred — coming soon"`
- Inventory nav button: `title="Inventory — coming soon"`
- Workspace tree toggle chevrons: `title="Expand"` / `title="Collapse"`
- All top toolbar buttons: verify they already have tooltips from PRD #3
- Metadata panel buttons (linked entities): `title="Open ${entityName}"`

### Final Verification Checklist
- [ ] `npm run build` (tsc + vite build) passes with zero errors
- [ ] `npm test` (vitest run) passes with all tests green
- [ ] No "OpenScience" string in any `.tsx`, `.ts`, `.css`, `.html`, or `.md` file (except in CHANGELOG/historical references)
- [ ] No import of deleted files (`ElnNew`, `ElnWorkspace`, `ElnDetailCard`, `EditorBubbleMenu`)
- [ ] No dead CSS classes in `styles.css`
- [ ] Manual smoke test: Library page loads at `/library`
- [ ] Manual smoke test: LIMS page loads at `/lims`
- [ ] Manual smoke test: Settings page loads at `/settings`
- [ ] Manual smoke test: ELN editor loads at `/eln/:id`

### Files to Modify
- **MODIFY**: `frontend/src/styles.css` — remove dead code
- **MODIFY**: `frontend/src/console/instances/library/LibraryConsole.tsx` — remove ElnWorkspace, fix expanded state
- **MODIFY**: `frontend/src/console/instances/lims/LimsConsole.tsx` — verify layout, remove search bar
- **MODIFY**: `frontend/src/pages/EntityWorkspace.tsx` — verify sidebar layout works
- **DELETE**: `frontend/src/components/EditorBubbleMenu.tsx`
- **DELETE**: `frontend/src/components/__tests__/EditorBubbleMenu.test.tsx`

## Testing Decisions

### What Makes a Good Test
- Test that Library expanded state navigates to `/eln/:id` instead of rendering ElnWorkspace
- Test that Library console renders without errors
- Test that LIMS console renders without errors
- Test that Settings page renders without errors
- Test that all placeholder tooltips have `title` and `aria-label` attributes
- Test that deleted components are no longer importable (TypeScript will catch this)
- Test that no "OpenScience" strings leak into rendered output

### Modules Under Test
- `LibraryConsole.test.tsx` — update for removed ElnWorkspace, verify expanded state
- `LimsConsole.test.tsx` — update for removed search bar
- `Layout.test.tsx` — verify no "OpenScience" strings, verify tooltips
- `ElnDetail.test.tsx` — verify tooltip attributes on action buttons
- All existing tests — must pass without modification (except those updated above)

### Prior Art
- Existing test patterns for each console page
- Existing Vitest + React Testing Library setup

## Out of Scope
- Responsive/mobile sidebar behavior
- Dark mode
- Any new features
- Performance optimization
- Accessibility audit beyond tooltip attributes
- Browser compatibility testing beyond what Vite targets

## Further Notes

- This is the final PRD in the Helix EPIC. After this, the codebase should be in a clean, shippable state with all placeholder features clearly marked.
- The `styles.css` file should be significantly smaller after dead code removal — primarily containing only ProseMirror typography styles and any app-specific styles that cannot be expressed as Tailwind utilities.
- Console pages (Library, LIMS) may have minor layout issues due to the sidebar taking 256px of horizontal space. These are acceptable for now — the consoles will get their own redesign in a future EPIC.
- The search functionality that was in the old topbar is intentionally removed without replacement. The sidebar search placeholder indicates where search will be added in a future PRD. Console-level search (if any) should be handled within each console page.
- If `ElnDetailCard.tsx` was not deleted in PRD #3, delete it here.
