# Styling Coding Standard

Every UI surface in Helix derives from **six Theme Seeds**. This document is the single source of truth for which seed (or derived shade) to use for a given component role.

---

## 1. Colour Model

### 1.1 Six Theme Seeds

These six custom properties are the only colours set directly. Everything else is derived via `color-mix()` in OKLCH space.

| Seed | Default | Role |
|------|---------|------|
| `--color-background` | `oklch(0.985 0.005 95)` | App canvas — the page background |
| `--color-surface` | `oklch(0.975 0.008 95)` | Inputs, selects, textareas, table headers, active tabs |
| `--color-card` | `oklch(0.982 0.006 95)` | Cards, modals, menus, collapsibles, settings sections |
| `--color-ink` | `oklch(0.22 0.02 260)` | All text; source of borders, hairlines, muted text |
| `--color-primary` | `oklch(0.42 0.08 195)` | Action colour — buttons, links, active states |
| `--color-accent` | `oklch(0.94 0.03 180)` | Selection highlights, hover tints, focus ring |

The three surface seeds form a deliberate lightness ladder: **Background** (lightest) < **Card** (middle) < **Surface** (darkest). This creates a visible layering — background is the page canvas, cards sit on top, and surface elements sit on top of cards.

### 1.2 Derived Shade Ladder

Every seed produces four computed shades: `-hover`, `-active`, `-subtle`, `-foreground`. Ink additionally produces `-border`, `-hairline`, `-muted-foreground`.

**Rule:** Hardcoding a color value that can be derived from a seed is a defect. Always reference the derived token.

### 1.3 Fixed Semantic Colours

Destructive (`--color-destructive`), Success (`--color-success`), and Warning (`--color-warning`) are platform-fixed and never user-customizable. Each has the standard ladder: `-hover`, `-active`, `-subtle`, `-foreground`.

### 1.4 Domain Colours

Colours stored on domain objects (tag colours, schema colours, metric cards) are **Color Tokens** — distinct from Theme Tokens. They live in the `helix_core` palette and are unaffected by theme changes. Use `--color-{name}` and `--color-{name}-foreground` from the palette, never hardcode.

---

## 2. Component Role → Seed Mapping

### 2.1 Page Layout

| Surface | Token | Notes |
|---------|-------|-------|
| Page body | `--color-background` | The outermost container |
| Settings hero area | `--color-background` | With `grid-paper` texture and bottom hairline border |
| Settings bottom bar | `--color-card`/95 with `backdrop-blur-sm` | Sticky bar at bottom of settings pages |

### 2.2 Cards

Cards use `--color-card` background with `--color-ink-hairline` border.

```tsx
// Canonical card container
<div className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)]">
```

**When to use `--color-card`:**
- Modals (`Modal.tsx`)
- Dropdown menus (`Menu.tsx`)
- Collapsible sections (`Collapsible.tsx`)
- Settings section cards (`SettingsSectionCard.tsx`)
- Profile cards, home hub cards, metric cards
- Any UI panel that sits above the page background

**When NOT to use `--color-card`:**
- Input fields → use `--color-surface`
- Table headers → use `--color-surface`
- The page itself → use `--color-background`

### 2.3 Tables

Tables use a deliberate three-token layering:

| Element | Background | Border | Font |
|---------|-----------|--------|------|
| `Table` wrapper | Transparent | `--color-ink-hairline` | — |
| `TableHead` (header row) | `--color-surface` | Bottom: `--color-ink-hairline` | — |
| `TableHeaderCell` | Inherits from head | — | `--font-label`, text-xs, uppercase, `--color-ink-muted-foreground` |
| `TableRow` | Transparent | Bottom: `--color-ink-hairline` (last row: none) | — |
| `TableRow` hover | `--color-background-hover` | — | — |
| `TableCell` | Inherits from row | — | `--font-body`, text-base, `--color-ink` |

**Rationale:** The head bar uses `--color-surface` (strongest contrast) to anchor the table visually. Row hover uses `--color-background-hover` so it darkens relative to the page background, not relative to a card surface.

```tsx
// Canonical table structure
<Table>
  <TableHead>
    <TableRow>
      <TableHeaderCell>Column A</TableHeaderCell>
      <TableHeaderCell>Column B</TableHeaderCell>
    </TableRow>
  </TableHead>
  <tbody>
    <TableRow>
      <TableCell>Data</TableCell>
      <TableCell>Data</TableCell>
    </TableRow>
  </tbody>
</Table>
```

### 2.4 Buttons

Buttons have three variants. Choose by **visual weight** — not by convenience.

| Priority | Variant | When to use |
|----------|---------|-------------|
| High | `primary` | The single most important action on a screen (Save, Submit, Create). Use sparingly — one per form, never two side-by-side. |
| Default | `ghost` | Standard actions: Cancel, Edit, Add item, toolbar buttons, tab triggers, collapsible headers. The vast majority of buttons. |
| Dangerous | `destructive` | Irreversible actions: Delete, Remove, Log out. |

```tsx
// The single save/submit on a form
<Button variant="primary">Save changes</Button>

// Standard actions
<Button variant="ghost">Cancel</Button>
<Button variant="ghost">Add field</Button>

// Irreversible actions
<Button variant="destructive">Delete project</Button>
```

**Rule of thumb:** If a screen has multiple `primary` buttons, at most one should be primary — choose the most important and make the rest `ghost`.

**Icon-only buttons** use `IconButton`, not `<Button>` with no children:

```tsx
<IconButton aria-label="Close">
  <X size={16} />
</IconButton>
```

Every `IconButton` requires `aria-label` (the Tooltip Rule: `CONTEXT.md`).

### 2.5 Inputs, Textareas, and Selects

All form fields use `--color-surface` background with `--color-ink-border` border:

| Property | Token |
|----------|-------|
| Background | `--color-surface` |
| Text | `--color-ink` |
| Placeholder | `--color-ink-muted-foreground` |
| Border (idle) | `--color-ink-border` |
| Border (focus) | `--color-primary` |
| Focus ring | `--color-focus-ring` (which resolves to `--color-accent`) |
| Disabled | `opacity: 50%`, `cursor: not-allowed` |

```tsx
<Input placeholder="Search..." />
<Textarea rows={3} />
<Select>
  <option>Option A</option>
</Select>
```

### 2.6 Tab Bars

A solid bar using `--color-background`. Active tab gets `--color-surface` fill; inactive tabs are transparent with muted ink.

```tsx
<TabBar
  tabs={[
    { id: "general", label: "General" },
    { id: "advanced", label: "Advanced" },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

Active tab styling:
- Background: `--color-surface`
- Text: `--color-ink`, semibold

Inactive tab styling:
- Background: transparent
- Text: `--color-ink-muted-foreground`
- Hover: `--color-ink` text, `--color-background-hover` background

### 2.7 Modals

| Element | Token |
|---------|-------|
| Overlay / backdrop | `bg-black/40 backdrop-blur-sm` |
| Modal body | `--color-card` |
| Border | `--color-ink-hairline` |
| Title | `--font-label`, text-md, semibold, `--color-ink` |
| Close button | `IconButton` with `X` icon (size 16) |

### 2.8 Menus (Dropdowns)

| Element | Token |
|---------|-------|
| Panel | `--color-card` |
| Border | `--color-ink-hairline` |
| Item text | `--color-ink` |
| Item hover | `--color-surface` |
| Danger item text | `--color-destructive` |
| Danger item hover | `--color-destructive-subtle` |
| Disabled item | `opacity: 50%`, `cursor: not-allowed` |

Menus use `--color-card` (not `--color-background`) so they pop above surface containers.

### 2.9 Badges

| Variant | Background | Text |
|---------|-----------|------|
| `neutral` | `--color-surface` | `--color-ink-muted-foreground` |
| `primary` | `color-mix(primary, transparent 75%)` | `--color-primary-active` |
| `success` | `color-mix(success, transparent 55%)` | `--color-success-active` |
| `warning` | `color-mix(warning, transparent 75%)` | `--color-warning-active` |
| `destructive` | `color-mix(destructive, transparent 75%)` | `--color-destructive-active` |

All badges use `--font-label`, text-xs, and `--color-ink-hairline` border on neutral variant.

---

## 3. Typography

### 3.1 Font Roles

**Never reference a raw `font-family` string.** Always choose a role:

| Role | Token | Family | Use for |
|------|-------|--------|---------|
| Label | `--font-label` | JetBrains Mono | Headers, tabs, eyebrows, display IDs, data cells, badges, page/UI titles |
| Body | `--font-body` | Inter | Entry/entity names, editor text, button labels, prose |

```tsx
// Correct
<h2 className="font-[var(--font-label)]">Settings</h2>
<p className="font-[var(--font-body)]">{entryName}</p>

// Wrong
<h2 style={{ fontFamily: "JetBrains Mono" }}>Settings</h2>
```

### 3.2 Typographic Scale

Always reference a scale token. Base is 13px.

| Token | Size | Typical use |
|-------|------|-------------|
| `--text-2xs` | 10px | Eyebrows, table headers, badges |
| `--text-xs` | 11px | Metadata |
| `--text-sm` | 12px | Data text, button labels |
| `--text-base` | 13px | Default body text, inputs, select |
| `--text-md` | 14px | Medium text |
| `--text-lg` | 16px | Large text |
| `--text-xl` | 18px | Extra large |
| `--text-2xl` | 22px | Subtitle |
| `--text-3xl` | 28px | Page title |
| `--text-4xl` | 42px | Display / hero |

### 3.3 Text Style Composites

Prefer these composite styles when they match the semantic role:

| Class | Role | Size | Weight | Colour |
|-------|------|------|--------|--------|
| `.text-eyebrow` | Label | 2xs | 500, uppercase | `--color-ink-muted-foreground` |
| `.text-title` | Label | 3xl | 600 | `--color-ink` |
| `.text-meta` | Label | xs | 400 | `--color-ink-muted-foreground` |
| `.text-data` | Label | sm | 500, tabular-nums | `--color-ink` |

---

## 4. Borders and Separators

| Strength | Token | Use |
|----------|-------|-----|
| Strong | `--color-ink-border` | Input borders, field borders |
| Subtle | `--color-ink-hairline` | Card borders, table borders, modal borders, menu borders, section dividers |

**Rule:** Use `--color-ink-hairline` for containers (cards, modals, tables, menus, collapsibles). Use `--color-ink-border` for interactive controls (inputs, selects, textareas).

---

## 5. Focus and Disabled

- **Focus ring:** `ring-2 ring-[var(--color-focus-ring)] ring-offset-1` on every interactive element. `--color-focus-ring` resolves to `--color-accent`.
- **Disabled:** `opacity-50 cursor-not-allowed` — no separate colour token. This applies to buttons, inputs, selects, and menu items.

---

## 6. Primitives

Always use the shared primitives from `src/shell/src/shared/primitives/` instead of building one-off components. The canonical set:

| Primitive | Import | Variants |
|-----------|--------|----------|
| Button | `Button` | `primary` / `ghost` / `destructive` × `sm` / `md` |
| IconButton | `IconButton` | Fixed 28×28, requires `aria-label` |
| Input | `Input` | Text input |
| Textarea | `Textarea` | Multi-line text |
| Select | `Select` | Dropdown select |
| Collapsible | `Collapsible` | Expandable section with chevron |
| Table | `Table`, `TableHead`, `TableRow`, `TableHeaderCell`, `TableCell` | Presentational table |
| TabBar | `TabBar` | Connected tab bar |
| Modal | `Modal` | Overlay modal |
| Menu | `Menu` | Dropdown menu |
| Badge | `Badge` | `neutral` / `primary` / `success` / `warning` / `destructive` |

### 6.1 Primitives override global button leakage

`styles.css` defines a global `button` base style that applies primary border and background to every `<button>`. All primitives handle this internally (e.g., `border-0 bg-transparent` on ghost/destructive variants). When adding a new primitive, always include explicit `border` and `background` classes to avoid inheriting the leaked global style.

---

## 7. Icon Sizes

Use the three semantic icon size tokens:

| Token | Size | Use |
|-------|------|-----|
| `--icon-sm` | 14px | Inline icons inside text or badges |
| `--icon-md` | 18px | Button icons (default), collapsible chevrons |
| `--icon-lg` | 24px | Standalone action icons, empty states |

Prefer the `size` prop on Lucide icons when possible:

```tsx
<Save size={18} />   // --icon-md
<Info size={14} />   // --icon-sm
```

---

## 8. Quick Reference: Which Token Where

```
Page background         → --color-background
Card / Modal / Menu     → --color-card
Input / Select / Table head → --color-surface
Text (any)              → --color-ink
Muted / secondary text  → --color-ink-muted-foreground
Primary button          → --color-primary bg, --color-primary-foreground text
Ghost button / Icon btn → transparent bg, --color-ink text
Destructive button      → --color-destructive bg
Active / selected       → --color-accent
Focus ring              → --color-accent (via --color-focus-ring)
Card/container borders  → --color-ink-hairline
Input borders           → --color-ink-border
Labels / headers font   → --font-label
Body / prose font       → --font-body
```

---

## 9. Migration Notes

When migrating existing UI onto this standard:

1. Replace raw `font-family` values with `var(--font-label)` or `var(--font-body)`.
2. Replace raw pixel font sizes with typographic scale tokens (`--text-base`, etc.).
3. Replace hardcoded hex/oklch colors with seed or derived tokens.
4. Replace one-off button styles with the `Button` primitive.
5. Replace one-off tables with the `Table` primitive family.
6. Replace one-off collapsible sections with `Collapsible`.
7. Test for global button leakage — any unstyled `<button>` inherits primary colour from `styles.css`.

---

*Last updated: August 2026. Reference ADRs: 0016 (design-system foundation), 0017 (preferences + localStorage), 0018 (design system + preferences unification).*
