## Problem Statement

The codebase uses raw CSS variables (`--blue-600`, `--gray-200`, etc.) and hand-written utility classes throughout `styles.css` (~2800 lines). There is no design token system, no consistent spacing scale, and no typographic hierarchy. The app is still branded as "OpenScience" in the page title, navigation, and documentation. Before any UI work can begin, the project needs a Tailwind CSS v4 foundation with semantic Helix design tokens and a complete rename sweep.

## Solution

Install Tailwind CSS v4 with the `@tailwindcss/vite` plugin, define semantic design tokens in a `@theme` block within `styles.css`, strip all utility classes that Tailwind now handles, and rename every user-facing "OpenScience" string to "Helix". This PRD is pure infrastructure — no visible UI changes beyond the page title and brand strings.

## User Stories

1. As a developer, I want Tailwind CSS v4 integrated into the Vite build pipeline, so that I can use utility classes throughout the codebase without importing additional CSS.
2. As a developer, I want semantic design tokens (`--color-primary`, `--font-sans`, `--sidebar-width`, etc.) defined in one place, so that all components reference the same visual language.
3. As a developer, I want the CSS reset, base styles, and utility concerns handled by Tailwind, so that `styles.css` only contains app-specific, domain-level styles.
4. As a developer, I want the font stack to include Inter (sans), JetBrains Mono (mono), and a system serif stack, so that typography matches the Helix prototype.
5. As a user, I want to see "Helix" in the browser tab title instead of "OpenScience", so that the branding is consistent.
6. As a developer, I want the npm package renamed from `openscience-frontend` to `helix-frontend`, so that the package name matches the product.
7. As a developer, I want all existing tests to pass after the infrastructure changes, so that nothing is broken.
8. As a developer, I want the domain glossary and context docs updated with Helix branding, so that new contributors understand the product name.

## Implementation Decisions

### Tailwind CSS v4 Integration
- Install `tailwindcss` v4 and `@tailwindcss/vite` v4 as dependencies (not devDependencies — Vite plugin must be available at runtime)
- Add `tailwindcss()` to the Vite plugin array in `vite.config.ts`
- Tailwind v4 uses `@import "tailwindcss"` in CSS (no `tailwind.config.js` needed)

### Design Token System
Define all tokens in a `@theme` block within `styles.css`. Tokens include:

**Fonts:**
- `--font-sans`: "Inter Variable", Inter, system-ui sans-serif stack
- `--font-mono`: "JetBrains Mono Variable", ui-monospace stack
- `--font-serif`: ui-serif, Georgia, Cambria, Times New Roman, serif

**Colors (semantic layer — named by role, not by value):**
- `--color-background`: #ffffff — page background
- `--color-foreground`: #0f172a — primary text
- `--color-border`: #e2e8f0 — default borders
- `--color-hairline`: #f1f5f9 — subtle separators
- `--color-surface`: #f8fafc — elevated surfaces
- `--color-panel`: #ffffff — card/panel backgrounds
- `--color-muted`: #f1f5f9 — muted backgrounds
- `--color-muted-foreground`: #64748b — secondary text
- `--color-primary`: #2563eb — primary action color
- `--color-primary-foreground`: #ffffff — text on primary
- `--color-accent`: #eff6ff — accent background
- `--color-accent-foreground`: #1e40af — accent text
- `--color-enzyme`: #ecfdf5 — green semantic tag background
- `--color-enzyme-foreground`: #065f46 — green semantic tag text
- `--color-flask`: #eff6ff — blue semantic tag background
- `--color-flask-foreground`: #1e40af — blue semantic tag text
- `--color-solvent`: #fefce8 — amber semantic tag background
- `--color-solvent-foreground`: #854d0e — amber semantic tag text
- `--color-warn`: #fef2f2 — red semantic tag background
- `--color-warn-foreground`: #991b1b — red semantic tag text
- `--color-success`: #f0fdf4 — green status background
- `--color-success-foreground`: #166534 — green status text

**Layout:**
- `--sidebar-width`: 256px

### styles.css Rewrite
- Remove all raw CSS variable definitions (`:root { --blue-50: ... }`)
- Remove all utility-like classes that Tailwind now provides (spacing, flex, grid, typography utility classes)
- Keep only app-specific, domain-level styles: ProseMirror typography, editor-specific styles, component-specific styles that are too complex for Tailwind utilities
- Add `@import "tailwindcss"` at the top

### Rename Sweep
- `index.html`: `<title>OpenScience</title>` → `<title>Helix</title>`
- `package.json`: `"name": "openscience-frontend"` → `"name": "helix-frontend"`
- `CONTEXT.md`: Update title and all OpenScience references to Helix
- Do NOT rename files or directories — this is a string rename only

## Testing Decisions

### What Makes a Good Test
- Test that the Vite build succeeds (Tailwind processes CSS without errors)
- Test that TypeScript compiles cleanly
- Test that all existing tests still pass (421+ tests)
- Test that design tokens are applied correctly (snapshot of rendered component using token-based classes)

### Modules Under Test
- `vite.config.ts` — Tailwind plugin integration
- `styles.css` — valid CSS output, tokens defined
- `index.html` — page title is "Helix"
- `package.json` — package name is "helix-frontend"

### Prior Art
- Existing Vitest test suite (421 tests) — all must remain green
- `npm run build` (tsc + vite build) — must succeed

## Out of Scope
- Any visible UI changes beyond the page title
- Layout changes (sidebar, etc.)
- Logo or icon design
- Dark mode tokens
- Responsive breakpoints
- Removing the topbar (that is PRD #2)

## Further Notes

- The design tokens use the "semantic naming" convention: colors are named by their role (`--color-primary`), not by their value (`--color-blue-600`). This makes it easy to swap the entire palette for dark mode in a future PR.
- The semantic tag colors (enzyme, flask, solvent, warn, success) follow the domain vocabulary from `UBIQUITOUS_LANGUAGE.md` and should be used for chips/badges in the ELN editor and metadata panel.
- After this PRD, `styles.css` should be approximately 500 lines (down from ~2800), with Tailwind handling all utilities.
- This PRD is a prerequisite for all other PRDs under the Helix EPIC.
