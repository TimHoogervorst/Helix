# ADR-0001: TipTap JSON for ELN Entry Content

> Date: 2026-06-24
> Status: Accepted

---

## Context

ELN entries contain rich text — headings, bold, italic, lists, and later images, tables, chemical formulas. We need a storage format that supports WYSIWYG editing, safe rendering, and programmatic processing (search, `#` reference parsing, AI embeddings).

Three formats were evaluated:

| Format | Storage | Rendering | Editor | AI/Search |
|--------|---------|-----------|--------|-----------|
| **HTML** | TextField | Direct innerHTML | Any WYSIWYG | Parse HTML, strip tags |
| **Markdown** | TextField | Render to HTML | Textarea + preview | Parse markdown AST |
| **TipTap JSON** | JSONField | `generateHTML()` or custom renderer | TipTap editor (WYSIWYG) | Traverse JSON tree |

---

## Decision

**Store ELN entry content as a TipTap/ProseMirror JSON document tree in a Django `JSONField`.**

The canonical empty document is:

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

The TipTap/ProseMirror document model represents content as a tree of **nodes** (blocks: paragraphs, headings, lists) containing **marks** (inline: bold, italic, link). This structure maps directly to the editor's internal model, so no serialization translation happens between editor and database.

---

## Rationale

### Why not HTML

- **XSS surface.** Storing raw HTML means every render path must sanitize. TipTap JSON renders through a controlled serializer that produces safe HTML.
- **Lossy round-trips.** HTML → editor → HTML loses semantics (was that bold a `<strong>` or `<b>`? Is this a heading or a styled paragraph?).
- **Hard to query.** Searching HTML content means stripping tags. Searching TipTap JSON means traversing a typed tree — `find all headings` is `WHERE content->'content' @> '[{"type": "heading"}]'`.

### Why not Markdown

- **Limited expressiveness.** No tables (without GFM extensions), no text alignment, no image captions. Extensions fragment the format.
- **No real-time WYSIWYG.** Markdown editors show source or preview, not both. The user asked for a Notion-like experience — click to edit, see formatting live.
- **Impedance mismatch.** Every save/load requires parsing markdown → editor model → markdown. With TipTap JSON, the editor's internal model IS the storage format.

### Why TipTap JSON

- **Zero-translation storage.** The editor's state is the database value. Save = `editor.getJSON()`. Load = `editor.commands.setContent(json)`. No parsing step.
- **Safe by construction.** The JSON tree contains only known node types. Rendering traverses the tree and emits controlled HTML per node type — no unsanctioned HTML can sneak in.
- **Queryable.** PostgreSQL JSONB operators can inspect the document tree: find entries with headings, extract all text for full-text search, locate `#` references in text nodes.
- **Version-diffable.** Future `EntryVersion` can store JSON documents and diff them structurally (nodes added/removed/changed) rather than text-diffing raw HTML.
- **Extensible.** Custom node types (chemical formula, LaTeX block, barcode embed) can be added as TipTap extensions. The JSON structure accommodates them naturally.

---

## Consequences

### Migration path

Existing plain-text entries in the `TextField` will be migrated by:
1. Adding a new `JSONField` column (`content_json`)
2. Migrating existing text → wrapped in a paragraph node: `{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": <existing content>}]}]}`
3. Dropping the old `TextField` column (`content`)
4. Renaming `content_json` → `content`

During Phase 1 development, simpler alternative: wipe dev data and create a fresh migration that replaces the field directly (acceptable per project guidance — no production data exists).

### Future considerations

- **Full-text search** must extract plain text from the JSON tree. A PostgreSQL generated column or a Django `SearchVector` on extracted text can handle this.
- **AI embeddings** will operate on extracted plain text, not the raw JSON.
- **Export** (PDF, DOCX) will need renderers that consume the JSON tree — same traversal pattern as the HTML renderer.
- **Mentions parser** must now traverse TipTap JSON text nodes for `#` references instead of scanning a plain text string.

---

## Rejected Alternatives

- **Draft.js / Lexical JSON**: Both produce JSON, but TipTap/ProseMirror has a larger extension ecosystem, is framework-agnostic (works with React, Vue, vanilla), and is the dominant choice in the current JS rich-text landscape.
- **Slate**: Similar to TipTap but fewer extensions, smaller community. The tipping point is TipTap's collaborative-editing roadmap (CRDT via Yjs) — not needed now, but the format choice doesn't block it.
