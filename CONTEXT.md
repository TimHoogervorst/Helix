# OpenScience — Domain Glossary

> This is the canonical glossary. It defines terms, not implementation. For architecture decisions, see [docs/adr/](docs/adr/).

---

## Core Concepts

### Folder

A hierarchical container that owns Notebook Entries, Entities, and child Folders. Folders form a tree — the primary organizational structure of the system. Permissions are assigned to Folders and inherit downward. Users navigate the folder tree through the Library browser.

Folders are **containers, not content.** They have no Detail panel, no Workspace, and no metadata beyond a name. Clicking a Folder in the Master table always navigates *into* it — there is no intermediate inspection step. Folders exist solely to provide a place where other Items live.

**Synonyms:** directory, project (rejected — "project" implies a temporary endeavor; Folders are a permanent organizational structure)

### User

A person with an account. Has a username, email, password. Belongs to one or more Groups. Owns the entries and entities they create.

### Group

A named collection of Users. Groups are the unit of permission assignment — permissions are granted to Groups on Folders, not directly to Users.

---

## The Browser Pattern

The platform uses a single, canonical UI pattern for browsing, inspecting, and working with content. Two concrete browsers implement this pattern: the **Library** (filesystem-like browsing of Folders and Entries) and **LIMS** (database-like browsing of Entities). Future browsers (e.g., a Protocol browser, a Plate browser) follow the same pattern.

### Three-Panel Browser

A progressive-disclosure layout with three panels that reveal more information as the user drills deeper into an item. Not all panels are visible at all times — the current **View State** determines which panels are shown.

### View State

The three stages of progressive disclosure in a browser. Every browser begins in **List** state and advances to **Detail** and **Expanded** as the user selects and drills into items.

| State | Master Panel | Detail Panel | Workspace Panel | User Action |
|-------|-------------|-------------|-----------------|-------------|
| **List** | Full-width table | Hidden | Hidden | First thing the user sees when opening a browser |
| **Detail** | Visible (shared width) | Slides in from right | Hidden | User clicks a row — sees summary info without leaving the list |
| **Expanded** | Collapsed to thin strip | Visible | Slides in from right | User expands to work with the item — edit, review history, relate |

**Invariant:** View State advances left-to-right (List → Detail → Expanded) and can collapse back (Expanded → Detail → List). Skipping states is not allowed — you cannot jump from List directly to Expanded.

### Master Panel

The left panel. Contains the **item table** — the primary list of browsable things (Entities, Entries, Folders). In List and Detail states, it's a full or shared-width table. In Expanded state, it collapses to a thin vertical strip with a single expand button.

**Synonyms:** index, item list, table panel

### Detail Panel

The middle panel. Shows a **summary card** for the selected item — key metadata at a glance (type, creator, dates, properties). The user sees this before committing to the full Workspace. Visible in Detail and Expanded states.

**Synonyms:** summary card, intermediate detail, info panel

### Workspace Panel

The right panel. Launches when the user enters **Expanded** state. Contains the **full work surface** for the selected item. What renders inside the Workspace depends on the item type:

- **ELN Entry** → TipTap editor (rich-text editing surface)
- **LIMS Entity** → Tabbed detail view (Activity, Insights, Storage)
- **Plugin-provided type** → Plugin's custom work surface (e.g., DNA sequence editor)

The Workspace is a **slot** — the browser provides the container, the item type provides the content. This is the extension point for future modding/plugin APIs.

Every Workspace has a **dedicated URL** that resolves to the item's full work surface (e.g., `/eln/E12` for an Entry editor, `/lims/BLOOD1` for an Entity's full detail). These URLs are shareable and bookmarkable — they are the canonical address of the Workspace, independent of the browser context. The browser's Expanded state embeds the same Workspace content in the three-panel layout; the dedicated URL renders it as a standalone page.

**Invariant:** The Workspace is always launched from the Detail panel. The Detail panel remains visible in Expanded state to preserve context ("what am I working on?").

**Synonyms:** canvas, work surface, full detail, editor panel

### Item

Any row that appears in a Master panel table. An Item is the generic "thing you can click on" in a browser. Concrete item types include:

- **Entity** — structured lab data (appears only in LIMS browser)
- **Entry** — narrative notebook content (appears only in Library browser)
- **Folder** — navigable container (Library browser only — clicking navigates *into* the folder rather than opening a Detail panel; no display ID or metadata)
- **Plugin types** — future extension point

The Item type determines which browser(s) surface it, what the Detail card shows, and what renders in the Workspace. An Item type belongs to exactly one browser — Entities do not appear in the Library Master table, and Entries do not appear in the LIMS Master table. Cross-references (ReferenceBadges) can point across browsers, but the Master/Detail/Workspace flow stays within a single browser.

**Invariant:** Every *inspectable* Item (Entity, Entry, plugin types) has a display ID, a name/title, a type discriminator, and a creation timestamp. These are the minimum columns every Master table renders. Folders are the exception — they are Items with navigate behavior but no Detail/Workspace support.

**Synonyms:** row, record, list item

### Browser

A concrete instance of the Three-Panel Browser pattern, backed by a route and a data source. The platform currently has two browsers:

- **Library** at `/library` — filesystem-like browsing over the Folder hierarchy
- **LIMS** at `/lims` — database-like browsing over Entities

Each browser is a self-contained experience with its own Master table, Detail cards, and Workspace content. They share the same panel layout, animation system, and View State machine — but differ in their data sources, search/filter behavior, and Workspace content types.

---

## Library Browser

### Library

The **browser** at `/library` that presents a unified, filesystem-like view over the Folder hierarchy. At any folder level, both child Folders and Entries appear together in a single Master table, sorted with folders first. The Library is a *browsing surface* — it is not a data model, but a presentation model layered on top of the Folder tree.

The Library's Master table renders two Item types: **Folders** (navigated into) and **Entries** (selected for Detail/Workspace). When new content types are added (PDFs, spreadsheets, protocols), they appear in the same mixed table with their own type icon and label.

**Invariant:** Every Item surfaced in the Library belongs to exactly one Folder (or lives at root).

**Synonyms:** file explorer, ELN browser (previous name — now means the entry editor specifically)

### Breadcrumb

The navigation bar at the top of the Library browser showing the current folder path as clickable segments. Each segment is a link to that folder level. The current folder is displayed as bold text (not a link). An up-navigation button (`↑`) moves to the parent folder.

**Invariant:** The breadcrumb always reflects the current `?path=` URL parameter. Clicking a breadcrumb segment updates the path and reloads the Master table.

---

## LIMS Browser

### LIMS

The **browser** at `/lims` that presents a database-like view over Entities. Unlike the Library (which mixes Folders and Entries in a hierarchical view), the LIMS browser shows a flat, filterable, searchable table of Entities. There is no folder navigation — the Master table is the primary interaction surface.

The LIMS Master table renders one Item type: **Entities**. Rows are filterable by Entity Type (via a dropdown) and searchable by display ID or name.

**Synonyms:** entity browser, sample database

---

## ELN Concepts

### Notebook Entry (or "ELN Entry")

A single page of narrative lab documentation. Has a title, rich-text content, an author, a folder, and timestamps. The primary unit of scientific narrative in the system.

An entry is the *whole thing* — metadata + document content. It is not the document.

**Invariant:** An entry belongs to exactly one Folder.

**Synonyms:** entry, ELN page, notebook page

### Rich-Text Document

The structured content *inside* a Notebook Entry. A tree of blocks (paragraphs, headings, lists, tables) stored as a TipTap/ProseMirror JSON document. The document is the editable, renderable content — distinct from the entry's metadata (title, author, folder, dates).

**Invariant:** A document belongs to exactly one Notebook Entry.

**Synonyms:** content, document body, editor content

### Mention

A parsed reference from one Notebook Entry to another object (another Entry, an Entity, or — later — any referenceable thing). Created when a `#` reference is found in the entry text or when a `reference` node or `limsTable` row references a display ID. The Mention stores the source entry, the target object, and the surrounding context text.

**Invariant:** A Mention has exactly one source entry and exactly one target object.

**Cross-browser navigation:** Clicking a ReferenceBadge for a Mention navigates to the target's canonical browser — `#BLOOD1` opens the LIMS browser, `#E12` opens the Library browser. This is a known UX rough edge in pre-1.0: the user leaves their current context. A future tabbed-Workspace feature will allow inline preview of cross-references without leaving the current browser.

**Synonyms:** reference, link, `#`-ref

### Entry Version *(deferred)*

A point-in-time snapshot of an entry's rich-text document. When a user saves changes, a new Version is created. The current document is always the latest version; older versions are immutable history.

**Synonyms:** revision, snapshot, save point

---

## LIMS Concepts

### Entity

A trackable physical or conceptual item in the lab. Has a name, a type (EntityType), a display ID, extensible JSON properties, and a folder. Examples: a DNA sample, a chemical reagent, a buffer solution, a piece of equipment.

An Entity is *structured data* — it has typed properties and a known schema (via its EntityType). This distinguishes it from a Notebook Entry, which is *unstructured narrative*.

**Invariant:** An Entity has exactly one EntityType.

**Synonyms:** sample (rejected — too narrow; entities include reagents, equipment, etc.), item

### Entity Type

A classification of Entities. Defines what kind of thing an Entity is (e.g., "DNA", "Chemical", "Buffer", "Equipment"). Carries a schema (`columns`) that defines the JSON properties an Entity of this type can have — each column has a name, type (Text, Number, Date, Boolean, Reference), and optional defaults, units, and description.

Each EntityType has a unique `prefix` (e.g., "DNA", "BLOOD") used to auto-generate display IDs and route references.

**Synonyms:** sample type (rejected — same reason as above), category, schema

### Action

A recorded operation performed on an Entity by a User. Has a type (e.g., "Used", "Created", "Measured", "Noted"), the performer, optional data (e.g., `{"volume_ul": 50}`), and an optional source Notebook Entry (the entry where this action was recorded).

Actions are **user-explicit** — the user records them deliberately. They are not inferred from text.

**Invariant:** An Action acts on exactly one Entity.

**Synonyms:** event, operation, activity

---

## Relationship Summary

```
Library Browser ──▶ Folder tree (the Library is the browsing surface for the folder hierarchy)
LIMS Browser ──▶ Entity table (the LIMS is the browsing surface for the entity database)

Folder ──┬── Folder (parent/child, recursive)
         ├── NotebookEntry (1:N — entry lives in one folder)
         └── Entity (1:N — entity lives in one folder)

NotebookEntry ──▶ Mention (1:N — entry can mention many things)
Mention ──▶ NotebookEntry | Entity (target of the reference)

Entity ──▶ Action (1:N — entity has many actions recorded)
Action ──▶ NotebookEntry (N:1 — action optionally recorded in an entry)

EntityType ──▶ Entity (1:N — type classifies many entities)

User ──▶ NotebookEntry (1:N — author of entries)
User ──▶ Action (1:N — performer of actions)
User ──▶ Entity (1:N — creator of entities)

Browser (abstract) ──▶ Master Panel ──▶ Item table
                    ├── Detail Panel ──▶ summary card
                    └── Workspace Panel ──▶ type-specific work surface
```

---

## Key Distinctions

### Browser vs Data Model

A **Browser** (Library, LIMS) is a UI/UX construct — the three-panel surface users interact with. The **data models** (Folder, NotebookEntry, Entity, EntityType) are the backend records. Browsers are presentation layers; data models are persistent storage. The same Entity can appear in the LIMS browser (as a Master row) and in the Library browser (as a referenced badge in an Entry's content).

### Library vs Folder

A **Folder** is a data-model concept — a node in the folder tree with a parent, a name, and contents. The **Library** is the browser that lets users navigate, search, and open items within the folder hierarchy. The Library shows a mixed list of folders and entries at any path; folders are navigated *into*, entries are opened.

### Entry vs Entity

| Dimension | Notebook Entry | Entity |
|-----------|---------------|--------|
| Nature | Unstructured narrative | Structured data |
| Content | Rich-text document (blocks) | Typed properties (JSON) |
| Identity | Title + content | Name + display ID + type |
| Lifecycle | Authored, edited, versioned | Created, tracked, acted upon |
| Browser | Library (with folder context) | LIMS (flat, filterable, searchable) |
| Workspace | TipTap editor | Tabbed detail view (Activity, Insights, Storage) |

### Entry vs Document

An **Entry** is the database record (id, title, author, folder, dates). The **Document** is the rich-text content inside it. They are 1:1 but conceptually distinct — the document format can change independently of the entry model.

### Mention vs Action

A **Mention** is a passive link: "I referenced sample #42." An **Action** is an active record: "I used 50µL of sample #42." Mentions are parsed from text; Actions are user-recorded.

### Master vs Detail vs Workspace

| Panel | Shows | Visible in states | Purpose |
|-------|-------|-------------------|---------|
| **Master** | Item table | All three | "What's available?" — browse, search, filter |
| **Detail** | Summary card | Detail, Expanded | "What is this?" — inspect metadata before committing |
| **Workspace** | Full work surface | Expanded only | "Let me work with this" — edit, review, relate |

The Detail panel is the **gateway** to the Workspace. Users see the summary, decide whether to engage, then expand to the Workspace. This prevents the cognitive cost of loading a full editor or detail view for every clicked row.

### List vs Detail vs Expanded

| State | Mental model | User action to enter |
|-------|-------------|---------------------|
| **List** | "I'm looking for something" | Open the browser |
| **Detail** | "What is this thing?" | Click a row |
| **Expanded** | "I want to work with this" | Click expand button in Detail header |
