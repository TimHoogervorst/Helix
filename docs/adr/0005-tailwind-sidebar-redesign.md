# ADR-0005: Tailwind CSS Adoption and Sidebar-Based Layout

> Date: 2026-07-02
> Status: Accepted

---

## Context

The application currently uses hand-written CSS (~2800 lines in `styles.css`) with CSS custom properties and BEM-style class names. The UI features a horizontal top navigation bar (`Layout.tsx`) containing the brand name, Library/LIMS links, in-page search bars, and a settings gear.

A high-fidelity prototype at `docs/protoypes/helix-eln-full-guide.html` demonstrates the target design for the ELN entry editor. The prototype uses Tailwind CSS utility classes throughout and features a three-column layout: a persistent 256px sidebar (navigation + workspace tree), a centered content column, and a 288px metadata panel.

The current "paper page" ELN editor with embedded/standalone dual-mode rendering does not match the prototype's layout or visual design.

## Decision

We will adopt Tailwind CSS and restructure the layout around a persistent global sidebar. The redesign will be implemented in five sequential PRs:

1. **Tailwind infrastructure + design tokens** — Install Tailwind, define semantic color tokens matching the prototype (`background`, `foreground`, `border`, `hairline`, `surface`, `panel`, `muted`, `muted-foreground`, `primary`, `accent`, `enzyme`, `flask`, `solvent`, `warn`)
2. **Global sidebar shell** — Replace `Layout.tsx` topbar with 256px sidebar. Rename OpenScience → Helix throughout.
3. **ELN page layout** — New top toolbar, main content area, right metadata panel (all placeholders except breadcrumbs and Save/Edit/Delete)
4. **ELN content rework** — Inline title, metadata line, description, tag placeholders, ProseMirror typography restyle
5. **Cleanup** — Remove dead CSS, wire remaining placeholders, ensure console pages work

Specific architectural choices:
- The **sidebar** is always visible at 256px (no collapse/auto-hide in this iteration)
- **Layout.tsx** renders only sidebar + `<Outlet />` — each page owns its chrome
- The **embedded editor mode** (`ElnEditor` `embedded` prop, `ElnWorkspace.tsx`) is removed
- The **formatting toolbar** (Text/Heading/Steps/Table/etc.) and **bubble menu** are removed
- **Single ELN route** `/eln/:id` handles both new and existing entries; `ElnNew.tsx` is removed
- The exiting **styles.css** will be replaced with app-specific component styles only; Tailwind covers utilities
- All action buttons except Save/Edit/Delete render with placeholder tooltips
- The metadata panel (Metadata, Linked Entities, Attachments, Activity), workspace tree, tags, description, user avatars, and search bar are all placeholders
- Title remains a controlled `<input>` styled to match the prototype's serif heading

## Alternatives Considered

### Keep pure CSS (rejected)
We could extract the prototype's design tokens into CSS custom properties and write semantic class names. This matches the existing codebase idiom and avoids a build-tool dependency. However, the prototype is already written in Tailwind, the design system maps cleanly to a Tailwind config, and translating utility classes to hand-written CSS is more labor-intensive. Given the scope of the visual redesign, Tailwind accelerates iteration.

### Adopt Tailwind but keep the topbar (rejected)
We could add Tailwind without restructuring the layout. This would avoid breaking the Entity Workspace and console pages. However, the sidebar is central to the prototype's design — without it, the ELN editor doesn't match the target experience. Accepting temporary breakage in non-ELN pages is preferable to shipping a half-finished layout that must be restructured again later.

### Gradual CSS migration (rejected)
We could keep the existing `styles.css` and add Tailwind on top, removing redundant styles incrementally. This is the safest option — zero regression risk. However, the old nav/topbar/paper-page styles would become dead code immediately and the CSS file would grow larger from the Tailwind additions. Starting fresh forces a clean break and avoids accumulating orphaned styles.

## Consequences

- **Positive:** The ELN editor matches the prototype's visual design and layout exactly
- **Positive:** The semantic color tokens (`enzyme`, `flask`, `solvent`, `warn`) are defined once and reused everywhere — dark mode theming becomes a single-PR change to the token values
- **Positive:** Removing the embedded editor mode and `ElnNew.tsx` simplifies the codebase (fewer rendering paths, fewer components)
- **Positive:** The sidebar as global shell provides a single, canonical navigation surface — no more per-page search bars or inconsistent chrome
- **Negative:** Tailwind adds a build-time dependency and new tooling (PostCSS/Tailwind Vite plugin)
- **Negative:** The Entity Workspace and Library LIMS console pages may break temporarily until they're adapted to the new shell (PRs 3-5)
- **Negative:** The formatting toolbar and block handles are removed entirely — users lose inline formatting controls until they're rebuilt in a follow-up PR
- **Negative:** Replacing `styles.css` means existing components not yet touched by the redesign will lose their styling until ported
