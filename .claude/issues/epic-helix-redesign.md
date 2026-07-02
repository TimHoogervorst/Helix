## Problem Statement

OpenScience currently uses a horizontal topbar navigation and a single-column ELN editor wrapped in a "paper page" metaphor. The UI feels dated, lacks visual hierarchy, and does not scale to the rich content-block editing experience envisioned for Helix. The application name "OpenScience" needs to be rebranded to "Helix" across all user-facing surfaces.

## Solution

Transform OpenScience into **Helix** — a sidebar-based, Tailwind-styled redesign that matches the prototype at `docs/protoypes/helix-eln-full-guide.html`. The redesign introduces:

1. **Tailwind CSS v4** with semantic design tokens replacing raw CSS variables
2. A **global sidebar** replacing the horizontal topbar, providing persistent navigation and workspace tree
3. A **3-column ELN entry page**: sidebar | centered content (`max-w-3xl`) | metadata panel (288px)
4. **Rich content blocks** in the editor: title with serif styling, tags, description, protocol steps, reagent tables, observations, results with charts, and comments
5. A **metadata panel** with entity linking, attachments, and activity feed
6. **Console page** compatibility with the new sidebar layout

## Design Reference

The canonical design prototype is at `docs/protoypes/helix-eln-full-guide.html`. This is a self-contained HTML file with inlined Tailwind CSS v4 that renders the complete Helix ELN experience. All PRDs under this EPIC should match the visual and interaction design in this prototype.

## Architecture

The redesign is split into **6 sequential PRDs**, each building on the previous:

| # | Issue | PRD | Scope | Depends On |
|---|-------|-----|-------|------------|
| 1 | [#56](https://github.com/TimHoogervorst/OpenScience/issues/56) | Tailwind + Design Tokens + Brand Foundation | CSS infrastructure, token system, "Helix" rename | — |
| 2 | [#57](https://github.com/TimHoogervorst/OpenScience/issues/57) | Global Sidebar Shell | Replace topbar with 256px persistent sidebar | #56 |
| 3 | [#58](https://github.com/TimHoogervorst/OpenScience/issues/58) | ELN Entry Page — 3-Column Layout | Rework ELN detail into sidebar\|content\|metadata layout | #57 |
| 4 | [#59](https://github.com/TimHoogervorst/OpenScience/issues/59) | ELN Content Blocks & Editor Experience | Title serif styling, tags, description, block-based editing | #58 |
| 5 | [#60](https://github.com/TimHoogervorst/OpenScience/issues/60) | Metadata Panel & Entity Linking | Right-side panel with metadata, linked entities, attachments, activity | #58 |
| 6 | [#61](https://github.com/TimHoogervorst/OpenScience/issues/61) | Console Pages & Final Polish | Fix Library/LIMS/Settings for sidebar, remove dead code | #57 |

## Key Technical Decisions

From the grilling session, captured in `docs/helix-redesign-session-summary.md`:

- **CSS**: Tailwind CSS v4 with `@tailwindcss/vite` plugin. Fresh start on `styles.css` — only app-specific styles remain; Tailwind handles utilities.
- **Layout**: `Layout.tsx` = Sidebar + `<Outlet />` only. No topbar. Each page owns its own chrome.
- **Sidebar**: Always visible (256px). No auto-hide. No responsive behavior (future PR).
- **ELN Routes**: Single `/eln/:id` route handles both new and existing entries. Remove `/eln/new`.
- **Embedded Editor**: Remove completely. ELN always renders in full page mode.
- **Light Mode**: This is the new light mode. Dark mode is a separate future PR.
- **Fonts**: System serif for headings. `@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono` already loaded.
- **Brand**: Rename to "Helix" everywhere. No logo icon yet — just the text "Helix" in serif.
- **Search**: Sidebar search is a placeholder (magnifying glass + ⌘K badge, non-functional). Real search in future PR.
- **Tooltips Rule**: Every icon-only button MUST have `title` + `aria-label`.

## Placeholders (non-functional, wired in future PRDs)

| Feature | Placeholder Behavior |
|---------|---------------------|
| Sidebar search | Input with ⌘K badge, no handler |
| Home nav item | Visible but non-functional |
| Workspace tree | Section header + static placeholder text |
| User avatar | "MK" initials, enzyme color, hardcoded name "Dr. Mira Kato" |
| History/Comments/Star buttons | Icon + tooltip "Placeholder — coming soon" |
| Share/Sign & Witness buttons | Icon/text + tooltip "Placeholder — coming soon" |
| Status badge | "Draft" with lock icon, static |
| Tags | Single placeholder chip with tooltip |
| Description | Static placeholder text |
| Autosave indicator | Static "v0.4 · autosaved 2s ago" text |
| Metadata panel values | Placeholder strings |
| Linked entities | Placeholder entries with icons |
| Attachments | Placeholder file entries |
| Activity feed | Static placeholder items |

## Out of Scope (for all PRDs)

- Dark mode / theming
- Responsive/mobile sidebar behavior
- Working sidebar search
- Real workspace tree data
- Real user profiles/avatars
- Working Share, Sign & Witness functionality
- Working History, Comments, Star functionality
- Real tags with CRUD
- Editable description
- AI features ("Ask Helix AI" is placeholder)
- Working activity feed

## Verification

- `npm run build` (tsc + vite build) passes
- `npm test` passes (all Vitest tests)
- Manual smoke test: Library, LIMS, Settings, and ELN editor pages all load
- No "OpenScience" user-facing strings remain
- No dead CSS classes remain
