# Ubiquitous Language

> Canonical domain glossary for Helix. Defines terms, not implementation.
> For architecture decisions, see [docs/adr/](docs/adr/).

---

## The Console Pattern (Three-Way-Split)

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Console** | A concrete instance of the three-panel browsing pattern, backed by a route and a data source: **Library** and **LIMS** | — |
| **Master Panel** | The left panel containing the item table — the primary list of browsable things | index, item list, table panel |
| **Detail Panel** | The middle panel showing a summary card for the selected item — key metadata at a glance | summary card, intermediate detail, info panel |
| **Workspace Panel** | The right panel containing the full work surface for the selected item — a slot filled by the item type | canvas, work surface, full detail, editor panel, "more detail panel" |
| **View State** | One of three progressive-disclosure stages: **List**, **Detail**, or **Expanded** | — |

## View States

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **List** | Master Panel full-width, Detail and Workspace hidden. Mental model: "I'm looking for something" | full list, browse mode |
| **Detail** | Master Panel + Detail Panel visible. Mental model: "What is this thing?" | preview, inspect mode |
| **Expanded** | Master Panel collapsed to thin strip + Detail Panel + Workspace Panel all visible. Mental model: "I want to work with this" | edit mode, full view |

## Concrete Consoles

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Library** | The console at `/library` — filesystem-like view over the Folder hierarchy, showing Folders and Entries mixed (folders first) | ELN console, file explorer |
| **LIMS** | The console at `/lims` — database-like flat, filterable, searchable table of Entities | entity console, sample database |

## Items

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Item** | Any row that appears in a Master Panel table. Minimum contract: display ID, name/title, type discriminator, creation timestamp | row, record, list item |
| **Entry** | A single page of narrative lab documentation — unstructured rich-text content. Belongs to exactly one Folder | ELN entry, NotebookEntry, ELN page, notebook page |
| **Entity** | A trackable physical or conceptual lab item with structured, typed properties and a user-assigned Name Column. Belongs to exactly one EntityType | sample (rejected — too narrow), lab item |
| **Folder** | A hierarchical container that owns Entries, Entities, and child Folders. Containers, not content — no Detail or Workspace | directory, project (rejected — implies temporary) |

## Core Organisation

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **User** | A person with an account (username, email, password). Belongs to Groups. Owns Entries, Entities, and Actions they create | account, login |
| **Group** | A named collection of Users — the unit of permission assignment. Permissions are granted to Groups on Folders | team, role |

## ELN Concepts

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Rich-Text Document** | The structured content inside an Entry — a tree of blocks (paragraphs, headings, tables) stored as TipTap/ProseMirror JSON. Distinct from the Entry's metadata | content, document body, editor content, TipTapDoc |
| **Mention** | A parsed passive link from one Entry to another object (Entry or Entity), created when a `#` reference is found in text or a table row references a display ID | reference, link, `#`-ref |
| **Entry Version** *(deferred)* | A point-in-time snapshot of an Entry's rich-text document | revision, snapshot, save point |
| **Reference Node** | An inline TipTap node rendering as a clickable badge linking to another Entry or Entity (e.g., `#E12`). Auto-converted from `#<displayId> ` via input rule | #-tag, inline reference |
| **LimsTable Node** | A Notion-style embedded table block within an Entry's TipTap document, backed by AG Grid. Each row maps to an Entity record | embedded table, inline spreadsheet |

## LIMS Concepts

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Entity Type** | A classification/schema for Entities defining what kind of thing it is (e.g., "DNA", "Buffer"), its display ID prefix, and its JSON property columns | sample type (rejected), category, schema |
| **Name Column** | An implicit, always-present pseudo-column on every Entity Type representing the entity's identity. Not stored in the Column Schema — surfaced as a gray, non-editable row in the ColumnEditor and as an editable text cell (second column, after `#`) in LimsTable nodes. User-assigned; required on save. Stored as `Entity.name` | entity name, title column |
| **Action** | A user-explicit recorded operation performed on an Entity (e.g., "Used", "Measured", "Aliquoted"). Not inferred from text | event, operation, activity |
| **Column Schema** | The JSON array on an Entity Type defining what properties its Entities have — each column has a name, type (Text, Number, Date, Boolean, Reference), optional defaults, units, and description. Does **not** include the Name Column, which is a first-class property | property definitions, field schema |

## Cross-Cutting Concepts

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Display ID** | An auto-generated human-readable identifier in `<PREFIX><N>` format (e.g., `E1`, `DNA42`, `BLOOD3`). Gap-tolerant — deleted IDs are never reclaimed | ID, identifier, ref |
| **Prefix** | The letter portion of a display ID. Static for ELN (`E` → Entry), dynamic for LIMS (EntityType prefix → Entity). Used for reference routing | ID prefix, type prefix |
| **ReferenceBadge** | A clickable UI badge showing a display ID (e.g., `E12`, `BLOOD1`). Clicking navigates to the target's canonical console | badge, ref chip, #-badge |
| **Content Sync Pipeline** | The ordered pipeline that processes an Entry on save: entities synced first (from limsTable nodes), then mentions synced (from reference nodes and Reference columns) | sync pipeline, entry sync |
| **Tree Walker** | A shared depth-first utility that walks a TipTap JSON tree, calling a handler per node. Pure utility — zero domain knowledge | walker, document walker |
| **Breadcrumb** | Navigation bar showing the current folder path as clickable segments in the Library console. Current folder is bold; up-button (`↑`) moves to parent | path bar, nav trail |

## Dedicated URL

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Dedicated URL** | A shareable, bookmarkable URL that resolves to an item's full Workspace as a standalone page (e.g., `/eln/E12`, `/lims/BLOOD1`). Same content as the Workspace in Expanded state | permalink, direct link, standalone URL |
| **EntityWorkspace** | The standalone page at `/lims/:displayId` showing a single Entity's full detail with tabbed Workspace (Properties, Activity, Insights, Storage) | entity detail page, entity permalink |
| **ElnEditor** | The TipTap editor component that renders in two modes: **embedded** (inside the Library's Workspace Panel) and **standalone** (at `/eln/:id`) | entry editor, notebook editor |

## Shared Console Components

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **ConsoleProvider** | React Context holding the View State at the top level of a console page — lets layout react to state changes | ViewContext (deprecated) |
| **ConsolePage** | Shared page-level layout component combining Master-Detail-Expanded structure with CSS class computation for both Library and LIMS | — |
| **ConsoleCollapsedStrip** | Thin vertical strip (~40px) shown when Master Panel is collapsed in Expanded state. Contains a single expand button | collapsed strip, LimsCollapsedStrip (deprecated), LibraryCollapsedStrip (deprecated) |
| **useConsoleView** | Shared hook implementing the View State machine with entry/exit animations (250ms) and transitional states (`isExiting`, `isDetailExiting`) | — |

## Entity Type Management (Settings)

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **TypeMasterPanel** | Settings page listing all Entity Types in a Master table | entity type list |
| **TypeDetailPanel** | Settings page editing a single Entity Type — its name, prefix, icon, columns, and active status | entity type editor |
| **ColumnEditor** | Component for CRUD operations on an Entity Type's column schema entries | column manager, property editor |

## Relationships

- A **Folder** has one parent **Folder** (self-referencing, recursive hierarchy)
- A **Folder** contains many **Entries** and **Entities**
- An **Entry** belongs to exactly one **Folder**
- An **Entry** is authored by exactly one **User**
- An **Entry** has exactly one **Rich-Text Document**
- An **Entry** can have many **Mentions** to other Entries and Entities
- An **Entity** has exactly one **Name Column** (stored as `Entity.name`, user-assigned, required)
- An **Entity** belongs to exactly one **Entity Type**
- An **Entity** belongs to exactly one **Folder**
- An **Entity** optionally has one source **Entry** (where it was created)
- An **Entity** can have many **Actions** recorded against it
- An **Action** optionally references one source **Entry**
- An **Action** is performed by exactly one **User**
- An **Entity Type** defines exactly one **Prefix** for display ID generation
- An **Entity Type** has one **Column Schema** (JSON array of column definitions)
- A **Console** surfaces one or more **Item** types in its Master Panel
- A **Master Panel**, **Detail Panel**, and **Workspace Panel** together form the three-panel layout
- **View State** determines which panels are visible: **List** (Master only), **Detail** (Master + Detail), **Expanded** (Master collapsed + Detail + Workspace)
- Each **Item** type has a dedicated **Workspace** content: Entry → TipTap editor, Entity → tabbed detail view
- A **LimsTable Node** syncs to one or more **Entity** records on save

```
Library Console ──▶ Folder tree (Library is the browsing surface for the folder hierarchy)
LIMS Console ──▶ Entity table (LIMS is the browsing surface for the entity database)

Folder ──┬── Folder (parent/child, recursive)
         ├── Entry (1:N — entry lives in one folder)
         └── Entity (1:N — entity lives in one folder)

Entry ──▶ Mention (1:N — entry can mention many things)
Mention ──▶ Entry | Entity (target of the reference)

Entity ──▶ Action (1:N — entity has many actions recorded)
Action ──▶ Entry (N:1 — optionally recorded in an entry)

EntityType ──▶ Entity (1:N — type classifies many entities)

User ──▶ Entry (1:N — author)
User ──▶ Action (1:N — performer)
User ──▶ Entity (1:N — creator)

Console (abstract) ──▶ Master Panel ──▶ Item table
                    ├── Detail Panel ──▶ summary card
                    └── Workspace Panel ──▶ type-specific work surface (slot)
```

## Key Distinctions

### Console vs Data Model

A **Console** (Library, LIMS) is a UI/UX construct — the three-panel surface users interact with. The **data models** (Folder, Entry, Entity, EntityType) are backend records. Consoles are presentation layers; data models are persistent storage.

### Entry vs Rich-Text Document

An **Entry** is the database record (id, title, author, folder, dates). The **Rich-Text Document** is the content inside it. They are 1:1 but conceptually distinct.

### Entry vs Entity

| Dimension | Entry | Entity |
|-----------|-------|--------|
| Nature | Unstructured narrative | Structured data |
| Content | Rich-Text Document (TipTap blocks) | Typed properties (JSON, schema-driven) |
| Console | Library (within folder hierarchy) | LIMS (flat, filterable) |
| Workspace | TipTap editor | Tabbed detail (Activity, Insights, Storage) |

### Mention vs Action

A **Mention** is a passive link: "I referenced sample #42." An **Action** is an active record: "I used 50µL of sample #42." Mentions are parsed from text; Actions are user-recorded.

### Folder vs Library

A **Folder** is a data-model concept — a node in the folder tree. The **Library** is the Console that lets users navigate the folder hierarchy.

### Master vs Detail vs Workspace

| Panel | Shows | Visible in states | Purpose |
|-------|-------|-------------------|---------|
| **Master** | Item table | All three | "What's available?" |
| **Detail** | Summary card | Detail, Expanded | "What is this thing?" |
| **Workspace** | Full work surface | Expanded only | "I want to work with this" |

The Detail Panel is the **gateway** to the Workspace — you cannot skip from List directly to Expanded.

### List vs Detail vs Expanded

| State | Mental model | Transition |
|-------|-------------|------------|
| **List** | "I'm looking for something" | Open the console |
| **Detail** | "What is this thing?" | Click a row |
| **Expanded** | "I want to work with this" | Click expand in Detail header |

States advance left-to-right and collapse back. Skipping states is not allowed.

## Example Dialogue

> **Dev:** "When a user clicks an **Entity** row in the **LIMS** console's **Master Panel**, does it go straight to the **Workspace**?"

> **Domain expert:** "No — it opens the **Detail Panel** first. The user sees a summary card with the Entity's type, creator, dates, and properties. The **Detail Panel** is the gateway — you always pass through **Detail** state before reaching **Expanded**."

> **Dev:** "So the **Workspace Panel** only slides in when they click expand in the Detail header. And if they click a different row instead?"

> **Domain expert:** "The **Detail Panel** swaps to show the new **Item**'s summary. If they were already in **Expanded** state, we collapse back to **Detail** first — you never jump directly from one **Workspace** to another. The old Workspace exits, the new Detail card slides in, and the user decides whether to expand again."

> **Dev:** "Got it. And a **Folder** — does it go through the same flow?"

> **Domain expert:** "No. A **Folder** is a container, not content. Clicking a Folder in the **Library**'s **Master Panel** navigates *into* it — the table reloads with the folder's children. Folders have no **Detail Panel**, no **Workspace**, and no **Display ID**."

> **Dev:** "What about cross-references? If an **Entry** contains a **Mention** to `#BLOOD1`, and the user clicks the **ReferenceBadge**?"

> **Domain expert:** "That navigates to the **Entity**'s **Dedicated URL** — `/lims/BLOOD1` — full **EntityWorkspace** page. The user leaves the **Library** console. It's a known UX rough edge: we want a tabbed Workspace later that can preview the Entity inline without leaving the Entry editor."

> **Dev:** "And when the user saves an **Entry**, the **Content Sync Pipeline** runs. What order?"

> **Domain expert:** "**Entities** sync first — **LimsTable Nodes** create/update/delete **Entity** records and patch their display IDs back into the document. Then **Mentions** sync — **Reference Nodes** and Reference-type columns are parsed, resolved, and stored. Entities first because a newly created Entity's **Display ID** might be referenced by a Mention in the same document."

> **Dev:** "What about the **Name Column** — is it part of the **Column Schema**?"

> **Domain expert:** "No. The **Name Column** is implicit — every **Entity Type** has one, but it's not stored in the `columns` JSON array. It's a first-class property: `Entity.name`. When you create a column named 'Name' in the **ColumnEditor**, you get blocked — it's already taken as the default identity column."

> **Dev:** "So in the LimsTable, the Name Column always appears second, right after the `#` index column. And the user types the entity name right there in the cell?"

> **Domain expert:** "Exactly. On save, if any Name cell is blank, validation blocks the save with 'Name not filled in.' The old auto-generated names like 'Table row 3' are gone — every entity gets a real user-assigned name now."

## Deprecated Term Mappings

| Old Term | Canonical Replacement |
|----------|---------------------|
| "three-step fold" / "LIMS three-step fold" | "Three-Panel Console" or "Master/Detail/Workspace" |
| LimsCollapsedStrip / LibraryCollapsedStrip | ConsoleCollapsedStrip |
| LimsViewContext / LibraryViewContext | ConsoleProvider |
| LimsDetailCard / LibraryDetailCard | Uses ConsoleDetailPanel shell |
| LimsMoreDetailPanel / LibraryMoreDetailPanel | Uses ConsoleWorkspacePanel shell |
| "more detail panel" | Workspace Panel |
| "sample" | Entity |
| "project" | Folder |
| "ELN browser" / "ELN console" | Library Console |
| ViewState in lims.ts | ViewState in types/console.ts (shared) |

## Flagged Ambiguities

- **"Item"** is used both as the generic term (any row in a Master table) and informally to mean "Entity" in the LIMS context. Prefer the generic meaning; say **Entity** when you mean the LIMS model.
- **"Detail"** names both a **Panel** (the middle panel showing a summary card) and a **View State** (Master + Detail visible, Workspace hidden). Always qualify: say **Detail Panel** or **Detail state** — never bare "Detail."
- **"Expanded"** names both a **View State** and the action of expanding. Prefer "enter Expanded state" or "expand to Workspace" over bare "expanded."
- **"content"** was used to mean both the Rich-Text Document inside an Entry and the children array of any TipTap node. Prefer **"Rich-Text Document"** for the Entry's content and **"child nodes"** or **"children"** for the structural sense.
- **"console"** in some contexts means the terminal/command-line. In domain contexts it means a concrete Console instance (Library or LIMS) following the Console Pattern. Disambiguate by capitalization and context: **Console** (domain, the three-panel browsing surface), console (terminal), browser (web platform).
