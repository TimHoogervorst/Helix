# Helix — Domain Glossary

> This is the canonical glossary. It defines terms, not implementation. For architecture decisions, see [docs/adr/](docs/adr/). For the mod system architecture, see [docs/mod-system.md](docs/mod-system.md).

---

## The Mod System

> The platform is structured around a **mod system**. Everything — LIMS, ELN, Library, Settings, Pins — is a mod. Core is the thin shell that loads mods and provides the frame they render into. Both internal (core mods) and future external mods use the same `register*()` API.

| Term | Definition |
|------|-----------|
| **Mod** | A self-contained unit of functionality registered into Core. Owns consoles, workspaces, detail cards, settings, routes, and commands. |
| **Core** | The immutable app shell: Layout, Router, Console panels, Mod Loader, Mod Registry, Reference resolution, API client. |
| **Core Mod** | A mod under `core-mods/` that ships with the repo. Always loaded. Uses the same API as future external mods. |
| **Mod Registry** | Central data structure populated at boot by all `register*()` calls. Drives route generation, sidebar nav, detail/workspace resolution. |
| **Workspace** | A mod's dedicated work surface for a type of content. Declared via `registerWorkspace({ id, displayName })` — the `id` doubles as the URL namespace (`/{workspaceId}/{displayId}`) and as the identifier used by Mentions to build navigation targets. Any mod that registers a workspace is automatically discoverable by the mention system and the pins/bookmarks system. |

### Workspace Registration

Workspaces are a first-class registration in the mod system. A mod calls `registerWorkspace()` during boot, providing:

- **id** — the mod's unique identifier (e.g. `"eln"`, `"lims"`, `"molBio"`). Doubles as the URL namespace.
- **displayName** — human-readable label (e.g. `"Electronic Lab Notebook"`).

The workspace URL is **derived by convention**, not configured: `/{workspaceId}/{displayId}`. If a mod has `id: "molBio"` and registers an entity type with prefix `DNA`, the URL for `DNA34` is `/molBio/DNA34` — no route configuration needed.

This convention is the single integration point that makes the mention system, pins/bookmarks, and navigation work automatically for any mod that registers a workspace. A mod does not need to provide mention-specific wiring — it only needs to register its workspace and entity types with LIMS.

---

## Core Concepts

### Folder

A hierarchical container that owns Notebook Entries, Entities, and child Folders. Folders form a tree — the primary organizational structure of the system. Permissions are assigned to Folders and inherit downward. Users navigate the folder tree through the Library console.

Folders are **containers, not content.** They have no Detail panel, no Workspace, and no metadata beyond a name. Clicking a Folder in the Master table always navigates *into* it — there is no intermediate inspection step. Folders exist solely to provide a place where other Items live.

**Synonyms:** directory, project (rejected — "project" implies a temporary endeavor; Folders are a permanent organizational structure)

### User

A person with an account. Has a username, email, password. Belongs to one or more Groups. Owns the entries and entities they create.

### Group

A named collection of Users. Groups are the unit of permission assignment — permissions are granted to Groups on Folders, not directly to Users.

---

## The Console Pattern

The platform uses a single, canonical UI pattern for browsing, inspecting, and working with content. Two concrete consoles implement this pattern: the **Library** (filesystem-like browsing of Folders and Entries) and **LIMS** (database-like browsing of Entities). Future consoles (e.g., a Protocol console, a Plate console) follow the same pattern.

### Three-Panel Console

A progressive-disclosure layout with three panels that reveal more information as the user drills deeper into an item. Not all panels are visible at all times — the current **View State** determines which panels are shown.

### View State

The three stages of progressive disclosure in a console. Every console begins in **List** state and advances to **Detail** and **Expanded** as the user selects and drills into items.

| State | Master Panel | Detail Panel | Workspace Panel | User Action |
|-------|-------------|-------------|-----------------|-------------|
| **List** | Full-width table | Hidden | Hidden | First thing the user sees when opening a console |
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

The right panel. Launches when the user enters **Expanded** state. Contains the **full work surface** for the selected item. What renders inside the Workspace depends on the item type, resolved through the Mod Registry:

- **ELN Entry** (`eln.entry`) → TipTap editor (rich-text editing surface)
- **LIMS Entity** (`lims.entity`) → Tabbed detail view (Activity, Insights, Storage)
- **Mod-provided type** → Mod's custom work surface (e.g., DNA sequence editor from a MolBio mod)

The Workspace is a **slot** — the console provides the container, the workspace type provides the content. Workspace types registered via `registerWorkspace()` can override the console's default workspace component; if they don't, the console's default workspace is used.

Every Workspace has a **dedicated URL** that resolves to the item's full work surface (e.g., `/eln/E12` for an Entry editor, `/lims/BLOOD1` for an Entity's full detail). These URLs are auto-registered from `registerWorkspace({ route })` and handled by the generic `<WorkspacePage>` component. The workspace component **fetches its own data** — WorkspacePage passes `displayId` as a prop and provides a loader (Suspense fallback) and error boundary.

**Synonyms:** canvas, work surface, full detail, editor panel

### Item

Any row that appears in a Master panel table. An Item is the generic "thing you can click on" in a console. Concrete item types include:

- **Entity** — structured lab data (appears only in LIMS console)
- **Entry** — narrative notebook content (appears only in Library console)
- **Folder** — navigable container (Library console only — clicking navigates *into* the folder rather than opening a Detail panel; no display ID or metadata)
- **Mod-provided types** — registered via `registerWorkspace()`, can appear in any console that accepts them

The Item type determines which console(s) surface it, what the Detail card shows, and what renders in the Workspace. An Item type belongs to exactly one console — Entities do not appear in the Library Master table, and Entries do not appear in the LIMS Master table. Cross-references (ReferenceBadges) can point across consoles, but the Master/Detail/Workspace flow stays within a single console.

**Invariant:** Every *inspectable* Item (Entity, Entry, plugin types) has a display ID, a name/title, a type discriminator, and a creation timestamp. These are the minimum columns every Master table renders. Folders are the exception — they are Items with navigate behavior but no Detail/Workspace support.

**Synonyms:** row, record, list item

### Console

A concrete instance of the Three-Panel Console pattern, backed by a route and a data source. Each console is registered by a mod via `registerConsole()` and auto-appears in the sidebar navigation. The platform currently has two consoles:

- **Library** at `/library` — registered by the Library core mod. Filesystem-like browsing over the Folder hierarchy. `accepts: { only: ['eln.entry'] }`.
- **LIMS** at `/lims` — registered by the LIMS core mod. Database-like browsing over Entities. `accepts: { except: ['eln.entry'] }`.

Each console provides **default renderers** (row, detail card, workspace) that individual workspace types (registered via `registerWorkspace()`) can override. The console declares which workspace types it accepts via `accepts` (whitelist or blacklist); the workspace declares which consoles it belongs to via `consoleIds`. Both must agree for a workspace to appear in a console.

Consoles are a **presentation layer** — not data models. The console shell components (ConsolePage, ConsoleMasterPanel, ConsoleDetailPanel, ConsoleWorkspacePanel) live in `core/console/` and are view-state agnostic. Console instances live in their mod's `console/` directory.

---

## Library Console

### Library

The **console** at `/library` that presents a unified, filesystem-like view over the Folder hierarchy. At any folder level, both child Folders and Entries appear together in a single Master table, sorted with folders first. The Library is a *browsing surface* — it is not a data model, but a presentation model layered on top of the Folder tree.

The Library's Master table renders two Item types: **Folders** (navigated into) and **Entries** (selected for Detail/Workspace). When new content types are added (PDFs, spreadsheets, protocols), they appear in the same mixed table with their own type icon and label.

**Invariant:** Every Item surfaced in the Library belongs to exactly one Folder (or lives at root).

**Synonyms:** file explorer, ELN console (previous name — now means the entry editor specifically)

### Breadcrumb

The navigation bar at the top of the Library console showing the current folder path as clickable segments. Each segment is a link to that folder level. The current folder is displayed as bold text (not a link). An up-navigation button (`↑`) moves to the parent folder.

**Invariant:** The breadcrumb always reflects the current `?path=` URL parameter. Clicking a breadcrumb segment updates the path and reloads the Master table.

---

## LIMS Console

### LIMS

The **console** at `/lims` that presents a database-like view over Entities. Unlike the Library (which mixes Folders and Entries in a hierarchical view), the LIMS console shows a flat, filterable, searchable table of Entities. There is no folder navigation — the Master table is the primary interaction surface.

The LIMS Master table renders one Item type: **Entities**. Rows are filterable by Entity Type (via a dropdown) and searchable by display ID or name.

**Synonyms:** entity console, sample database

---

## ELN Concepts

### Notebook Entry (or "ELN Entry")

A single page of narrative lab documentation. Has a title, rich-text content (the Document), an author, a folder, timestamps, a status, and zero or more Tags. The primary unit of scientific narrative in the system.

An entry is the *whole thing* — metadata + document content. It is not the document.

**Invariant:** An entry belongs to exactly one Folder.

**Synonyms:** entry, ELN page, notebook page

### Entry Status

A user-settable lifecycle marker on a Notebook Entry. Two states: **In Progress** (the entry is being actively authored) and **Finished** (the entry is complete). The status is displayed as a pill-shaped badge in the metadata panel and is changed via a dropdown — no separate workflow or approval step.

When an entry's status changes, the new status **cascades** to every Entity whose `source_entry` is this entry — i.e., entities that were *created in* this entry. Entities merely *referenced* (via Mentions) are not affected. See [ADR 0005](docs/adr/0005-entry-status-cascade.md).

**Synonyms:** state, lifecycle marker

### Tag

A user-created label that can be attached to a Notebook Entry. Each Tag has a **name** and a **color** (chosen from a preset palette of semantic design tokens). Tags are reusable across entries — creating a tag on one entry makes it available for all entries. Tags have no hierarchy, no permissions, and no independent lifecycle.

Tags are managed **inline** on the entry page: users create, search, attach, and detach tags without leaving the entry. There is no global tag management interface.

**Invariant:** A Tag's name is unique (case-insensitive). A Tag's color comes from the preset palette.

**Synonyms:** label, chip, keyword

### Description

The summary paragraph of a Notebook Entry — a short, human-readable overview of what the entry is about. The Description is **not a separate database field**; it is stored as part of the Rich-Text Document (the TipTap JSON content). It is rendered above the main document body with distinct styling (muted color, larger text) and can be edited inline alongside the title.

### Breadcrumb

*(In the ELN Workspace context.)* The navigation bar at the top of the ELN Workspace showing the entry's folder path as clickable segments. Each segment links to that folder level in the Library console. Derived from the entry's `folder.path` property. When the entry has no folder, only the entry display ID is shown.

**Distinction from Library Breadcrumb:** The Library breadcrumb shows the *current browsing location* in the folder tree. The ELN breadcrumb shows the *entry's home location* — where it lives. Both use the same visual pattern and link to the same Library URLs.

### Shared URL

A read-only link to a Notebook Entry's Workspace. The current implementation is the entry's canonical URL (`/eln/{display_id}`) — no token, no access control, no separate shared view. Anyone with the URL can view the entry. This is a placeholder; a proper sharing model with tokens, permissions, and a shared-view page is deferred to a future PRD.

### Linked Entity

An entity (from the LIMS domain) that is connected to a Notebook Entry through the Mention system. When a user references an entity in the TipTap content (via `@` or a `reference` node), a Mention row is created linking the entry to that entity. The Linked Entities section of the metadata panel renders these Mentions — showing the entity's type icon, name, and display ID. Each is clickable, navigating to the entity's Workspace in the LIMS console.

**Distinction from entities created in the entry:** Entities whose `source_entry` is this entry (created via LIMS tables in the content) are connected through a direct FK, not through Mentions. They may or may not appear as Linked Entities. A future PRD will unify both connection types in the panel.

### Rich-Text Document

The structured content *inside* a Notebook Entry. A tree of blocks (paragraphs, headings, lists, tables) stored as a TipTap/ProseMirror JSON document. The document is the editable, renderable content — distinct from the entry's metadata (title, author, folder, dates).

**Invariant:** A document belongs to exactly one Notebook Entry.

**Synonyms:** content, document body, editor content

### Protocol

A reusable procedure definition managed in Settings. Has a **name** and an ordered list of **items** (Steps and Notes). Protocols are created once and can be inserted as blocks into many Notebook Entries.

Protocols are managed through the Settings shell (`/settings?section=eln.protocol-settings`) using a master-detail UI consistent with other settings sections.

**Invariant:** A Protocol's name must be non-empty.

**Synonyms:** procedure, SOP, method

### Protocol Item

A single element in a Protocol's ordered item list. Each item has a `type` (either **step** or **note**) and a `text` string. Items are ordered — the sequence matters.

### Step

A checkable protocol item — an action the user performs during the protocol. Rendered with a toggleable circle/checkmark icon and a description. Steps can be marked complete with a timestamp. Only Steps (not Notes) have completion state.

**Invariant:** A Step belongs to exactly one Protocol.

### Note

A non-checkable protocol item providing extra context, warnings, or explanations within a protocol. Rendered as plain text without a checkbox. Notes cannot be marked complete.

### Protocol Block

An inline instance of a Protocol inside a Notebook Entry's Rich-Text Document. When a user inserts a Protocol Block via `/protocol` and selects a Protocol definition, the definition's name and items are **snapshotted** into the block at insert time. After insertion, the block is immutable — changes to the original Protocol definition do not propagate to existing blocks.

The block is a TipTap void node rendered via React NodeView. It stores:
- `protocolId` — FK back to the Protocol definition (for provenance)
- `name` — snapshotted protocol name
- `items` — snapshotted ordered list of Steps and Notes
- `stepStates` — per-instance completion tracking: `{ [stepIndex]: { completed: boolean, completedAt?: timestamp } }`

**Why snapshot instead of live reference:** Traceability. The block must record exactly what protocol was used at the time of the experiment. A live reference would silently change historical entries when a protocol definition is updated.

**Synonyms:** embedded protocol, protocol reference

### Step State

The per-instance completion status of a Step inside a Protocol Block. Tracked as a map keyed by step index within the block's attributes. Checking off a step records the timestamp; unchecking clears it. Step States only exist for items with `type: "step"` — Notes have no completion state.

**Synonyms:** step completion, checkbox state

### Mention

A parsed reference from one Notebook Entry to another object (another Entry, an Entity, or any registered entity type). Created when a `#` reference is found in the entry text or when a `reference` node or `limsTable` row references a display ID. The Mention stores the source entry, the target object, and the surrounding context text.

**Resolution chain:** The Mention system is a **listener** to LIMS — it does not encode entity type or workspace knowledge itself. Resolution follows a single chain:

1. `displayId` (e.g. `DNA34`) → extract prefix (`DNA`)
2. Prefix → look up in LIMS's registered entity types → find the owning workspace (`molBio`)
3. Build URL by convention: `/{workspaceId}/{displayId}` → `/molBio/DNA34`

The server's resolve endpoint (`POST /api/mentions/resolve/`) returns `workspaceId` alongside resolved metadata. The frontend uses the convention to build navigation URLs — no hardcoded type-to-URL branching.

**Invariant:** A Mention has exactly one source entry and exactly one target object. Every mentionable entity type is registered with LIMS, which owns the prefix→workspace mapping.

**Cross-workspace navigation:** Clicking a MentionBadge navigates to the target entity's workspace via `/{workspaceId}/{displayId}`. This works for any registered entity type without per-type wiring — a MolBio DNA sequence resolves and navigates the same way a LIMS sample does.

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

### Registered Entity Type

A declaration by a mod that it contributes an entity type to the LIMS registry. The registration provides:

- **prefix** — the letter prefix for display IDs (e.g. `"DNA"`, `"E"`). Unique across all registrations; LIMS validates no collisions.
- **entityType** — the ContentType name (e.g. `"dna_sequence"`, `"eln_entry"`).
- **workspaceId** — the workspace that owns entities of this type. Used by Mentions to build navigation URLs.
- **displayName** — human-readable label (e.g. `"DNA Sequence"`).

LIMS is the **gatekeeper** for all entity type registrations. Mods register via `registry.call("lims.registerEntityType", {...})` at boot. The backend stores registrations in a `RegisteredEntityType` model; the resolve endpoint joins through it to map any `displayId` to its owning workspace.

**Registration flow:** Mod boot → `register()` → `registry.call("lims.registerEntityType", {...})` → LIMS validates prefix uniqueness and stores the registration. Both the frontend (in-memory registry) and backend (`RegisteredEntityType` table) hold the mapping.

**Invariant:** Every prefix is owned by exactly one entity type. The prefix `E` is reserved for ELN Entries (registered as a custom entity type). The backend `RegisteredEntityType.prefix` has a `unique=True` constraint.

**Out of scope (for now):** custom entity behaviors (DNA sequence viewer, GC analysis), per-entity-type action sets, dynamic registration after boot.

### Entity Action

A user-explicit operation recorded on an Entity. Has a type (e.g., "Used", "Created", "Measured", "Noted"), the performer, optional data (e.g., `{"volume_ul": 50}`), and an optional source Notebook Entry (the entry where this action was recorded).

Entity Actions are **user-explicit** — the user records them deliberately. They are not inferred from text. Distinct from the cross-mod [Action Log](#action-log) entry below.

**Invariant:** An Entity Action acts on exactly one Entity.

**Synonyms:** entity event, entity operation, entity activity

### Action Log Entry

A framework-logged record of any mutating operation in the system. Created automatically by the `log_action()` dispatcher — not manually by users. Each entry records: who performed the operation (`performed_by`), what they did (`action_type`), what record they acted on (`target_type`, `target_id`), when (`created_at`), and relevant metadata about what changed (`metadata` JSON).

Action log entries are the **audit trail** for CFR Part 11 compliance. Every mod owns its own action table via `register_action_model()`. Action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"` (e.g. `"eln.entry.created"`, `"eln.table.edited"`).

**Invariant:** An action log entry belongs to exactly one mod's action table. Action logging failure must never break the operation being logged.

**Synonyms:** audit record, action log row, logged action

---

## Sidebar & Navigation

### Pinned Workspace

A workspace (Entity or Entry) that a User has bookmarked for quick access. Pinned Workspaces appear in the sidebar's Workspace section and persist across sessions. Each pin stores the target's **display ID**, a human-readable **label**, and the **dedicated URL** for navigation.

Clicking a Pinned Workspace navigates directly to its dedicated URL. The sidebar also shows the **current** workspace — the workspace the user is actively viewing — with a "Current" badge. If the current workspace is not yet pinned, it appears as a temporary row at the top of the list with a pin button. Pinning it moves it into the pinned list.

**Lifecycle:**
- A User pins a workspace via the sidebar (hover to reveal the pin button on the Current row)
- A User unpins a workspace via the sidebar (hover to reveal the unpin button on a pinned row)
- If the current workspace is unpinned while being viewed, it moves from the pinned list back to the temporary Current slot
- Pinned Workspaces are ordered newest-first by pin time

**Invariant:** A Pinned Workspace belongs to exactly one User. A User cannot pin the same workspace URL twice.

**Out of scope:** workspace history (recently opened), inline workspace previews, drag-to-reorder.

**Synonyms:** bookmarked workspace, saved workspace, workspace tab

---

## Relationship Summary

```
Library Console ──▶ Folder tree (the Library is the browsing surface for the folder hierarchy)
LIMS Console ──▶ Entity table (the LIMS is the browsing surface for the entity database)

Folder ──┬── Folder (parent/child, recursive)
         ├── NotebookEntry (1:N — entry lives in one folder)
         └── Entity (1:N — entity lives in one folder)

NotebookEntry ──▶ Mention (1:N — entry can mention many things)
NotebookEntry ──▶ Tag (M:N — entry can have many tags; tags belong to many entries)
NotebookEntry ──▶ ProtocolBlock (1:N — entry content can contain many protocol blocks)
Mention ──▶ NotebookEntry | Entity (target of the reference)

Protocol ──▶ Protocol Item (1:N — protocol has ordered items)
Protocol Item ──▶ Step | Note (discriminated by type field)
ProtocolBlock ──▶ Protocol (N:1 — block snapshots a protocol at insert time; no live link)

Entity ──▶ Action (1:N — entity has many actions recorded)
Entity ──▶ NotebookEntry (N:1 — source_entry, the entry where this entity was created)
Action ──▶ NotebookEntry (N:1 — action optionally recorded in an entry)

EntityType ──▶ Entity (1:N — type classifies many entities)
RegisteredEntityType ──▶ EntityType (1:1 — registration links an entity type to a workspace)
RegisteredEntityType ──▶ Workspace (N:1 — registration declares which workspace owns the entity type)

Tag (standalone — reusable labels with name + color, managed inline on entries)

User ──▶ NotebookEntry (1:N — author of entries)
User ──▶ Action (1:N — performer of actions)
User ──▶ Entity (1:N — creator of entities)
User ──▶ PinnedWorkspace (1:N — user bookmarks workspaces)

NotebookEntry.status ──cascades to──▶ Entity.status (only via source_entry FK)

Console (abstract) ──▶ Master Panel ──▶ Item table
                    ├── Detail Panel ──▶ summary card
                    └── Workspace Panel ──▶ type-specific work surface (slot)

ModLoader ──▶ Mod Registry (populated by register*() calls from mod index.ts files)
              ├── Registered Consoles → sidebar nav + routes
              ├── Registered Workspaces → workspace resolution + URL building + mention targets
              ├── Registered Entity Types → prefix→workspace mapping (held by LIMS)
              ├── Registered Settings Sections → settings shell panels
              ├── Registered Slash Commands → ELN slash menu
              ├── Registered Sidebar Actions → sidebar row buttons
              └── Registered Services → mod-to-mod communication (e.g. lims.registerEntityType)
```

---

## Key Distinctions

### Console vs Data Model

A **Console** (Library, LIMS) is a UI/UX construct — the three-panel surface users interact with. The **data models** (Folder, NotebookEntry, Entity, EntityType) are the backend records. Consoles are presentation layers; data models are persistent storage. The same Entity can appear in the LIMS console (as a Master row) and in the Library console (as a referenced badge in an Entry's content).

### Library vs Folder

A **Folder** is a data-model concept — a node in the folder tree with a parent, a name, and contents. The **Library** is the console that lets users navigate, search, and open items within the folder hierarchy. The Library shows a mixed list of folders and entries at any path; folders are navigated *into*, entries are opened.

### Entry vs Entity

| Dimension | Notebook Entry | Entity |
|-----------|---------------|--------|
| Nature | Unstructured narrative | Structured data |
| Content | Rich-text document (blocks) | Typed properties (JSON) |
| Identity | Title + content | Name + display ID + type |
| Lifecycle | Authored, edited, versioned | Created, tracked, acted upon |
| Console | Library (with folder context) | LIMS (flat, filterable, searchable) |
| Workspace | TipTap editor | Tabbed detail view (Activity, Insights, Storage) |

### Entry vs Document

An **Entry** is the database record (id, title, author, folder, dates). The **Document** is the rich-text content inside it. They are 1:1 but conceptually distinct — the document format can change independently of the entry model.

### Mention System vs LIMS

The **Mention system** (frontend: `core/mentions/`, backend: `core/mentions/`) is the **consumer** — it resolves references and renders navigation badges. **LIMS** is the **registry** — it owns the entity type→workspace mapping. The mention system asks LIMS "where does this display ID belong?" and uses the answer to build a URL. Neither system hardcodes knowledge of the other's entity types or workspaces. A new mod registers with LIMS, and the mention system picks it up automatically through the standard resolution chain.

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
| **List** | "I'm looking for something" | Open the console |
| **Detail** | "What is this thing?" | Click a row |
| **Expanded** | "I want to work with this" | Click expand button in Detail header |

---

## Design Language

> Visual design terms that form the ubiquitous language for UI decisions. For the full reference document, see [docs/styling-guide.md](docs/styling-guide.md).

### Semantic Icon Size

A named icon size token — not an ad-hoc pixel value. The three canonical sizes are **sm** (14px, for inline icons inside text or badges), **md** (18px, the default for button icons), and **lg** (24px, for standalone action icons and empty states). Using tokens ensures consistency and makes size changes systematic.

**Synonyms:** icon size token, named icon size

### Tooltip Rule

The hard rule that every icon-only button must have a `title` attribute (native browser tooltip) and an `aria-label` attribute (screen reader label). No exceptions — an unlabeled icon button is inaccessible and ambiguous. This rule applies to all buttons containing only an SVG icon.

**Synonyms:** mandatory tooltip, icon accessibility rule

### Typographic Scale

The set of six canonical font sizes expressed as CSS custom properties: `--text-xs` (12px) through `--text-2xl` (24px). Every component references a scale token rather than a raw size. The scale uses `rem` units, so it respects the user's browser font size preference.

**Synonyms:** type scale, font size tokens

### Action → Icon Mapping

The curated table that assigns exactly one Lucide icon to each user-facing action (e.g., Save → `Save`, Delete → `Trash2`, Settings → `Settings`). This mapping is authoritative — two different buttons for the same action must use the same icon. The mapping lives in the styling guide, not in code, so it can be consulted during design review before implementation.

**Synonyms:** icon catalog, icon assignments
