# Helix — Domain Glossary

> This is the canonical glossary. It defines terms, not implementation. For architecture decisions, see [docs/adr/](docs/adr/). For the mod system architecture, see [docs/mod-system.md](docs/mod-system.md).

---

## The Mod System

> The platform is structured around a **mod system**. Everything — LIMS, ELN, Library, Settings, Pins — is a mod. The Shell is the thin frame that loads mods and provides the services they render into. Both internal (core mods) and future external mods use the same `register*()` API. Each mod lives in a single co-located directory under `src/mods/<id>/` containing both frontend and backend code.

| Term | Definition |
|------|-----------|
| **Mod** | A self-contained unit of functionality registered into the Shell. Owns hubs, workspaces, blocks, buttons, settings, routes, and library items. Lives under `src/mods/<id>/` — frontend and backend code together. |
| **Shell** | The immutable app frame at `src/shell/` (frontend) and `src/server/` (backend): Layout, Router, Mod Loader, Mod Registry, mention resolution, API client, slot resolution. The shell provides the frame; mods provide the content. |
| **Core Mod** | A built-in mod under `src/mods/` that ships with the repo. Always loaded. Uses the same API as future external mods. |
| **Mod Registry** | Central data structure populated at boot by all `register*()` calls. Drives route generation, sidebar nav, hub content, slot resolution, and workspace identity. |
| **Mod Manifest** | The identity document (`modManifest.json`) at the root of every mod folder. Declares `id`, `displayName`, `version`, `dependsOn` (with optional version constraints), `coreVersion` (minimum platform version), and `description`. The single source of truth for mod identity — both frontend and backend loaders read it. Does NOT describe capabilities (routes, blocks, settings) — those are discovered from `register*()` calls at boot. |
| **Mod Identity** | The fields in a mod manifest that answer "who are you": `id`, `displayName`, `version`, `description`. Distinct from **mod capabilities** — what the mod provides via `register*()` calls. |
| **Workspace** | A mod's dedicated work surface for a type of content. Declared via `registerWorkspace({ id, displayName })` — the `id` doubles as the URL namespace (`/{workspaceId}/{displayId}`) and as the identifier used by Mentions to build navigation targets. Any mod that registers a workspace is automatically discoverable by the mention system and the pins/bookmarks system. Workspace pages are registered separately via `registerRoute()`. |

### Workspace Registration

Workspaces are a first-class registration in the mod system. A mod calls `registerWorkspace()` during boot, providing:

- **id** — the mod's unique identifier (e.g. `"eln"`, `"lims"`). Doubles as the URL namespace.
- **displayName** — human-readable label (e.g. `"Electronic Lab Notebook"`).

The workspace URL is **derived by convention**, not configured: `/{workspaceId}/{displayId}`. This convention is the single integration point that makes the mention system, pins/bookmarks, and navigation work automatically for any mod that registers a workspace. A mod does not need to provide mention-specific wiring — it only needs to register its workspace and entity types with LIMS.

### Slot System

Workspaces declare named **slots** — placeholders that own how embedded UI is rendered. Mods register **blocks** (renderer-agnostic content units) and **buttons** (fire-only actions), then bind them into slots. The same block can render in a TipTap editor, a sidebar panel, or a tab without the block author writing any rendering-mode-specific code. See [docs/slot-system.md](docs/slot-system.md) for the full design.

| Term | Definition |
|------|-----------|
| **Slot** | A named placeholder in a workspace declared via `declareSlot({ id, accepts, renderer })`. The `renderer` owns presentation; the slot's `accepts` field (`"block"` or `"button"`) filters what can bind into it. |
| **Block** | A reusable content unit registered via `registerBlock()`. Carries a React `component`, event handlers (`listensTo` + `onEvent`), serialization, and optional action log `messages`. Renderer-agnostic — the same block works in TipTap, a panel, or a tab. |
| **Button** | A fire-only action registered via `registerButton()`. Emits events via the workspace event bus but never listens. Use for toolbar buttons (export, lock, delete). |
| **Binding** | The connection between a block/button and a slot, created by `registerIntoSlot()`. Carries per-binding overrides merged with slot defaults. |
| **Event Bus** | A workspace-scoped pub/sub bus. Buttons emit events via `bus.emit()`; blocks listen via declarative `listensTo` + `onEvent` handlers. Lifecycle events (created/edited/deleted) are renderer-emitted — block authors never call `bus.emit()`. |

### Backend Mod System

The backend mirrors the frontend mod system. Mods are discovered from `modManifest.json`, loaded in topological order by `ModLoader` in `helix_core`, and register contributions through `BackendModRegistry`. Each mod provides a `mod.py` with a `register()` function. Cross-mod communication goes through `registry.call()` — no direct imports. See [docs/backend-mod-system.md](docs/backend-mod-system.md) for the full design.

### Action Logging

All mutating operations are automatically logged for CFR Part 11 audit compliance. HTTP endpoints use `ActionLoggingMixin` (DRF viewset mixin) or `@logs_action` (decorator). Block actions are routed through the workspace event bus and batched on save. The `ActivityFeed` is a cross-mod block that renders actions from any mod. Action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"` (e.g. `"eln.entry.created"`). See [docs/actions-system-design.md](docs/actions-system-design.md) for the full design.

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

## Hub Architecture

The platform uses a **Hub → Workspace** navigation model. Hubs are free-form browsing pages; Workspaces are dedicated work surfaces at their own URLs. There is no shared three-panel layout — each hub owns its layout completely.

| Term | Definition |
|------|-----------|
| **Hub** | A free-form browsing page at a route like `/library` or `/home`. Each hub has complete layout freedom — card grids, stat tiles, tree views. Its job is to help users find the right thing. Hubs link outward to Workspaces at dedicated URLs. |
| **Hub Registration** | Hubs are registered via `registerHub({ id, label, icon, route, component, order })`. Automatically adds a sidebar nav item. |
| **Library Hub** | The hub at `/library`, registered by the Library mod. Card-grid view over the Folder hierarchy, showing Folders and Entries mixed (folders first). Three view modes: List, Grid, Compact. |
| **Home Hub** | The hub at `/home`, registered by the Home mod (`order: 0` — first in sidebar). Landing page. |
| **Settings Hub** | The hub at `/settings`, registered by the Settings mod. Renders settings sections from all mods, sorted by `order`. |

### Navigation Flow

```
Sidebar (dynamic: registry.getHubs())
  → Click hub → navigate to /{hubId}
    → Hub page renders (free-form, owns its layout)
      → Click item → navigate to /{workspaceId}/{displayId}
        → Workspace page renders (full-page, fetches own data)
```

---

## Library Hub

### Library

The **hub** at `/library` that presents a unified, filesystem-like view over the Folder hierarchy. At any folder level, both child Folders and Entries appear together in a single card grid, sorted with folders first. The Library is a *browsing surface* — it is not a data model, but a presentation model layered on top of the Folder tree.

The Library renders two Item types: **Folders** (navigated into) and **Entries** (selected for navigation to workspace). When new content types are added, they appear in the same mixed grid with their own type icon and label.

**Invariant:** Every Item surfaced in the Library belongs to exactly one Folder (or lives at root).

**Synonyms:** file explorer, library browser

### Breadcrumb

The navigation bar at the top of the Library hub showing the current folder path as clickable segments. Each segment is a link to that folder level. The current folder is displayed as bold text (not a link). An up-navigation button (`↑`) moves to the parent folder.

**Invariant:** The breadcrumb always reflects the current `?path=` URL parameter. Clicking a breadcrumb segment updates the path and reloads the card grid.

---

## LIMS Domain

### LIMS

The LIMS domain comprises Entity Types, Entities, and Actions. There is no LIMS hub — entities are accessed directly via their workspace URLs (`/lims/:displayId`). The entity workspace provides a tabbed detail view (Activity, Insights, Storage). Entity types are managed through the Settings hub.

**Synonyms:** entity management, sample database

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
Library Hub ──▶ Folder tree (the Library is the browsing surface for the folder hierarchy)

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

Slot ──▶ BlockBinding | ButtonBinding (1:N — slot resolves to ordered bindings)
Block ──▶ SlotBinding (M:N — block can be bound into many slots)
Button ──▶ SlotBinding (M:N — button can be bound into many slots)

Tag (standalone — reusable labels with name + color, managed inline on entries)

User ──▶ NotebookEntry (1:N — author of entries)
User ──▶ Action (1:N — performer of actions)
User ──▶ Entity (1:N — creator of entities)
User ──▶ PinnedWorkspace (1:N — user bookmarks workspaces)

NotebookEntry.status ──cascades to──▶ Entity.status (only via source_entry FK)

ModLoader ──▶ ModRegistry (populated by register*() calls from mod index.ts / mod.py)
              ├── Registered Hubs → sidebar nav + routes
              ├── Registered Workspaces → workspace identity + URL namespaces
              ├── Registered Entity Types → prefix→workspace mapping (held by LIMS)
              ├── Registered Settings Sections → settings shell panels
              ├── Registered Blocks → renderer-agnostic content units
              ├── Registered Buttons → toolbar actions
              ├── Declared Slots → named workspace placeholders
              ├── Slot Bindings → block/button→slot connections
              ├── Registered Sidebar Actions → sidebar row buttons
              ├── Registered Library Items → hub card components
              └── Registered Services → mod-to-mod communication
```

---

## Key Distinctions

### Hub vs Data Model

A **Hub** (Library, Home) is a UI/UX construct — the browsing surface users interact with. The **data models** (Folder, NotebookEntry, Entity, EntityType) are backend records. Hubs are presentation layers; data models are persistent storage.

### Block vs Button

A **Block** is a content unit that can listen to events and render UI. A **Button** is a fire-only action — it emits events but never listens. If a UI element needs to both listen and fire, use a block.

### Slot vs Route

A **Slot** is a named placeholder inside a workspace for embedded UI extension. A **Route** is a top-level URL pattern. Slots handle intra-workspace composition; routes handle cross-page navigation.

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

The **Mention system** (frontend: `src/shell/src/core/mentions/`, backend: `src/server/core/mentions/`) is the **consumer** — it resolves references and renders navigation badges. **LIMS** is the **registry** — it owns the entity type→workspace mapping. The mention system asks LIMS "where does this display ID belong?" and uses the answer to build a URL. Neither system hardcodes knowledge of the other's entity types or workspaces. A new mod registers with LIMS, and the mention system picks it up automatically through the standard resolution chain.

### Mention vs Action

A **Mention** is a passive link: "I referenced sample #42." An **Action** is an active record: "I used 50µL of sample #42." Mentions are parsed from text; Actions are user-recorded. Actions are logged via the declarative action logging system for audit compliance. See [docs/actions-system-design.md](docs/actions-system-design.md).

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
