## Problem Statement

The ELN editor currently uses a plain text `<input>` for the title (inside the paper-page top bar) and renders only ProseMirror content below. There is no metadata line showing the entry's display ID, dates, and autosave status. There is no description field, no tags section, and the ProseMirror typography uses browser defaults instead of the Helix design system. The formatting toolbar (EditorBubbleMenu) floats over the content, adding complexity. The editor should match the rich, layered content-block experience shown in the Helix prototype.

## Solution

Restructure the ELN editor's content area to match the prototype: a metadata line with real entry data at the top, followed by a serif title input, a description placeholder, a tags section with placeholder chips, a hairline divider, and finally the ProseMirror editor with fully restyled typography. Remove the formatting toolbar (EditorBubbleMenu already removed in PRD #3).

## User Stories

1. As a researcher, I want to see my entry's display ID, creation date, and autosave status in a compact metadata line at the top, so that I have key information at a glance.
2. As a researcher, I want a large, serif-styled title input that matches the prototype, so that titles feel like proper document headings.
3. As a researcher, I want to see "Untitled" as the placeholder when creating a new entry, so that I know to type a title.
4. As a researcher, I want the title input auto-focused when creating a new entry, so that I can start typing immediately.
5. As a researcher, I want to see a description field below the title, so that I can add a summary of my entry (placeholder text for now).
6. As a researcher, I want to see tags below the description as colored chips with icons, so that I can categorize my entry (placeholder for now).
7. As a researcher, I want a visual divider between the entry metadata/header area and the ProseMirror content, so that the content area has clear visual separation.
8. As a researcher, I want ProseMirror headings to use serif fonts with proper sizing, so that my document structure is visually clear.
9. As a researcher, I want ProseMirror body text to have comfortable line-height and spacing, so that long entries are readable.
10. As a developer, I want the formatting toolbar (EditorBubbleMenu) removed from the editor, so that the editor content has less visual clutter.

## Implementation Decisions

### Editor Content Area Layout

```
┌─────────────────────────────────────┐
│ [Metadata line: EXP-0284 · Created  │  ← real data from entry object
│  2026-06-28 · v0.4 · autosaved]     │
├─────────────────────────────────────┤
│ [Title input — serif, 42px]         │  ← controlled <input>, no behavior change
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

### Title Input
- Controlled `<input>` — no behavior change, only styling
- CSS classes: `font-serif text-[42px] font-semibold leading-[1.05] tracking-tight`
- Placeholder: "Untitled"
- `autoFocus={isNew}` — auto-focus when creating a new entry
- The existing `title` state and `setTitle` from `useEntryEditor` hook are used unchanged
- In view mode, title displays as an `<h1>` with the same serif styling

### Metadata Line
- Real data from the `entry` object (when available): `display_id`, `created_at`, `updated_at`
- Placeholder text for autosave status: "v0.4 · autosaved 2s ago" (static text)
- CSS classes: `text-[11px] font-mono uppercase tracking-widest text-muted-foreground`
- Items separated by small dots (·)
- When creating a new entry (no entry object yet), show "New entry" in the same styling

### Description
- Static placeholder text: "Third iteration of the sgRNA screen..." (or a generic placeholder)
- CSS classes: `text-[15px] leading-relaxed text-muted-foreground max-w-2xl`
- Will be made editable in a future PRD
- Not a form element — just a `<p>` tag

### Tags Section
- Single placeholder chip with icon and tooltip
- Chip styling: `font-mono text-[0.72rem] border rounded-full px-2 py-0.5 inline-flex items-center gap-1.5`
- Semantic colors: `bg-enzyme text-enzyme-foreground` with enzyme-colored border
- Chip content: DNA icon + "SpCas9-HF1" text
- Tooltip: "Placeholder — tags coming soon"
- Appears below description, above the divider
- Multiple chips in a flex-wrap row with gap-1.5

### Hairline Divider
- `<div className="my-6 h-px bg-hairline" />`
- Separates the metadata/header area from the ProseMirror content

### ProseMirror Typography Restyle
All ProseMirror elements get Tailwind-based typography classes via `styles.css`:

| Element | Styling |
|---------|---------|
| `h1` | `font-serif text-[2.625rem] font-semibold tracking-tight leading-tight` |
| `h2` | `font-serif text-[1.5rem] font-semibold tracking-tight` |
| `h3` | `font-sans text-[1.125rem] font-semibold` |
| `p` | `text-[1rem] leading-[1.7]` |
| `blockquote` | `border-l-2 border-primary pl-4 italic text-muted-foreground` |
| `code` | `font-mono bg-muted rounded px-1 py-0.5 text-[0.9em]` |
| `pre` | `bg-foreground text-background rounded-lg p-4 overflow-x-auto` |
| `ul, ol` | `pl-6` |
| `li` | `mb-1` |
| `a` | `text-primary underline decoration-primary/30 underline-offset-2` |
| `hr` | `my-6 border-hairline` |

### Files to Modify
- **MODIFY**: `frontend/src/components/ElnEditor.tsx` — restructure content area with metadata line, title styling, description, tags, divider
- **MODIFY**: `frontend/src/styles.css` — add ProseMirror typography styles

## Testing Decisions

### What Makes a Good Test
- Test that title input renders with serif font class when in edit mode
- Test that title displays as h1 with serif styling in view mode
- Test that metadata line shows real entry data (display_id, dates) when entry is loaded
- Test that metadata line shows "New entry" text when creating a new entry
- Test that description placeholder text renders
- Test that tags placeholder chip renders
- Test that hairline divider renders between header and content
- Test that ProseMirror editor content renders (existing test pattern)
- Test that title input is auto-focused for new entries
- Do NOT test exact CSS values — test for presence of key classes

### Modules Under Test
- `ElnEditor.test.tsx` — metadata line, title styling, description, tags, divider

### Prior Art
- Existing `ElnEditor.test.tsx` tests — update, don't rewrite
- Existing Vitest + React Testing Library patterns

## Out of Scope
- Editable description (static placeholder only)
- Real tags with CRUD operations
- Real autosave functionality (static text only)
- AI features ("Ask Helix AI" button in the formatting toolbar stub)
- The formatting toolbar stub (Text, Heading, Steps, Table, etc.) shown in the prototype — this is a future feature for block-based editing
- Working search/filter by tags
- Tag color picker or tag management UI

## Further Notes

- The prototype shows a sticky formatting toolbar below the top toolbar with buttons for Text, Heading, Steps, Table, Reagent, Equation, Attach, Link entity, and "Ask Helix AI". This formatting toolbar is NOT part of this PRD — it is a future feature that requires block-based editing capabilities. The current ProseMirror editor handles formatting through its existing mechanisms (bold, italic, etc. via keyboard shortcuts or future toolbar).
- The title input behavior does NOT change — it remains a controlled `<input>` managed by `useEntryEditor`. Only the styling changes.
- The metadata line uses `entry` from `useEntryEditor`. The `display_id`, `created_at`, and `updated_at` fields are already available on the entry object.
- The description and tags are deliberately static. Making them editable requires schema changes (adding description and tags fields to the Entry model) and is a separate feature.
