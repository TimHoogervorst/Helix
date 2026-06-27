# Browser Pattern — Core Terminology

> Reference document for the unified three-panel browser pattern. These terms are canonical — use them in code, PRDs, ADRs, and discussions. Derived from the domain glossary in [CONTEXT.md](../CONTEXT.md) and the unification ADR in [docs/adr/0004-unified-browser-pattern.md](../docs/adr/0004-unified-browser-pattern.md).

---

## The Browser Pattern

The platform uses a single, canonical UI pattern for browsing, inspecting, and working with content. Every browser surfaces **Items** in a **Master Panel** table. Clicking an Item opens a **Detail Panel** summary card. Expanding it launches the **Workspace Panel** — the full work surface for that Item type.

### The Three Panels

| Panel | Position | Purpose | Visible When |
|-------|----------|---------|--------------|
| **Master** | Left | Item table — the primary list of browsable things | Always (collapses to thin strip in Expanded state) |
| **Detail** | Middle | Summary card — key metadata at a glance before committing | Detail and Expanded states |
| **Workspace** | Right | Full work surface — editor, detail view, plugin surface | Expanded state only |

### The Three View States

| State | Master | Detail | Workspace | User's Mental Model |
|-------|--------|--------|-----------|-------------------|
| **List** | Full-width table | Hidden | Hidden | "I'm looking for something" |
| **Detail** | Shared-width table | Slides in from right | Hidden | "What is this thing?" |
| **Expanded** | Collapsed to thin strip (~40px) | Visible | Slides in from right | "I want to work with this" |

**Transitions:** List → Detail (click a row) → Expanded (click expand button). Reverse: Expanded → Detail (click collapse) → List (click close). You cannot skip from List directly to Expanded without going through Detail — the Detail panel is the gateway.

---

## Item Types

An **Item** is any row that appears in a Master Panel table. The minimum contract for an inspectable Item: display ID, name/title, type discriminator, creation timestamp.

| Item Type | Browser | Click Behavior | Workspace Content |
|-----------|---------|---------------|-------------------|
| **Entity** | LIMS | Opens Detail → can expand to Workspace | Tabbed detail view (Activity, Insights, Storage) |
| **Entry** | Library | Opens Detail → can expand to Workspace | TipTap editor (rich-text editing surface) |
| **Folder** | Library | Navigates *into* the folder (no Detail panel) | N/A — folders are containers, not content |
| **Plugin types** | Future | TBD by plugin | Plugin-provided work surface |

**Key rule:** An Item type belongs to exactly one browser. Entities do not appear in the Library Master table; Entries do not appear in LIMS. Cross-references (ReferenceBadges) can point across browsers, but the Master/Detail/Workspace flow stays within a single browser.

---

## The Two Browsers

| Browser | Route | Mental Model | Items Shown | Navigation |
|---------|-------|-------------|-------------|------------|
| **Library** | `/library?path=...` | File explorer | Folders + Entries (mixed, folders first) | Hierarchical (breadcrumbs, click into folders) |
| **LIMS** | `/lims` | Database | Entities only (flat, filterable) | Flat (search, type filter dropdown) |

---

## Workspace = Slot

The Workspace Panel is a **slot** — the browser provides the container (header bar with close/collapse, animation, dedicated URL), the Item type provides the content. This is the extension point for the future plugin/modding API.

Every Workspace has a **dedicated URL** (e.g., `/eln/E12`, `/lims/BLOOD1`) that resolves to the full work surface as a standalone page. These URLs are shareable and bookmarkable.

---

## Shared vs. Browser-Specific

| Concern | Shared (once) | Per-Browser |
|---------|--------------|-------------|
| View State machine | `useBrowserView` hook | — |
| Collapsed strip | `BrowserCollapsedStrip` | — |
| Panel layout + animations | Shared CSS + animation system | — |
| Detail card shell | `BrowserDetailPanel` (field rendering shell) | Fields + properties specific to Entity vs Entry |
| Workspace shell | `BrowserWorkspacePanel` (header + slot) | Workspace content (editor vs tabbed detail vs plugin) |
| Master table | `BrowserMasterPanel` (table wrapper, selection, pagination) | Column definitions, row renderers, search/filter controls |
| Backend base | `BrowsableItem` abstract model (display ID, created_at, created_by) | Per-app models (Entity, NotebookEntry) |

---

## Quick Reference

```
"Master"  = left panel, the item table
"Detail"  = middle panel, the summary card
"Workspace" = right panel, the full work surface

"List"    = state: Master only
"Detail"  = state: Master + Detail
"Expanded" = state: Collapsed Master + Detail + Workspace

"Item"    = any row in a Master table
"Entity"  = LIMS Item (structured lab data)
"Entry"   = Library Item (notebook narrative)
"Folder"  = Library container Item (navigate, no Detail)

"Browser" = concrete instance (Library, LIMS)
```

---

*Last updated: 2026-06-27. See [CONTEXT.md](../CONTEXT.md) for the full domain glossary and [docs/adr/0004-unified-browser-pattern.md](../docs/adr/0004-unified-browser-pattern.md) for the unification rationale.*
