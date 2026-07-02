# Helix — Styling Guide

> The canonical reference for visual design decisions. Covers fonts, icons, typographic scale, and button patterns. For domain vocabulary, see [CONTEXT.md](../CONTEXT.md). For architecture decisions, see [docs/adr/](adr/).

---

## Fonts

### Body Font: Inter (Variable)

Inter is the primary typeface for all body text, headings, labels, buttons, and UI elements. It is loaded as a variable font via the [Fontsource](https://fontsource.org) npm package (`@fontsource-variable/inter`).

**Why Inter:**
- Designed specifically for app UI (born as Figma's interface font)
- Excellent readability at small sizes (labels, badges, captions)
- The de facto standard for modern SaaS applications
- Variable font: one file, all weights, no weight-selection friction

**CSS integration:**
```css
body {
  font-family: "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, sans-serif;
}
```

The system font stack remains as a fallback in case the web font fails to load.

### Monospace Font: JetBrains Mono

JetBrains Mono is the typeface for code blocks, reference IDs, property keys, and any data that benefits from monospaced alignment. Also loaded via Fontsource (`@fontsource-variable/jetbrains-mono`).

**Why JetBrains Mono:**
- Designed for code readability (ligatures, distinctive character shapes)
- Pairs well with Inter (Linear uses this combination)
- Variable font, same delivery mechanism as Inter

**CSS integration:**
```css
code, .ref-badge-id, .ref-dropdown-id, .prop-key {
  font-family: "JetBrains Mono Variable", "JetBrains Mono",
               "Cascadia Code", "SF Mono", Consolas, monospace;
}
```

### Font Weight Usage

| Weight | Token | Usage |
|--------|-------|-------|
| 400 | Regular | Body text, labels, secondary content |
| 500 | Medium | Emphasis in body, small headings |
| 600 | Semibold | Buttons, section headings, primary emphasis |
| 700 | Bold | Page titles, strong emphasis (use sparingly) |

Avoid custom weights outside these four. The variable font supports them, but consistency matters more than flexibility.

---

## Typographic Scale

All font sizes use `rem` units and map to the following scale tokens:

| Token | Size | Pixels (at 16px base) | Usage |
|-------|------|-----------------------|-------|
| `--text-xs` | 0.75rem | 12px | Badges, captions, tooltips |
| `--text-sm` | 0.875rem | 14px | Secondary text, form labels, data grid cells |
| `--text-base` | 1rem | 16px | Body text, default for paragraphs and controls |
| `--text-lg` | 1.125rem | 18px | Emphasized body, card titles |
| `--text-xl` | 1.25rem | 20px | Section headings, page sub-titles |
| `--text-2xl` | 1.5rem | 24px | Page titles, console headers |

**CSS integration:**
```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
}
```

New components reference the token, not the raw size:
```css
.my-label { font-size: var(--text-sm); }
.my-title { font-size: var(--text-2xl); }
```

---

## Icons

### Library: Lucide

All icons use the [Lucide](https://lucide.dev) SVG icon library (`lucide-react`). Direct Unicode emoji (`🧪`, `📄`, `🔍`) is no longer used for UI icons.

**Why Lucide:**
- SVG-based — inherits text color via `currentColor`, themable, resolution-independent
- 1.5px stroke consistency — no accidental weight mixing
- Tree-shakeable — each icon is its own import, no unused icons in the bundle
- ~1,400 icons covering both general UI and science-adjacent actions
- MIT license

**Import pattern:**
```tsx
import { Plus, Search, X, Settings, Trash2 } from "lucide-react";
```

### Semantic Icon Sizes

Icons use three canonical sizes. Do not use ad-hoc pixel values.

| Token | Value | Usage |
|-------|-------|-------|
| `--icon-sm` | 14px | Inline icons (inside text, badges, reference chips, data cells) |
| `--icon-md` | 18px | Button icons, form field adornments, header icons |
| `--icon-lg` | 24px | Standalone action icons, empty-state illustrations, page headers |

**Rendering pattern:**
```tsx
<Plus size={18} />          {/* --icon-md, the most common button size */}
<Search size={14} />        {/* --icon-sm, inside a search bar */}
<FileText size={24} />      {/* --icon-lg, a section header or empty state */}
```

Always pass `size` explicitly — do not rely on CSS `font-size` inheritance for icon sizing.

### Icon-Only Buttons Must Have Tooltips

Every button that contains only an icon (no visible text) must provide:

1. A `title` attribute for native browser tooltips, **and**
2. An `aria-label` attribute for screen readers

```tsx
<button title="Close" aria-label="Close">
  <X size={18} />
</button>
```

This is a **hard rule** — no exceptions. Unlabeled icon buttons are inaccessible and confusing.

---

## Buttons

### The Prime Directive

**Every button must include an icon.** Text labels live in input fields and navigation bars, not on buttons. This rule applies to all buttons: primary actions, chrome controls, table actions, toggles, everything.

This is an intentional departure from conventional "icon + text" or "text-only" patterns. The platform commits to icon-driven actions. The trade-offs are accepted:

- **Pro:** Compact, language-agnostic, consistent visual rhythm, no text-wrapping layout bugs
- **Con (mitigated by tooltips):** Some actions are harder to communicate with icons alone
- **Mitigation:** Universal icon choices (Lucide provides well-recognized icons), mandatory tooltips, and a curated icon-to-action mapping

### Action → Icon Mapping

| Action | Lucide Icon | Notes |
|--------|------------|-------|
| Create / Add / New | `Plus` | The universal add icon |
| Close / Dismiss | `X` | The universal close icon |
| Save | `Save` | Floppy disk — universally recognized |
| Delete / Trash | `Trash2` | Trash can with upturned lid |
| Settings / Configure | `Settings` | Gear icon |
| Search | `Search` | Magnifying glass |
| Edit | `Pencil` | Pencil |
| Expand / Fullscreen | `Maximize2` | Two arrows pointing outward |
| Collapse | `Minimize2` | Two arrows pointing inward |
| Archive | `Archive` | Box |
| Navigate up / back | `ArrowUp` | Up arrow |
| Refresh | `RotateCw` | Circular arrow |
| Filter | `Filter` | Funnel |
| Sort | `ArrowUpDown` | Bidirectional arrow |
| Copy | `Copy` | Two overlapping squares |
| External link | `ExternalLink` | Square with arrow |
| More / Menu | `MoreHorizontal` | Three horizontal dots |
| Deactivate | `CircleOff` | Circle with a slash |
| Drag / Reorder | `GripVertical` | Vertical dots |

### Exception: Destructive Actions

Buttons for destructive or irreversible actions (Delete, Deactivate, Archive) should additionally use a danger color treatment to visually distinguish them from safe actions. The icon alone is not sufficient warning.

### Button Sizing

All buttons should be sized to comfortably fit an `--icon-md` (18px) icon with padding. The canonical button sizes:

| Size | Dimensions | Usage |
|------|-----------|-------|
| **Square** | 28 × 28px | Chrome actions (close, settings, expand) |
| **Compact** | 32 × 32px | Table row actions, inline actions |
| **Default** | 36 × 36px | Primary actions, toolbar buttons |

---

## Color Tokens

> *Documented here since icons inherit color from their container. Full color palette TBD. Existing CSS custom properties in `:root` remain the source of truth until this section is expanded.*

Icons inherit color via `currentColor`. Button color schemes:

| Scheme | Background | Icon Color | Usage |
|--------|-----------|------------|-------|
| **Primary** | `--blue-500` | `white` | Primary actions (create, save) |
| **Secondary** | `--gray-100` | `--gray-700` | Secondary actions, chrome |
| **Danger** | `--red-500` | `white` | Destructive actions |
| **Ghost** | transparent | `--gray-500` | Low-emphasis chrome actions |

---

## CSS Custom Property Summary

All tokens defined in this guide:

```css
:root {
  /* Typographic scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;

  /* Icon sizes */
  --icon-sm: 14px;
  --icon-md: 18px;
  --icon-lg: 24px;
}
```

Font families are set on `body` and `code` (see Fonts section above). Button sizes are documented but not yet tokenized.
