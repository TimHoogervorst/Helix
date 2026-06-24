# PRD-02: ELN Rich-Text Viewer & Editor

> Status: `implemented`
> Date: 2026-06-24
> Parent: [PRD-01](prd-01-scaffold.md)

---

## What Was Built

Replaced the plain-text `<textarea>` ELN entry system with a TipTap-based rich-text editor. Entries now support formatted text (headings, bold, italic, lists, blockquote) with a Notion-inspired editing experience — single page, click-to-edit inline, no separate `/edit` route.

### User Flow

1. **View entry** — Click entry in list → `/eln/:id` → full-page rendered rich text (read-only)
2. **Edit entry** — Click "Edit" or click the content → editor activates inline, bubble toolbar appears on text selection
3. **New entry** — Click "+ New Entry" → `/eln/new` → blank editor, ready to type immediately
4. **Save** — Manual save button. POST for new entries (redirects to detail view), PUT for existing (returns to view mode)
5. **Cancel** — Reverts to original content (existing) or navigates away (new)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **TipTap JSON → Django JSONField** | Zero-translation storage. Editor state IS the database value. Safe rendering (no `dangerouslySetInnerHTML`). Queryable via PostgreSQL JSONB operators. See [ADR-0001](../docs/adr/0001-tiptap-json-content-format.md). |
| **Single-page view/edit** | No `/eln/:id/edit` route. View and edit are modes on the same component. Click content → edit. Feels like Notion, not a form-based CRUD app. |
| **Hybrid toolbar** | Fixed top bar for actions (title, save, cancel, delete, metadata) + floating bubble menu for inline formatting (bold, italic, headings, lists, blockquote). Notion pattern — formatting lives near the text. |
| **View mode = read-only TipTap** | The editor mounts with `editable=false` rather than rendering to raw HTML. Guarantees 100% rendering fidelity between view and edit modes. |
| **Manual save** | Explicit save button with dirty-state indicator. Autosave comes later. |
| **beforeunload guard** | Browser-level tab-close confirmation when content is unsaved. Simple, covers the main data-loss case. |

---

## Architecture

### Component Tree

```
App
└── Layout
    ├── ElnList           — unchanged (uses shared types)
    ├── ElnNew            — thin wrapper → <ElnEditor />
    └── ElnDetail         — thin wrapper → <ElnEditor entryId={n} />
         └── ElnEditor    — 410-line core component
              ├── EditorTopBar     — title, folder selector, actions, metadata
              ├── BubbleMenu      — bold, italic, H1/H2/H3, lists, blockquote
              └── TipTap Editor   — ProseMirror contenteditable area
```

### ElnEditor State Machine

```
                    ┌──────────┐
   (no entryId) ───→│ EDIT-NEW │──Save POST──→ redirect /eln/:id
                    └────┬─────┘
                    Cancel│
                          ↓
                    navigate /eln

                    ┌──────────┐             ┌──────────┐
   (with entryId)──→│ LOADING  │──OK────────→│   VIEW   │
                    └────┬─────┘             └──┬───┬───┘
                         │fail         "Edit"   │   │ "Delete"
                         ↓              click    │   │
                    ┌──────────┐    content     │   │
                    │  ERROR   │    click       │   │
                    └──────────┘        ┌───────┘   │
                                        ↓           ↓
                               ┌──────────────┐  confirm → DELETE
                               │ EDIT-EXISTING│  → navigate /eln
                               └──┬───┬───────┘
                    Save PUT      │   │ Cancel
                                  ↓   ↓
                          ┌──────────────┐
                          │   SAVING     │──fail──→ stay in EDIT with error
                          └──────┬───────┘
                                 │ success
                                 ↓
                          return to VIEW (PUT)
```

### Content Format

The canonical empty document stored in the database:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": []
    }
  ]
}
```

### TipTap Extensions

| Extension | Purpose |
|-----------|---------|
| `StarterKit` (configured: h1-h3) | Bold, italic, headings, bullet/ordered lists, blockquote, code blocks |
| `Placeholder` | "Start writing…" when document is empty |
| `BubbleMenu` | Floating formatting toolbar on text selection |

---

## Files Changed

### Backend

| File | Change |
|------|--------|
| `backend/eln/models.py` | `content` → `JSONField` |
| `backend/eln/migrations/0003_alter_notebookentry_content.py` | Data migration (plain text → TipTap JSON) + column type change |
| `backend/eln/serializers.py` | `validate_tiptap_json()` validator on `NotebookEntryCreateSerializer` |
| `backend/eln/tests/test_api.py` | 7 tests updated to JSON, 1 new validation test |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/types/eln.ts` | **New** — shared types + `EMPTY_DOC` constant |
| `frontend/src/components/ElnEditor.tsx` | **New** — core editor component |
| `frontend/src/pages/ElnDetail.tsx` | Rewritten as thin wrapper |
| `frontend/src/pages/ElnNew.tsx` | Rewritten as thin wrapper |
| `frontend/src/pages/ElnList.tsx` | Uses shared `EntryListItem` type |
| `frontend/src/styles.css` | ~210 lines of editor CSS appended |
| `frontend/package.json` | +5 TipTap dependencies |

---

## Design Tokens (CSS)

- **Top bar**: border-bottom separator, 1.5rem title, borderless title input in edit mode
- **Bubble menu**: dark (`--gray-900`) floating bar, 10px radius, 32px icon buttons, blue active state, dividers between groups
- **ProseMirror**: 1rem, 1.75 line-height, 0.75em block spacing, heading scale (1.75/1.375/1.125rem), left-border blockquotes
- **View mode**: transparent border → blue highlight on hover, click-anywhere-to-edit cursor
- **Dirty indicator**: "Unsaved changes" text + blue color when content differs from last save

---

## Deferred (Next Sessions)

- **Autosave** — debounced save instead of manual button
- **Images** — paste/upload images into entries
- **Links** — `@tiptap/extension-link` is installed but not wired into the bubble menu
- **Tables** — TipTap table extension
- **`#` reference autocomplete** — type `#` to search and link entities/entries
- **Entry version history** — `EntryVersion` model, save-on-each-explicit-save
- **Folder selector in edit mode** — currently only shown for new entries; add to existing-entry edit flow
- **Science-specific nodes** — chemical formulas, LaTeX math, barcode embeds (custom TipTap extensions)

---

## Related Docs

- [Domain glossary](../CONTEXT.md) — NotebookEntry, Rich-Text Document, Mention
- [ADR-0001](../docs/adr/0001-tiptap-json-content-format.md) — why TipTap JSON over HTML/Markdown
- [Architecture decisions](architecture.md) — full project decisions log
