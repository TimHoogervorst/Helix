# Ubiquitous Language

> Canonical domain glossary for Helix. Defines terms, not implementation.
> For architecture decisions, see [docs/adr/](docs/adr/).

---

## The Mod System

> For the full architecture, see [docs/mod-system.md](docs/mod-system.md).

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Mod** | A self-contained unit of functionality — owns its own hub, workspace, blocks, buttons, settings, routes, and sidebar actions. Lives in a single co-located directory under `src/mods/<id>/` containing both frontend and backend code. Both built-in functionality (LIMS, ELN, Library) and future external plugins are mods | plugin, extension, module |
| **Core / Shell** | The immutable app frame at `src/shell/` (frontend) and `src/server/` (backend) — Layout, routing, hub pages, mod loader, slot resolution, mention resolution, API client. The shell provides the frame; mods provide the content | shell, platform, host |
| **Core Mod** | A mod that ships with the repository under `src/mods/`. Always loaded at boot. Uses the same registration API that external mods will use. Current core mods: LIMS, ELN, Library, Home, Settings, Pins, Tags, Users | built-in mod, first-party mod, internal mod |
| **Mod API** | The registration surface (`register*()` functions in `core/mod-system/`) that every mod calls to declare what it provides. The contract between core and mods | plugin API, extension API |
| **Mod Registry** | Central data structure in `core/mod-system/ModRegistry.ts` populated by all `register*()` calls during boot. Read by Core to build routes, sidebar nav, hub behavior, settings panels | registry, plugin registry |
| **Mod Loader** | Boot component (`ModLoader.tsx`) that globs all core mods, resolves their dependency graph (topological sort), calls each mod's registration, and then renders the app. Fail-fast — any error halts boot | plugin loader, bootstrap |
| **`register*()`** | The imperative functions mods call in their `index.ts`: `registerHub()`, `registerBlock()`, `registerButton()`, `declareSlot()`, `registerIntoSlot()`, `registerSettingsSection()`, `registerRoute()`, `registerPublicRoute()`. The contract between core and mods. Former functions `registerLibraryItem()`, `registerSidebarAction()`, and `registerWorkspace()` have been eliminated — library cards are now generic schema-driven, sidebar actions use event-driven tabs, and workspaces are hydrated from the backend API | register, declare, contribute |
| **Mod Manifest** | The identity document (`modManifest.json`) at the root of every mod folder. Declares `id`, `displayName`, `version`, `dependsOn`, `coreVersion`, and `description`. The single source of truth read by both frontend and backend loaders. Does NOT describe capabilities — those are discovered from `register*()` calls at boot. The `description` field provides a human-readable summary shown on hub cards in the Jump Back In section | mod.json, manifest, mod identity |
| **`dependsOn`** | Field in `modManifest.json` declaring which other mods must load first. Supports bare mod ID strings and objects with optional `version` constraints. Used for topological sort during boot. Circular dependencies cause boot failure | requires, dependency |

## Slot System

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Slot** | A named placeholder in a workspace declared via `declareSlot({ id, accepts, renderer })`. The `renderer` owns presentation; the slot's `accepts` field (`"block"` or `"button"`) filters what can bind into it. Naming convention: `{workspaceId}.{region}.{name}` (e.g. `eln.editor`) | placeholder, extension point |
| **Block** | A reusable, renderer-agnostic content unit registered via `registerBlock()`. Carries a React `component`, event handlers (`listensTo` + `onEvent`), serialization functions, and optional action log `messages`. The same block can render in a TipTap editor, a sidebar panel, or a tab without rendering-mode-specific code | content block, editor block, widget |
| **Button** | A fire-only action registered via `registerButton()`. Emits events via the workspace event bus but never listens. Rendered in toolbar slots by ButtonGroupRenderer | toolbar button, action button |
| **Binding** | The connection between a block/button and a slot, created by `registerIntoSlot()`. Carries per-binding overrides that merge with slot defaults (binding wins per-key) | slot binding, slot content |
| **Renderer** | The component that owns presentation within a slot. Determines how bound content is presented (TipTapRenderer embeds as nodes, PanelRenderer as panels, TabRenderer as tabs, ButtonGroupRenderer as button groups). The slot's `renderer` field IS the type — no fixed enum | slot renderer, presentation component |
| **Event Bus** | A workspace-scoped pub/sub bus (`WorkspaceBus`). Buttons emit events via `bus.emit()`; blocks listen via declarative `listensTo` + `onEvent` handlers. Lifecycle events (created/edited/deleted) are renderer-emitted — block authors never call `bus.emit()` | workspace bus, pub/sub |

## Backend Mod System

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **helix_core** | The backend platform SDK at `src/server/helix_core/`. Provides `ModLoader`, `BackendModRegistry`, `ModManifest` dataclass, `AbstractBaseAction`, `ActionLoggingMixin`, and `@logs_action`. Importable by external mods as a pip package | backend core, platform SDK |
| **BackendModRegistry** | Singleton populated by mod `mod.py` `register()` calls. Provides `register_*()` methods for action models, entity types, URLs, settings, signals, and services. Read by Core to wire up the application | backend registry |
| **mod.py** | The backend entry point for a mod. Exports a `register()` function called by `ModLoader` after topological sort. The backend equivalent of frontend `index.ts` | mod entry point, backend mod file |
| **Service Registry** | Cross-mod communication layer. Mods call `registry.call("mod.service_name", ...args)` instead of importing directly. Backend equivalent of the frontend service registry | backend service registry |

## Action Logging

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Action Log** | A framework-logged record of any mutating operation. Created automatically by `ActionLoggingMixin` or `@logs_action` — not manually by users. Each row records: `performed_by`, `action_type`, `target_type`, `target_id`, `created_at`, `metadata` | audit trail, audit record |
| **AbstractBaseAction** | The abstract Django model that all mod action tables inherit from. Provides the standard action log schema with indexes on `(performed_by, created_at)`, `(target_type, target_id)`, and `action_type` | base action model |
| **ActionLoggingMixin** | A DRF viewset mixin that intercepts successful mutating responses and writes action rows automatically. Zero boilerplate for mod authors | logging mixin |
| **`@logs_action`** | A decorator for non-viewset mutating operations (service-layer functions). Captures the target object and writes an action row on success | action decorator |
| **Action Type** | Triple-dotted identifier: `"{mod}.{target}.{verb_past}"` (e.g. `"eln.entry.created"`, `"lims.schema.updated"`). Used by both the action logging system and the workspace event bus | action name, event type |
| **ActivityFeed** | A cross-mod block registered via `registerBlock()` that renders actions from any mod's action table. Bindable into any workspace sidebar slot via `registerIntoSlot()` | action log viewer, audit feed |
| **Block Action** | An action logged for a block-level mutation (create, edit, delete). Routed through the workspace event bus via `bus.collect()` and batched on save | editor action, block log |

## The Hub Pattern

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Hub** | A free-form browsing page at a route like `/library` or `/home`. Each hub has complete layout freedom — card grids, stat tiles, tree views, etc. Its job is to help users find the right thing. Hubs link outward to Workspaces at dedicated URLs | console (deprecated), overview, dashboard |
| **Workspace** | A full work surface for a specific item type at a dedicated URL (e.g., `/eln/EXP-0284`, `/lims/BLOOD1`). Implemented as a plain route via `registerRoute()` — no special registration type. Its job is to let users work with that thing | editor, detail page, work surface |
| **Platform Architecture** | `Sidebar → Hub Page → Workspace (dedicated URL)`. Simple navigation: click a card → go to a dedicated URL. No three-panel layout, no view-state machine | — |

## Concrete Hubs

> Each hub is registered by a core mod via `registerHub()` and auto-appears in the sidebar, sorted by `order`.

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Home** | The hub at `/home`, registered by the Home core mod (`order: 0` — first in sidebar). Serves as the lab landing page with a personalised greeting, **Jump Back In** hub cards for quick navigation to other hubs, and placeholders for stats, recent activity, and daily schedule. The greeting uses the current user's first name from `useCurrentUser()` | landing page, dashboard |
| **Library** | The hub at `/library`, registered by the Library core mod (`order: 10`). Card-grid view over the Folder hierarchy, showing Folders and Entries mixed (folders first). Cards are rendered generically from workspace schema column definitions — no per-mod card registration needed | Library Hub, ELN browser |

## Items

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Item** | Any card or row in a hub browsing page. Minimum contract: display ID, name/title, type discriminator, creation timestamp | row, record, list item |
| **Entry** | A single page of narrative lab documentation — unstructured rich-text content. Belongs to exactly one Folder | ELN entry, NotebookEntry, ELN page, notebook page |
| **Entity** | A trackable physical or conceptual lab item with structured, typed properties and a user-assigned Name Column. Belongs to exactly one EntityType | sample (rejected — too narrow), lab item |
| **Folder** | A hierarchical container that owns Entries, Entities, and child Folders. Containers, not content — no dedicated Workspace | directory, project (rejected — implies temporary) |

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
| **ReferenceBadge** | A clickable UI badge showing a display ID (e.g., `E12`, `BLOOD1`). Clicking navigates to the target's dedicated URL | badge, ref chip, #-badge |
| **Content Sync Pipeline** | The ordered pipeline that processes an Entry on save: entities synced first (from limsTable nodes), then mentions synced (from reference nodes and Reference columns) | sync pipeline, entry sync |
| **Tree Walker** | A shared depth-first utility that walks a TipTap JSON tree, calling a handler per node. Pure utility — zero domain knowledge | walker, document walker |
| **Breadcrumb** | Navigation bar showing the current folder path as clickable segments in the Library hub. Current folder is bold; up-button (`↑`) moves to parent | path bar, nav trail |
| **Pinned Workspace** | A workspace (Entry or Entity) that a User has bookmarked for quick access from the sidebar. Persists across sessions via backend storage. The sidebar also shows the **current** workspace with a "Current" badge — if unpinned, it appears as a temporary row at the top with a pin button. Pinned workspaces are ordered newest-first. One User can have many Pinned Workspaces; a User cannot pin the same URL twice | bookmarked workspace, saved workspace, workspace tab |

## Dedicated URL

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Dedicated URL** | A shareable, bookmarkable URL that resolves to an item's full Workspace as a standalone page (e.g., `/eln/E12`, `/lims/BLOOD1`) | permalink, direct link, standalone URL |
| **EntityWorkspace** | The standalone page at `/lims/:displayId` showing a single Entity's full detail with tabbed Workspace (Properties, Activity, Insights, Storage) | entity detail page, entity permalink |
| **ElnEditor** | The TipTap editor component at the dedicated URL `/eln/:id` | entry editor, notebook editor |

## Home Hub Sections

> Layout sections of the Home hub page at `/home`. Rendered by `HomePage.tsx`.

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Greeting Section** | The hero area at the top of the Home page with a full-width grid-paper background. Shows "Good morning, [first_name]" pulled from `useCurrentUser()`, with a placeholder subtitle. The sidebar overlays this section | hero, welcome area |
| **Jump Back In** | A section listing **Hub Cards** — clickable tiles for each registered hub (excluding Home itself). Each card is built from `HubConfig` data: `label`, `icon`, `description`, and `route`. Populated by calling `ModRegistry.getHubs()`. Currently shows only the Library hub card; stats (entries count, folders, new this week) are hardcoded placeholders | quick-jump, recent hubs |
| **Hub Card** | A clickable tile in the Jump Back In section representing a single registered hub. Renders: a colored icon square, title (`label`), description (from the mod's `modManifest.json`), placeholder stats line, and a footer with status chip and timestamp. Clicking navigates to the hub's `route` | hub tile, jump card |
| **Hub Description** | A short human-readable summary of what a hub does. Stored in `modManifest.json` under the `description` field and threaded through `HubConfig` via `registerHub()`. Displayed on the Hub Card in Jump Back In | hub summary, mod description |
| **Stats Bar** | A placeholder 4-column strip on the Home page showing lab-wide metrics (Experiments running, Entries this week, Freezer temperature, Reagents low). Hardcoded placeholder values for now — future: real data from backend aggregation | metrics bar, lab stats |
| **Today in the Lab** | A placeholder sidebar-style panel on the Home page showing the day's schedule as a timeline (time + task). Currently hardcoded; future: real schedule data. The inspirational quote from the prototype is omitted | daily schedule, lab timeline |

## Shared Hub Components

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **BaseCard** | Shared card wrapper component providing view modes (list/grid/compact), selection state, star button, and owner display. Used by hubs to render items consistently | card, list item, library card |
| **Breadcrumbs** | Navigational path bar rendering `BreadcrumbSegment[]` — callers build segments, component renders. Moved from the old console system into `shared/components/` | path bar, nav trail |
| **StatusBadge** | Colored pill for entry/entity status (e.g., "In Progress", "Completed"). Extracted from BaseCard into `shared/components/` | status chip, status label |
| **TagPill** | Tag display component used on cards and in detail views. Lives in `src/mods/tags/ui/` — the single shared tag display for the entire platform | tags, labels |
| **ReferenceBadge** | Clickable UI badge showing a display ID (e.g., `E12`). Clicking navigates to the target's dedicated URL | badge, ref chip, #-badge |
| **Activity** | Placeholder timeline component showing actions performed on an item (user + action + timestamp). Future: reads from platform-level standardized action log with CFR Part 11 traceability | action log, audit trail, history |
| **OwnerStack** | Placeholder for stacked user avatars. Currently renders a single avatar; future: overlapping avatar circles for multiple owners | avatar stack, owner list |

## Entity Type Management (Settings)

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **TypeMasterPanel** | Settings page listing all Entity Types in a Master table | entity type list |
| **TypeDetailPanel** | Settings page editing a single Entity Type — its name, prefix, icon, columns, and active status | entity type editor |
| **ColumnEditor** | Component for CRUD operations on an Entity Type's column schema entries | column manager, property editor |

## Relationships

- A **Folder** optionally has one parent **Folder**; first-level Folders belong directly to a **Project**
- A **Project** and its Folders contain **Entries** and **Entities**
- An **Entry** belongs to exactly one **Project** and may optionally belong to one **Folder**
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
- A **Hub** provides a browsing surface for one or more item types and links to Workspaces at dedicated URLs
- Each **Item** type has a dedicated **Workspace** at a URL: Entry → TipTap editor at `/eln/:id`, Entity → tabbed detail view at `/lims/:id`
- A **LimsTable Node** syncs to one or more **Entity** records on save

```
Library Hub ──▶ Projects ──▶ Folder tree

Project ──┬── Folder (first-level folder)
          ├── Entry (root-level or in a folder)
          └── Entity (root-level or in a folder)

Folder ──┬── Folder (parent/child, recursive)
         ├── Entry
         └── Entity

Entry ──▶ Mention (1:N — entry can mention many things)
Mention ──▶ Entry | Entity (target of the reference)

Entity ──▶ Action (1:N — entity has many actions recorded)
Action ──▶ Entry (N:1 — optionally recorded in an entry)

EntityType ──▶ Entity (1:N — type classifies many entities)

User ──▶ Entry (1:N — author)
User ──▶ Action (1:N — performer)
User ──▶ Entity (1:N — creator)
User ──▶ PinnedWorkspace (1:N — bookmarked workspaces)

Hub ──▶ Workspace (dedicated URL) ──▶ type-specific work surface
```

## Key Distinctions

### Hub vs Data Model

A **Hub** (Library, Home) is a UI/UX construct — the browsing surface users interact with. The **data models** (Folder, Entry, Entity, EntityType) are backend records. Hubs are presentation layers; data models are persistent storage.

### Entry vs Rich-Text Document

An **Entry** is the database record (id, title, author, folder, dates). The **Rich-Text Document** is the content inside it. They are 1:1 but conceptually distinct.

### Entry vs Entity

| Dimension | Entry | Entity |
|-----------|-------|--------|
| Nature | Unstructured narrative | Structured data |
| Content | Rich-Text Document (TipTap blocks) | Typed properties (JSON, schema-driven) |
| Hub | Library (within folder hierarchy) | — |
| Workspace | TipTap editor | Tabbed detail (Activity, Insights, Storage) |

### Mention vs Action

A **Mention** is a passive link: "I referenced sample #42." An **Action** is an active record: "I used 50µL of sample #42." Mentions are parsed from text; Actions are user-recorded.

### Folder vs Library

A **Folder** is a data-model concept — a node in the folder tree. The **Library** is the Hub that lets users navigate the folder hierarchy.

## Example Dialogue

> **Dev:** "When a user clicks an **Entry** card in the **Library** hub, what happens?"

> **Domain expert:** "They navigate directly to the Entry's **Dedicated URL** — `/eln/EXP-0284` — opening the TipTap editor. No intermediate detail panel, no three-panel layout."

> **Dev:** "And clicking a **Folder** in the Library hub?"

> **Domain expert:** "The hub navigates *into* it — the card grid reloads with the folder's children. Folders have no Workspace and no Display ID."

> **Dev:** "What about cross-references? If an **Entry** contains a **Mention** to `#BLOOD1`, and the user clicks the **ReferenceBadge**?"

> **Domain expert:** "That navigates to the **Entity**'s **Dedicated URL** — `/lims/BLOOD1` — the full **EntityWorkspace** page. The user leaves the **Library** hub."

> **Dev:** "And when the user saves an **Entry**, the **Content Sync Pipeline** runs. What order?"

> **Domain expert:** "**Entities** sync first — **LimsTable Nodes** create/update/delete **Entity** records and patch their display IDs back into the document. Then **Mentions** sync — **Reference Nodes** and Reference-type columns are parsed, resolved, and stored. Entities first because a newly created Entity's **Display ID** might be referenced by a Mention in the same document."

> **Dev:** "What about the **Name Column** — is it part of the **Column Schema**?"

> **Domain expert:** "No. The **Name Column** is implicit — every **Entity Type** has one, but it's not stored in the `columns` JSON array. It's a first-class property: `Entity.name`. When you create a column named 'Name' in the **ColumnEditor**, you get blocked — it's already taken as the default identity column."

> **Dev:** "So in the LimsTable, the Name Column always appears second, right after the `#` index column. And the user types the entity name right there in the cell?"

> **Domain expert:** "Exactly. On save, if any Name cell is blank, validation blocks the save with 'Name not filled in.' The old auto-generated names like 'Table row 3' are gone — every entity gets a real user-assigned name now."

## Deprecated Term Mappings

| Old Term | Canonical Replacement |
|----------|---------------------|
| "console" / "Console" (UI browsing surface) | Hub |
| "three-step fold" / "LIMS three-step fold" | Hub + Workspace architecture |
| "Master Panel" / "Detail Panel" / "Workspace Panel" | Hub page (browsing) + dedicated Workspace URL |
| registerConsole() | registerHub() |
| registerWorkspace() (as console member) | registerWorkspace() (standalone identity) + registerRoute() for URL |
| ConsoleConfig | HubConfig |
| ConsolePage / ConsoleProvider / ConsoleCollapsedStrip | Removed — no replacement |
| useConsoleView / useConsoleData | usePaginatedData (shared/hooks/) |
| LIMS Console | Removed — LIMS hub deprecated; entity workspace stays as route |
| "ELN browser" / "ELN console" | Library Hub |
| "sample" | Entity |
| "project" | Folder |
| registerSlashCommand() | registerBlock() (renderer-agnostic blocks, discoverable via slash menu) |
| TipTapBlockPayload / type: "tiptap-node" | BlockRegistration (renderer-agnostic component, serialize, deserialize) |
| frontend/src/core-mods/ | src/mods/ (co-located frontend + backend) |
| backend/core_mods/ | src/mods/<id>/ (backend code co-located with frontend) |
| inline meta export in index.ts | modManifest.json (single identity source of truth) |
| manual log_action() calls | ActionLoggingMixin + @logs_action (declarative) |
| registerService() (unexported) | registry.call() (internal ModRegistry method) |

## Flagged Ambiguities

- **"Item"** is used both as the generic term (anything in a hub card grid) and informally to mean "Entity" in the LIMS context. Prefer the generic meaning; say **Entity** when you mean the LIMS model.
- **"content"** was used to mean both the Rich-Text Document inside an Entry and the children array of any TipTap node. Prefer **"Rich-Text Document"** for the Entry's content and **"child nodes"** or **"children"** for the structural sense.
- **"console"** now exclusively means the terminal/command-line. In Helix domain contexts, the canonical term is **Hub** (a browsing page). The old "Console" as a three-panel browsing surface is deprecated.
