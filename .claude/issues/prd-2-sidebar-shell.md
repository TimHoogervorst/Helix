## Problem Statement

The application currently uses a horizontal topbar (`<nav>`) for navigation, which wastes vertical space, does not scale to additional navigation items, and provides no place for the workspace tree or user context. The navigation links (Library, LIMS, Settings) are bare text links with no visual hierarchy. There is no persistent user context or workspace awareness. The app still displays "OpenScience" in the navigation.

## Solution

Replace the horizontal topbar with a persistent 256px global sidebar that serves as the new app shell. The sidebar provides branded identity ("Helix"), navigation, workspace awareness, and user context — all always visible. The Layout component simplifies to `Sidebar + <Outlet />` only.

## User Stories

1. As a user, I want a persistent sidebar with navigation links, so that I can navigate between Library, LIMS, and Settings from anywhere in the app.
2. As a user, I want to see the "Helix" brand name in the sidebar, so that I know which application I am using.
3. As a user, I want a workspace tree section in the sidebar, so that I can see my project structure at a glance (placeholder for now).
4. As a user, I want to see my user avatar and name at the bottom of the sidebar, so that I know which account I am using.
5. As a user, I want a search input visible in the sidebar, so that I know search will be available in the future (placeholder for now).
6. As a developer, I want the Layout component simplified to Sidebar + Outlet only, so that each page owns its own chrome and toolbars.
7. As a user, I want the horizontal topbar removed entirely, so that I have more vertical space for content.
8. As a user on the Library page, I want the sidebar still visible when browsing entries, so that navigation is always accessible.
9. As a user on the LIMS page, I want the sidebar still visible when viewing entities, so that navigation is always accessible.
10. As a user on the Settings page, I want the sidebar still visible, so that I can navigate away without using the browser back button.

## Implementation Decisions

### Layout Restructure
The new `Layout.tsx` wraps the app in a flex row:
```
<ReferenceProvider>
  <div className="flex min-h-screen">
    <aside className="w-64 shrink-0 border-r border-hairline bg-surface/60">
      <!-- Sidebar content -->
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <Outlet />
    </main>
  </div>
</ReferenceProvider>
```

### Sidebar Contents (top to bottom)

1. **Brand block**: DNA helix icon in a primary-colored square + "Helix" in serif font + "ELN · v2.4" subtitle in mono uppercase
2. **Search placeholder**: Input with magnifying glass icon, "Search entries…" placeholder text, and `⌘K` badge on the right. Non-functional — no event handlers.
3. **Navigation items**:
   - Home: House icon + "Home" text (placeholder, non-functional)
   - Starred: Star icon + "Starred" text (placeholder, non-functional)
   - Inventory: Beaker icon + "Inventory" text (placeholder, non-functional)
   All nav items use `text-muted-foreground` with `hover:bg-muted` hover state. Real navigation links come in a future PRD.
4. **"Workspace" section** header: Mono, uppercase, tracking-widest text label
5. **Workspace tree area**: Static placeholder text showing a simple tree structure
6. **User avatar** (bottom, separated by border-t): "MK" initials in enzyme-colored circle, "Dr. Mira Kato" name, "Molecular Bio · Lab 3B" subtitle

### Removal from Layout
- Remove entire `<nav>` topbar element
- Remove all search form handlers (`handleSearch`, `handleLibrarySearch`)
- Remove `useSearchParams`, `useEffect` for entity types, viewState-dependent search bar logic
- Remove `Link` imports for old nav items (replaced by sidebar buttons)
- Keep `ReferenceProvider` wrapper

### The Tooltip Rule
Every icon-only button in the sidebar MUST have both `title` and `aria-label` attributes:
- `<button title="Search coming soon" aria-label="Search">`

### Files to Create/Modify
- **MODIFY**: `frontend/src/components/Layout.tsx` — major rewrite from topbar to sidebar
- **MODIFY**: `UBIQUITOUS_LANGUAGE.md` — update OpenScience references to Helix
- **MODIFY**: `CONTEXT.md` — update any remaining OpenScience references

## Testing Decisions

### What Makes a Good Test
- Test that the sidebar renders with all required sections (brand, search, nav, workspace, user)
- Test that the old topbar `<nav>` element no longer exists
- Test that no "OpenScience" string appears in any rendered component
- Test that sidebar contains "Helix" brand text
- Test that the user avatar placeholder renders "MK" initials
- Test that navigation items are rendered (even if placeholder)
- Do NOT test visual appearance (colors, sizes) — those are snapshot-appropriate

### Modules Under Test
- `Layout.test.tsx` — sidebar presence, nav removal, brand text
- Any test file that references "OpenScience" — update assertions

### Prior Art
- Existing `Layout.test.tsx` patterns
- Existing Vitest + React Testing Library setup

## Out of Scope
- Working search functionality in sidebar
- Real workspace tree data from the backend
- Real user data/avatars from the backend
- Dark mode sidebar variant
- Responsive/mobile sidebar behavior (auto-hide, hamburger menu)
- Logo icon design
- Functional Home, Starred, Inventory navigation
- Real Library/LIMS/Settings links (placeholders acceptable)

## Further Notes

- The sidebar is always visible at 256px width. This is intentional for the initial implementation. Auto-hiding and responsive breakpoints will be added in a future PRD.
- The search bar is a deliberate placeholder. The existing search logic in `Layout.tsx` (entity type fetching, search form handlers) should be removed — each console page will eventually have its own search, triggered from the sidebar search when it is wired up.
- The workspace tree area is intentionally empty. The real workspace tree will be implemented in a future PRD that wires it to actual folder/entry data.
- All console pages (Library, LIMS, Settings) get the sidebar "for free" because they render inside `<Outlet />` within Layout. Some breakage of their internal layouts is expected and will be fixed in PRD #6 (Console Pages & Polish).
- The Lucide icon library is already available in the project. Use it for all sidebar icons: `Dna` (brand), `Search` (search), `House` (home), `Star` (starred), `Beaker` (inventory), `ChevronRight` (tree items).
