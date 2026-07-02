# Helix UI Redesign — Session Summary

> Generated 2026-07-02. Captures every architectural decision from the grilling session.
> Use this to continue work in a fresh Claude Code session.

---

## TL;DR

Transform OpenScience into **Helix** — a sidebar-based, Tailwind-styled redesign matching the prototype at `docs/protoypes/helix-eln-full-guide.html`. Split into 5 sequential PRs, all branches pushed, all draft PRs created on GitHub.

---

## Grilling Q&A — All 30 Questions

### Q1: CSS framework?
**A:** Adopt Tailwind CSS v4 with `@tailwindcss/vite` plugin.

### Q2: Dark or light mode?
**A:** This is the new **light mode**. Dark mode will come in a separate theming PR later.

### Q3: Sidebar scope — global or ELN-only?
**A:** Sidebar is the **new global shell** — replaces topbar everywhere. The search bar inside Entity Workspace is removed; the sidebar search will eventually handle it (placeholder for now).

### Q4: Sidebar visibility — always or auto-hide?
**A:** Always visible for now (testing at full screen). Auto-hiding and responsive behavior in another PR.

### Q5: Layout structure?
**A:** **Option B** — Layout.tsx = Sidebar + `<Outlet />` only. No topbar. Each page owns its own chrome (toolbars, panels).

### Q6: Scope — one PR or split?
**A:** **Full rework, split into 5 PRs.**

### Q7: Workspace tree in sidebar?
**A:** Just the "Workspace" text + placeholder underneath. Will fill in later.

### Q8: Metadata panel content?
**A:** Placeholders for now. Section headers with placeholder lines.

### Q9: ELN detail page elements?
- Breadcrumbs: rework the existing one
- Status badge: placeholder
- Action buttons (Share, Sign & Witness, History, Comments, Star): make them, but with tooltip "placeholder"
- Divider/Text heading steps: **remove**
- User avatars: placeholder for now
- Share button: tooltip "placeholder"
- Sign & Witness: tooltip "placeholder"

### Q10: Metadata panel — where do Share/Sign&Witness go?
**A:** **Option C** — put them on the top bar next to History/Comments. They'll move later when more features are added.

### Q11: User avatar initials?
**A:** **Option A** — use "TH" as hardcoded value.

### Q12: Where to put the metadata buttons?
**A:** Top bar, next to the History/Comments button.

### Q13: Tags section?
**A:** Add a section with a placeholder tag chip. Real tags in another PR.

### Q14: Formatting toolbar?
**A:** **Remove it.** Push the Entry editor content up.

### Q15: Metadata line data?
**A:** **Option A** — use real data (display_id, dates).

### Q16: Title implementation?
**A:** **Option A** — stays as controlled `<input>`, styled to look like prototype.

### Q17: Description field?
**A:** **Option A** — placeholder description text for now.

### Q18: ProseMirror typography?
**A:** **Option A** — full restyle: serif headings, proper spacing.

### Q19: Sidebar search?
**A:** Placeholder for now. Real search in another PR.

### Q20: Logo?
**A:** **Option C** — no logo icon for now, just the "Helix" rename text.

### Q21: Fonts?
**A:** Use system serif font stack for headings (no custom serif font loaded yet). Already have `@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono`.

### Q22 (correction): CSS approach?
**A:** **Option C** — fresh start on `styles.css`. Only app-specific styles remain; Tailwind handles utilities.

### Q23: Console pages (Library, LIMS, Settings)?
**A:** **Option A** — they get the sidebar "for free" via Layout.tsx. Breakage is acceptable for now.

### Q24: Logo icon?
**A:** **Option B** — no logo icon for now.

### Q25: Embedded editor mode?
**A:** **Option A** — remove embedded mode entirely.

### Q26: ELN routes?
**A:** **Option A** — single `/eln/:id` route handles both new and existing entries.

### Q27: Sidebar sub-label?
**A:** **Option C** — no sub-label.

### Q28: Test coverage?
**A:** **Option C** — full test coverage matching existing Vitest patterns.

### Q29: Sidebar navigation order?
**A:** Home (placeholder), Library, LIMS, Settings — matching the prototype.

### Q30: Confirmed approach?
**A:** Yes, this works!

---

## 5-PR Sequence

| PR | Issue | Branch | Scope | Depends On |
|----|-------|--------|-------|------------|
| [#46](https://github.com/TimHoogervorst/OpenScience/pull/46) | [#44](https://github.com/TimHoogervorst/OpenScience/issues/44) | `pr/1-tailwind-infra-tokens` | Tailwind CSS + Helix Design Tokens | — |
| [#47](https://github.com/TimHoogervorst/OpenScience/pull/47) | [#51](https://github.com/TimHoogervorst/OpenScience/issues/51) | `pr/2-sidebar-shell-rename` | Sidebar Shell + Helix Rename | #1 |
| [#48](https://github.com/TimHoogervorst/OpenScience/pull/48) | [#52](https://github.com/TimHoogervorst/OpenScience/issues/52) | `pr/3-eln-page-layout` | ELN Page Layout | #2 |
| [#49](https://github.com/TimHoogervorst/OpenScience/pull/49) | [#53](https://github.com/TimHoogervorst/OpenScience/issues/53) | `pr/4-eln-content-rework` | ELN Content Rework | #3 |
| [#50](https://github.com/TimHoogervorst/OpenScience/pull/50) | [#54](https://github.com/TimHoogervorst/OpenScience/issues/54) | `pr/5-cleanup` | Cleanup & Wire Placeholders | #4 |

All branches are pushed. All PRs are **draft**. All issues link back to parent [#44](https://github.com/TimHoogervorst/OpenScience/issues/44).

---

## PR #1: Tailwind CSS + Helix Design Tokens ✅ COMPLETED

### What was done
- Installed `tailwindcss` v4 + `@tailwindcss/vite` v4 as dependencies
- Added `tailwindcss()` to Vite plugin array in `vite.config.ts`
- Rewrote `frontend/src/styles.css` from ~2800 lines to ~500 lines with Tailwind
- Defined semantic design tokens in `@theme` block
- Renamed package `openscience-frontend` → `helix-frontend` in `package.json`
- Changed `<title>OpenScience</title>` → `<title>Helix</title>` in `index.html`
- Updated `CONTEXT.md` with Helix rebranding and Global Sidebar term

### Design tokens defined
```css
@theme {
  --font-sans: "Inter Variable", ...;
  --font-mono: "JetBrains Mono Variable", ...;
  --font-serif: ui-serif, Georgia, Cambria, ...;

  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-border: #e2e8f0;
  --color-hairline: #f1f5f9;
  --color-surface: #f8fafc;
  --color-panel: #ffffff;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;

  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;

  --color-accent: #eff6ff;
  --color-accent-foreground: #1e40af;

  --color-enzyme: #ecfdf5;
  --color-enzyme-foreground: #065f46;
  --color-flask: #eff6ff;
  --color-flask-foreground: #1e40af;
  --color-solvent: #fefce8;
  --color-solvent-foreground: #854d0e;
  --color-warn: #fef2f2;
  --color-warn-foreground: #991b1b;
  --color-success: #f0fdf4;
  --color-success-foreground: #166534;

  --sidebar-width: 256px;
}
```

### Verification
- TypeScript compiles clean: `tsc` ✅
- All 421 existing tests pass: `vitest run` ✅

---

## PR #2: Sidebar Shell + Helix Rename

### Scope
Replace the horizontal topbar in `Layout.tsx` with a persistent 256px global sidebar. Rename all occurrences of OpenScience → Helix everywhere.

### Implementation plan

**`frontend/src/components/Layout.tsx`:**
- Remove entire `<nav>` topbar element
- Replace with `<aside>` sidebar (256px, `w-64`, `border-r border-hairline bg-surface/60`)
- Sidebar contents (top to bottom):
  1. Helix brand: text "Helix" in serif font + "ELN · v2.4" subtitle
  2. Search placeholder: input with magnifying glass icon + `⌘K` badge (non-functional)
  3. Nav items: Home (House icon, placeholder), Library (real link), LIMS (real link), Settings (real link)
  4. "Workspace" section header (mono, uppercase, tracking-widest)
  5. Workspace tree placeholder area
  6. User avatar: "TH" initials in enzyme-colored circle, name + subtitle below
- Layout becomes: `<ReferenceProvider><div className="flex min-h-screen"><Sidebar /><main><Outlet /></main></div></ReferenceProvider>`
- Remove `useSearchParams`, `useEffect` for entity types, search form handlers, viewState-dependent search bar logic

**Rename sweep:**
- `App.tsx`: no "OpenScience" string (already handled by Layout)
- `Layout.tsx`: brand text "OpenScience" → "Helix"
- Any other user-facing strings containing "OpenScience"
- `UBIQUITOUS_LANGUAGE.md`: update OpenScience references to Helix
- `CONTEXT.md`: update any remaining OpenScience references

**Files to create/modify:**
- MODIFY: `frontend/src/components/Layout.tsx` (major rewrite)
- MODIFY: `UBIQUITOUS_LANGUAGE.md` (rename)
- POSSIBLY MODIFY: any other files with "OpenScience" strings

**Test seams:**
- Test Layout renders sidebar with nav items
- Test Layout no longer renders old nav/links
- Test sidebar contains "Helix" brand text
- Test user avatar placeholder renders "TH"
- Verify no "OpenScience" string in any rendered component

### Out of scope
- Working search in sidebar
- Real workspace tree
- Real user data/avatars
- Dark mode
- Responsive/mobile behavior
- Logo icon

---

## PR #3: ELN Page Layout

### Scope
Rework the ELN detail page into the 3-column layout: sidebar (256px, from PR #2) | centered content (`max-w-3xl`) | metadata panel (288px, `xl` breakpoint only). Remove the paper page and embedded editor mode.

### Implementation plan

**Route changes in `frontend/src/App.tsx`:**
- `/eln/new` → redirect to `/eln/new` OR handle via `entryId` prop being undefined
- `/eln/:id` → `ElnDetail` (handles both new and existing)
- Remove `ElnNew` import and route

**Delete files:**
- `frontend/src/pages/ElnNew.tsx` — absorbed into `/eln/:id`
- `frontend/src/workspaces/eln/ElnWorkspace.tsx` — embedded mode removed

**`frontend/src/pages/ElnDetail.tsx`:**
- Rework to render **full 3-column layout** instead of wrapping in `ConsoleWorkspacePanel`
- Layout structure:
  ```
  <div className="flex min-w-0 flex-1 flex-col">
    <!-- Top toolbar -->
    <div className="flex items-center justify-between border-b border-hairline px-6 py-2.5">
      <Breadcrumbs ... />
      <div className="flex items-center gap-1">
        <!-- Action buttons with placeholder tooltips -->
        <HistoryButton /> <CommentsButton /> <StarButton />
        <div className="separator" />
        <UserAvatars />
        <ShareButton /> <SignWitnessButton />
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
        <!-- Metadata panel (placeholders) -->
      </aside>
    </div>
  </div>
  ```

**`frontend/src/components/ElnEditor.tsx`:**
- Remove `embedded` prop entirely
- Remove all embedded-mode conditional rendering
- Remove `paper-page` wrapper div
- Simplify to: always renders in "full" mode
- Remove `EditorBubbleMenu` import and usage
- Remove `initialFolderId` prop (folder selector for new entries handled differently)

**Top toolbar buttons (all placeholder tooltips):**
| Button | Icon | tooltip title |
|--------|------|---------------|
| History | `History` | "Placeholder — version history coming soon" |
| Comments | `MessageSquare` | "Placeholder — comments coming soon" |
| Star | `Star` | "Placeholder — bookmark coming soon" |
| Share | `Share2` | "Placeholder — sharing coming soon" |
| Sign & Witness | `CircleCheck` | "Placeholder — sign & witness coming soon" |

**User avatars (placeholder):**
- Display single avatar circle with "TH" initials
- Enzyme background color

**Metadata panel sections (all placeholder):**
- **Metadata**: Owner, Witness, Project, Started, Instrument, Status — all placeholder values
- **Linked entities**: Section header + placeholder empty state
- **Attachments**: Section header + placeholder empty state
- **Activity**: Section header + placeholder empty state

**Files to create/modify:**
- MODIFY: `frontend/src/App.tsx` (route changes)
- MODIFY: `frontend/src/pages/ElnDetail.tsx` (major rewrite to 3-column)
- MODIFY: `frontend/src/components/ElnEditor.tsx` (remove embedded mode, paper page, bubble menu)
- DELETE: `frontend/src/pages/ElnNew.tsx`
- DELETE: `frontend/src/workspaces/eln/ElnWorkspace.tsx`
- UPDATE: `LibraryConsole.tsx` (remove ElnWorkspace import — expanded state navigates to `/eln/:id` instead)

**Test updates:**
- Remove embedded mode tests from `ElnEditor.test.tsx`
- Remove bubble menu tests from `ElnEditor.test.tsx` (delete `EditorBubbleMenu.test.tsx`)
- Update tests for new ElnDetail layout
- Test metadata panel renders at xl breakpoint
- Test route `/eln/new` redirects correctly

### Out of scope
- Working metadata (real data)
- Linked entities with real data
- Real attachments
- Activity feed
- Share/Sign & Witness functionality

---

## PR #4: ELN Content Rework

### Scope
Rework the ELN editor's content area: inline title input with serif styling, tags placeholder section, description placeholder, full ProseMirror typography restyle.

### Implementation plan

**`frontend/src/components/ElnEditor.tsx` content area:**
```
┌─────────────────────────────────────┐
│ [Metadata line: EXP-0284 · Created  │  ← real data
│  2026-06-28 · v0.4 · autosaved]     │
├─────────────────────────────────────┤
│ [Title input — serif, 42px]         │  ← controlled <input>
├─────────────────────────────────────┤
│ [Description — muted, 15px]         │  ← static placeholder text
├─────────────────────────────────────┤
│ [Tag chips — placeholder]           │  ← single chip with tooltip
├─────────────────────────────────────┤
│ ─── hairline divider ───           │
├─────────────────────────────────────┤
│                                     │
│ [ProseMirror editor content]        │  ← full typography restyle
│                                     │
└─────────────────────────────────────┘
```

**Title:**
- Controlled `<input>` — no behavior change, only styling
- Font: `font-serif text-[42px] font-semibold leading-[1.05] tracking-tight`
- Placeholder: "Untitled"
- AutoFocus when creating new entry

**Description:**
- Static placeholder: "Third iteration of the sgRNA screen..."
- Styled: `text-[15px] leading-relaxed text-muted-foreground max-w-2xl`
- Will be made editable in a future PR

**Tags section:**
- Single placeholder chip: `<span className="chip bg-enzyme text-enzyme-foreground">SpCas9-HF1</span>`
- Chip has a tooltip: "Placeholder — tags coming soon"
- Section appears below description, above the divider

**Metadata line:**
- Real data from `entry` object: `display_id`, `created_at`, `updated_at`
- Placeholder for autosave: "v0.4 · autosaved 2s ago" (static text)
- Styled: `text-[11px] font-mono uppercase tracking-widest text-muted-foreground`

**ProseMirror typography (already partially done in PR #1 — verify/extend):**
- `h1`: serif, 2.625rem, font-semibold, tight leading
- `h2`: serif, 1.5rem, font-semibold
- `h3`: sans, 1.125rem, font-semibold
- `p`: 1rem, 1.7 line-height
- `blockquote`: left border, italic, muted color
- `code`: mono, muted background, rounded
- `pre`: dark background, light text, rounded
- `ul`/`ol`: proper padding
- `li`: bottom margin

**Files to modify:**
- MODIFY: `frontend/src/components/ElnEditor.tsx` (restructure content area)
- MODIFY: `frontend/src/styles.css` (verify/extend ProseMirror styles)

**Test updates:**
- Update ElnEditor tests: title input renders with serif class
- Test metadata line shows real entry data
- Test tags placeholder chip renders
- Test description placeholder renders
- Test ProseMirror content renders (existing test pattern)

### Out of scope
- Editable description
- Real tags with CRUD
- Autosave functionality
- AI features

---

## PR #5: Cleanup & Wire Remaining Placeholders

### Scope
Remove dead CSS, wire remaining placeholder buttons/tooltips, fix console pages that broke during the sidebar migration, final polish.

### Implementation plan

**Dead CSS removal from `styles.css`:**
- Remove any old nav/topbar styles (verify none remain)
- Remove paper-page styles (`.paper-page`, etc.)
- Remove embedded editor styles (`.eln-embedded-toolbar`, `.is-embedded`, etc.)
- Remove bubble menu styles
- Remove any formatting toolbar styles
- Audit: grep for unused CSS class names

**Wire remaining placeholders:**
- All icon-only buttons must have `title` + `aria-label` (the Tooltip Rule)
- Search placeholder in sidebar: `title="Search coming soon"`
- Workspace tree area: some indication it's a placeholder
- Metadata panel: ensure all section headers + placeholder lines render

**Fix console pages:**
- `LibraryConsole.tsx`: remove `ElnWorkspace` import — expanded state should navigate to `/eln/:id` instead
- `LimsConsole.tsx`: verify sidebar layout works, search bar removed from topbar (now in sidebar placeholder)
- `EntityWorkspace.tsx`: verify it works with new Layout
- `Settings.tsx`: verify it works with new Layout

**Update tests:**
- `LibraryConsole.test.tsx`: update for removed ElnWorkspace
- `LimsConsole.test.tsx`: update for removed search bar
- `ConsoleWorkspacePanel.test.tsx`: may need updates
- `ElnEditor.test.tsx`: final verification all tests pass
- `EditorBubbleMenu.test.tsx`: DELETE (if not already deleted in PR #3)

**Files to modify:**
- MODIFY: `frontend/src/styles.css` (remove dead code)
- MODIFY: `frontend/src/console/instances/library/LibraryConsole.tsx` (remove ElnWorkspace)
- MODIFY: `frontend/src/console/instances/lims/LimsConsole.tsx` (if needed)
- MODIFY: `frontend/src/pages/EntityWorkspace.tsx` (if needed)
- DELETE: `frontend/src/components/EditorBubbleMenu.tsx` (if not already deleted)
- DELETE: `frontend/src/components/__tests__/EditorBubbleMenu.test.tsx`

**Final verification:**
- `npm run build` (tsc + vite build) passes
- `npm test` passes (all 421+ tests)
- Manual smoke test: Library page loads, LIMS page loads, ELN editor loads
- No "OpenScience" strings anywhere
- No dead CSS classes

### Out of scope
- Dark mode
- Responsive/mobile sidebar
- Any new features

---

## Key Files Reference

| File | Role | Changed In |
|------|------|------------|
| `frontend/src/styles.css` | Design tokens, app styles | PR #1 ✅, PR #4, PR #5 |
| `frontend/vite.config.ts` | Tailwind plugin | PR #1 ✅ |
| `frontend/package.json` | Dependencies, package name | PR #1 ✅ |
| `frontend/index.html` | Page title | PR #1 ✅ |
| `CONTEXT.md` | Domain glossary | PR #1 ✅ |
| `frontend/src/App.tsx` | Routes | PR #3 |
| `frontend/src/components/Layout.tsx` | App shell (sidebar) | PR #2 |
| `frontend/src/components/ElnEditor.tsx` | ELN editor | PR #3, PR #4 |
| `frontend/src/pages/ElnDetail.tsx` | ELN page (3-column) | PR #3 |
| `frontend/src/pages/ElnNew.tsx` | New entry page | DELETE in PR #3 |
| `frontend/src/workspaces/eln/ElnWorkspace.tsx` | Embedded workspace | DELETE in PR #3 |
| `frontend/src/components/EditorBubbleMenu.tsx` | Formatting toolbar | DELETE in PR #3 or #5 |
| `frontend/src/console/instances/library/LibraryConsole.tsx` | Library console | PR #5 |
| `frontend/src/console/instances/lims/LimsConsole.tsx` | LIMS console | PR #5 |
| `frontend/src/pages/EntityWorkspace.tsx` | Entity workspace | PR #5 |
| `UBIQUITOUS_LANGUAGE.md` | Ubiquitous language | PR #2 |
| `docs/adr/0005-tailwind-sidebar-redesign.md` | Architecture decision | PR #1 ✅ |
| `docs/protoypes/helix-eln-full-guide.html` | Design prototype | Reference only |

---

## Design Token Reference

```
background       #ffffff    — page background
foreground       #0f172a    — primary text
border           #e2e8f0    — default borders
hairline         #f1f5f9    — subtle separators
surface          #f8fafc    — elevated surfaces
panel            #ffffff    — card/panel backgrounds
muted            #f1f5f9    — muted backgrounds
muted-foreground #64748b    — secondary text

primary          #2563eb    — primary action color
primary-fg       #ffffff    — text on primary

accent           #eff6ff    — accent background
accent-fg        #1e40af    — accent text

enzyme           #ecfdf5    — green tag bg
enzyme-fg        #065f46    — green tag text
flask            #eff6ff    — blue tag bg
flask-fg         #1e40af    — blue tag text
solvent          #fefce8    — amber tag bg
solvent-fg       #854d0e    — amber tag text
warn             #fef2f2    — red tag bg
warn-fg          #991b1b    — red tag text
success          #f0fdf4    — green status bg
success-fg       #166534    — green status text
```

---

## Placeholder Summary

Everything below is a **placeholder** (non-functional, to be filled in future PRs):

| Feature | Placeholder Behavior |
|---------|---------------------|
| Sidebar search | Magnifying glass + "Search entries…" + `⌘K` badge, no handler |
| Home nav item | Visible but non-functional |
| Workspace tree | Section header "Workspace" + static placeholder text |
| User avatar | "TH" initials, enzyme color, hardcoded name "Dr. Mira Kato" |
| History button | Icon + tooltip "Placeholder" |
| Comments button | Icon + tooltip "Placeholder" |
| Star button | Icon + tooltip "Placeholder" |
| Share button | Icon + tooltip "Placeholder" |
| Sign & Witness button | Icon + tooltip "Placeholder" |
| Status badge | "Draft" with lock icon, static |
| Tags | Single placeholder chip with tooltip |
| Description | Static placeholder text |
| Autosave indicator | Static "v0.4 · autosaved 2s ago" text |
| Metadata panel | Section headers + placeholder lines |
| Linked entities | Section header + empty state |
| Attachments | Section header + empty state |
| Activity feed | Section header + empty state |

---

## How to Continue in a Fresh Session

1. Open this repo in Claude Code
2. Point Claude to this file: `docs/helix-redesign-session-summary.md`
3. Say something like: "Continue the Helix redesign. Start on PR #2. Read docs/helix-redesign-session-summary.md for full context."
4. Work through PRs #2 → #5 sequentially, merging each before starting the next
