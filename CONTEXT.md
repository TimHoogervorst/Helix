# Helix — Domain Glossary

> This is the canonical glossary. It defines terms, not implementation. For architecture decisions, see [docs/adr/](docs/adr/). For the mod system architecture, see [docs/mod-system.md](docs/mod-system.md).

---

## The Mod System

> The platform is structured around a **mod system**. Everything — LIMS, ELN, Library, Settings, Tabs — is a mod. The Shell is the thin frame that loads mods and provides the services they render into. Both internal (core mods) and future external mods use the same `register*()` API. Each mod lives in a single co-located directory under `src/mods/<id>/` containing both frontend and backend code.

| Term | Definition |
|------|-----------|
| **Mod** | A self-contained unit of functionality registered into the Shell. Owns hubs, workspaces, blocks, buttons, settings, routes, and library items. Lives under `src/mods/<id>/` — frontend and backend code together. |
| **Shell** | The immutable app frame at `src/shell/` (frontend) and `src/server/` (backend): Layout, Router, Mod Loader, Mod Registry, mention resolution, API client, slot resolution. The shell provides the frame; mods provide the content. |
| **Core Mod** | A built-in mod under `src/mods/` that ships with the repo. Always loaded. Uses the same API as future external mods. |
| **Mod Registry** | Central data structure populated at boot. Has two populations: **registrations** (synchronous `register*()` calls during mod loading — hubs, routes, blocks, slots, settings sections) and **hydrated data** (fetched from `GET /api/mod-registry/` — icon library, color token palette, column types, workspaces, action catalogs). First render is gated until both populations are loaded; no component ever reads an empty registry. The registry is a non-reactive singleton — it must not trigger re-renders. |
| **Hydration** | The async boot phase that fetches `GET /api/mod-registry/` and populates the registry's backend-sourced stores (icon library, color palette, column types, workspaces, action catalogs). Runs after action sync (per-mod `POST /api/mod-registry/sync-actions/`) so the action catalog is fresh when fetched. Gated — children do not render until hydration resolves or fails. |
| **Mod Manifest** | The identity document (`modManifest.json`) at the root of every mod folder. Declares `id`, `displayName`, `version`, `dependsOn` (with optional version constraints), `coreVersion` (minimum platform version), and `description`. The single source of truth for mod identity — both frontend and backend loaders read it. Does NOT describe capabilities (routes, blocks, settings) — those are discovered from `register*()` calls at boot. |
| **Mod Identity** | The fields in a mod manifest that answer "who are you": `id`, `displayName`, `version`, `description`. Distinct from **mod capabilities** — what the mod provides via `register*()` calls. |
| **Workspace** | A mod's dedicated work surface for a type of content. The `id` doubles as the URL namespace (`/{workspaceId}/{displayId}`) and as the identifier used by Mentions to build navigation targets. Workspaces are backend-declared and frontend-discovered at boot via the mod registry API. Any mod that declares a schema type is automatically discoverable by the mention system and the Tabs (bookmarks) system. Workspace pages are registered separately as frontend routes. |

### Workspace Discovery

Workspaces are **backend-declared, frontend-discovered**. A mod declares its schema type (which implies a workspace) in its backend registration; the frontend discovers all workspaces at boot via the mod registry API. There is no frontend workspace registration.

The workspace URL is **derived by convention**, not configured: `/{workspaceId}/{displayId}`. This convention is the single integration point that makes the mention system, Tabs (bookmarks), and navigation work automatically for any mod that declares a schema type. A mod does not need to provide mention-specific wiring — it only needs to declare its schema type and entity types in the backend.

### Slot System

Workspaces declare named **slots** — placeholders that own how embedded UI is rendered. Mods register **blocks** (renderer-agnostic content units) and **buttons** (fire-only actions), then bind them into slots. The same block can render in a TipTap editor, a sidebar panel, or a tab without the block author writing any rendering-mode-specific code. See [docs/slot-system.md](docs/slot-system.md) for the full design.

| Term | Definition |
|------|-----------|
| **Slot** | A named placeholder in a workspace declared via `declareSlot({ id, accepts, renderer })`. The `renderer` owns presentation; the slot's `accepts` field (`"block"` or `"button"`) filters what can bind into it. |
| **Block** | A reusable content unit registered via `registerBlock()`. Carries a React `component`, event handlers (`listensTo` + `onEvent`), an optional `emits` declaration for custom actions, and serialization. Renderer-agnostic — the same block works in TipTap, a panel, or a tab. Blocks declare what they listen to and what they emit; the renderer wires everything. Blocks do not have direct access to the bus or the HTTP layer. |
| **Button** | A fire-only action registered via `registerButton()`. Emits events via the workspace event bus but never listens. Use for toolbar buttons (export, lock, delete). |
| **Binding** | The connection between a block/button and a slot, created by `registerIntoSlot()`. Carries per-binding overrides merged with slot defaults. |
| **Binding Override** | A per-binding configuration object (`overrides`) set on `registerIntoSlot()`. Merged with slot defaults; the binding wins per key. Used for presentation-level configuration that is specific to a slot binding; the block component receives overrides via `BlockComponentProps` and can conditionally render UI based on them. |
| **Inline Block** | A block stored inside the ProseMirror/TipTap document JSON. Part of the document body — locked when the document is locked (e.g. during review). Created and edited through the editor. |
| **Duplication Policy** | A declarative `preserve` list on a block registration governing what Duplicate carries over. Empty by default — Duplicate copies the block's full state. A policy names which parts survive (e.g. only a schema ID or a protocol ID); everything else is re-derived fresh, exactly as at a fresh insertion. Table row data and protocol step completion never travel on Duplicate. See [ADR 0024](docs/adr/0024-block-duplication-policy.md). |
| **Event Bus** | A workspace-scoped pub/sub bus. Created by the workspace and passed to renderers; blocks never see it directly. Buttons emit events via `bus.emit()`; blocks listen declaratively via `listensTo` + `onEvent` handlers (wired by the renderer) and emit custom actions via their `emits` declaration. The bus carries cross-boundary events like `{workspaceId}.action.performed` (resolved, ready-to-render action items) and `{workspaceId}.actions.pending` / `{workspaceId}.actions.flushed` (save-cycle signals consumed by the Activity Feed). Block lifecycle events (created/edited/deleted) are internal renderer callbacks — not on the public bus. Supports wildcard pattern matching for subscriptions. |

### Backend Mod System

The backend mirrors the frontend mod system. Mods are discovered from `modManifest.json`, loaded in topological order by `ModLoader` in `helix_core`, and register contributions through `BackendModRegistry`. Each mod provides a `mod.py` with a `register()` function. Cross-mod communication goes through `registry.call()` — no direct imports. See [docs/backend-mod-system.md](docs/backend-mod-system.md) for the full design.

### Action Logging

All mutating operations are automatically logged for CFR Part 11 audit compliance. Mutating actions — whether from an HTTP endpoint or a block — flow through a single unified `POST /api/actions/` endpoint. The four Core Actions are `read`, `created`, `edited`, and `deleted`. `read` participates in access-policy evaluation but is never persisted as an Action Log Entry or shown in the Activity Feed; the three mutating Core Actions are logged. Custom domain actions must be explicitly registered and map to a Core Action. For the access foundation, policies for Core Actions are hardcoded; per-mod custom Action policies are deferred. Action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"`. See [docs/actions-system-design.md](docs/actions-system-design.md) for the full design.

### Activity Feed

The Activity Feed renders the framework-logged Action Log Entries of one **Subject** — the object the feed tracks (currently a Notebook Entry or an Entity). It is the presentation surface of the audit trail. The feed is subject-agnostic: a shared core owns fetching, ordering, grouping, and presentation, while each Subject contributes a thin binding supplying its action source and its live-update signals. The feed never renders anything unpersisted — there is no optimistic rendering.

Live updates follow the save cycle. While a save cycle has pending actions, the feed shows a muted **Unsaved Changes** indicator; when the flush succeeds (all pending actions persisted), the indicator clears and the feed refreshes. A successful entry save likewise refreshes the feed. On a surface without an Event Bus the feed is static — it fetches once and shows no indicator.

**Invariant:** Feeds of different Subjects are never merged — an entry's feed and an entity's feed remain separate.

---

## Core Concepts

### Source

The single containment reference of every Folder, Notebook Entry, and Entity — the item it belongs to. A Source may be a Project, a Folder, a Notebook Entry, or an Entity. Every item has exactly one Source; it is required and never null. "Lives at the Project root" means the Source *is* the Project. Every Source chain terminates at exactly one Project. Projects have no Source — they are always roots. Containment is expressed entirely through Source; there is no separate parent or folder reference. See [ADR 0026](docs/adr/0026-source-replaces-containment.md).

_Avoid_: parent, container reference, location, home folder

### Source Path

The ordered Source chain of one item — from the Project down to its direct Source — stored as structured segments carrying kind and identity, ancestors only. Maintained silently and synchronously by the system on every create and move; never user-editable. The Source Path is a backend optimization: it answers "where does this item live" and "does this item sit inside that subtree" without walking Source references, and it hydrates Breadcrumbs. It is never surfaced as a column in any hub.

_Avoid_: full path, breadcrumb data, location string

### Folder

A library-exclusive node in the Source graph. A Folder's Source is another Folder or its Project; Folders form a tree rooted at the Project. Folders do not own items — items point at a Folder as their Source, and a Folder's listing in the Library is exactly the set of items whose Source is that Folder. Folders carry no permissions of their own; access comes from the Project (see Grant) or from being a Shared Folder. Users navigate the folder tree through the Library console.

The Project is the root container. There is no synthetic or hidden root Folder.

Folders are **containers, not content.** They have no Detail panel, no Workspace, and no metadata beyond a name. Clicking a Folder in the Master table always navigates *into* it — there is no intermediate inspection step. Folders exist solely to provide a place where other Items can point. Folders carry no status and are skipped by the status cascade.

Deleting a Folder permanently deletes its entire Source subtree — child Folders, Entries, Entities, and everything sourced beneath them — under the pre-v1 lifecycle. Deleting a Notebook Entry or Entity likewise deletes its entire Source subtree. There is no trash or recovery; a later archive feature replaces deletion with the same subtree semantics.

**Synonyms:** directory

### User

A person with an account. Has a username, email, password. Belongs to one or more Groups. Owns the entries and entities they create. The **username** is the user's display name (e.g. "Dr. Mira Kato") — it serves both as the login credential and the public identity. There is no separate `full_name` field.

### User Profile

A JSON blob (`profile`) on the User record holding extended professional identity fields: `title`, `position`, `pronouns`, `location`, `bio`, and `orcid`. All fields are optional — if absent from the JSON, the UI shows nothing. These fields are edited inline on the profile page through the About section. The **profile header** derives its affiliation line from the most recent entry in the Affiliations list.

### Affiliation

A structured entry in a User's career timeline. Has an `institution`, `role`, `department`, `start_date`, `end_date` (null = present), and an `order` for manual sorting. Owned by exactly one User. The profile header displays the most recent affiliation.

### Publication

A structured entry in a User's publication list. Has a `title`, `journal`, `year`, `role` (e.g. "First author"), an optional `url` (rendered as a clickable link icon in view mode), and an `order`. Owned by exactly one User.

### Recognition

A structured entry in a User's honors and awards list. Has a `title`, `issuer` (e.g. "EMBO"), `date` (free-text string, e.g. "2024" or "Q2 2026"), and an `order`. Owned by exactly one User.

### Organization

The single lab or company this deployment serves. Exactly one per deployment — every User, Team, and Project belongs to it. Has a name, short description, address, Dynamic Icon, and Color Token. The Organization exists to own Organization Roles and org-wide information; there is no org switching and no cross-org concept. Users open its dedicated profile-like page from the avatar menu.

### Team

A named collection of Users within the Organization, with a Dynamic Icon and Color Token. Teams are granted Project Roles — a Grant to a Team covers every member. Users can belong to many Teams. Team identity and membership are visible to every User and managed only by Organization Admins; there is no Team-specific administrator role. A Team with active Grants cannot be deleted.

**Synonyms:** group

### Project

A first-class root container for its folder tree, Entries, and Entities. Has a unique, renameable name, an immutable generated ID, a Dynamic Icon, and a Color Token. The generated ID identifies the Project in Library URLs, so its name can change without breaking links. Projects are the access boundary of the system: permissions are expressed as Grants on Projects, while Organization Admins can perform every operation on every Project. Every User can discover every Project's identity from the Organization Page, but only Users with effective access can open its content. The Library root lists accessible Projects; opening a Project navigates directly to that Project root.

**Invariant:** Every Entry, Entity, and Folder belongs to exactly one Project, derived from its Source chain and stored on the item. Every Entry, Entity, and Folder has exactly one Source. Folders, Entries, and Entities cannot move between Projects — a Source must resolve within the same Project. Projects are the only items without a Source. Projects are created by Organization Admins only. Project-owned content is never exposed through Hubs, search, Mentions, Views, Metrics, Cards, or Tabs to a User without effective access.

### Project Role

A fixed access level on a Project, granted to a User or Team: **Read** (browse and open content) or **Edit** (create, modify, move, and delete content). A fixed enum — users cannot define new Project Roles. Project identity, Grants, archiving, and Shared Folders are managed by Organization Admins rather than through a Project Admin role. (Editable, user-defined Profiles are a deferred future extension.)

### Organization Role

A fixed access level on the Organization: **User** (normal day-to-day work) or **Admin** (manage users, teams, projects, Grants, Shared Folders, schemas, and all org-wide settings). An Organization Admin can perform every operation on every Project. Only Organization Admins can edit Project identity, manage Grants, archive Projects, or create and revoke Shared Folders. A fixed enum, never editable — unlike Project Roles, no future configurability is planned.

### Organization Membership

The association of exactly one User with the singleton Organization and one Organization Role. Every User has exactly one Organization Membership. The deployment must always retain at least one active Organization Admin.

### Superuser

A deployment-level break-glass identity, created outside the Organization UI. Bypasses every access check exactly like an Organization Admin, so a deployment can never be locked out of its own administration. A Superuser also receives an Admin Organization Membership so the Organization surfaces behave consistently. An escape hatch, not a day-to-day role.

### Grantee

The User or Team that receives a Grant. Exactly one Grantee per Grant.

### Grant

The assignment of a Project Role to one Grantee on one Project. A User's effective role on a Project is the strongest across their direct Grants and all their Teams' Grants. Organization Admins bypass Project Role checks without requiring generated Grants.

### Shared Folder

A first-level Folder — a direct child of a Project — made visible to Projects other than the Project that owns it. Appears immediately at the root of each Project it is shared with; only Organization Admins can create or revoke the share. Each share carries an access level — **Read** or **Read + Write** — that caps each User's effective role on the sharee Project: Read grants read access, while Read + Write allows target Editors and Organization Admins to modify descendants within the shared subtree. The shared Folder itself cannot be renamed, moved, or deleted through the share, and descendants cannot be moved outside the subtree. The Project and nested Folders cannot be shared directly. Ownership never moves: the Folder and its contents keep their original Project.

### Archived Project

A Project hidden from the Library root and from new-content Project selectors without changing the accessibility of its existing content. Existing Entries and Entities remain visible through Hubs and direct Workspaces and remain editable according to effective access. Grants and Shared Folders remain in force. Archived Projects can be shown and restored from Settings.

### Organization Page

The profile-like page at `/organization`, opened from the avatar menu and visible to every User. Its header presents the Organization's identity and information. Its People tab lists active Users and identifies Organization Admins. Its Teams tab shows the platform's Teams and their members, grouped into the current User's Teams and Other Teams. Its Projects tab shows every non-archived Project's identity, grouped into the current User's Projects and Other Projects; a Project is "yours" when the User has a direct Grant or belongs to a Team with a Grant, while Shared Folders do not make a Project theirs. Its Access Policies tab shows the hardcoded policy matrix. The directory and policy information is read-only and identical for every User apart from personalized grouping. Organization Admins can edit Organization information from this page.

---

## Hub Architecture

The platform uses a **Hub → Workspace** navigation model. Hubs are free-form browsing pages; Workspaces are dedicated work surfaces at their own URLs. There is no shared three-panel layout — each hub owns its layout completely.

| Term | Definition |
|------|-----------|
| **Hub** | A free-form browsing page at a route like `/library` or `/home`. Each hub has complete layout freedom — card grids, stat tiles, tree views. Its job is to help users find the right thing. Hubs link outward to Workspaces at dedicated URLs. |
| **Hub Registration** | Hubs are registered via `registerHub({ id, label, icon, route, component, order })`. Automatically adds a sidebar nav item. |
| **Library Hub** | The hub at `/library`, registered by the Library mod. Root lists Projects; inside a Project, a card-grid view over its Folder hierarchy showing Folders, Entries, and Entities mixed (folders first), with expandable Source subtrees. Three view modes: List, Grid, Compact. |
| **Home Hub** | The hub at `/home`, registered by the Home mod (`order: 0` — first in sidebar). Landing page. |
| **Settings Hub** | The Organization Admin-only hub at `/settings`, registered by the Settings mod. Renders administrative settings sections from all mods, sorted by `order`. |

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

The **hub** at `/library` that presents a unified, filesystem-like view over Projects and their Folder hierarchies. At the root, the Library lists only the Projects the user has access to — an effective Project Role through a direct Grant, a Team Grant, or the Organization Admin override. Archived Projects are hidden from the root but their content remains reachable by members through a direct URL. Inside a Project, both child Folders and Entries appear together in a single card grid at any folder level, sorted with folders first; Folders shared with the Project appear at its root. The Library is a *browsing surface* — it is not a data model, but a presentation model layered on top of Projects and the Folder tree.

The Library renders three Item types: **Folders** (navigated into), **Entries**, and **Entities** — every item whose Source is the current Folder (or the Project, at root), sorted folders first, then entries, then entities. Rows whose item has children are expandable: expanding reveals the item's Source children in place as an indented subtree (VS Code-style indent guides, child rows slightly smaller), recursively — an Entry shows its registered Entities, an Entity shows its Results. Expansion state is session-local. When new content types are added, they appear in the same mixed grid with their own type icon and label.

**Invariant:** Every Item surfaced in the Library has exactly one Source.

**Synonyms:** file explorer, library browser

### Breadcrumb

The navigation bar at the top of the Library hub showing the current location as clickable segments: the Project name, then each Folder along the path. The Project name represents the Project root. The current folder is displayed as bold text (not a link). An up-navigation button (`↑`) moves to the parent folder.

**Invariant:** The breadcrumb always reflects the current `?project=` and `?path=` URL parameters. The `project` parameter contains the Project's immutable generated ID while the breadcrumb displays its name. Clicking a segment updates the parameters and reloads the card grid.

### Row Menu

The hover-revealed three-dot menu at the right end of every Library row (Folders, Entries, and Entities, all three view modes). Always opens a menu — never a direct action — with **Properties** (always) and **Delete** (only when the viewer can modify the row: Edit access, Organization Admin override, or a Read + Write share for rows inside a shared subtree). Rows whose only action is Properties still show a menu — predictability beats shortcut. The button stays in the DOM; reveal is pure CSS, so keyboard focus reaches it. Library rows only — the Entities hub has no Row Menu.

**Synonyms:** row actions, three-dot menu, kebab menu

### Properties Modal

The standard modal opened from a Row Menu's **Properties** action, built on the shared Modal primitive. Shows the metadata of one Folder or Entry; what is editable follows access — viewers without Edit see the same modal read-only. Changes **apply instantly** — no Save button, no dirty state.

**Entry properties:** status (with a note that it cascades to the entry's entire Source subtree), move (a searchable list of folder paths plus the Project root, excluding the current location — changing the entry's Source; constrained to the shared subtree when the entry is reached through a share), and read-only project, author, created, and updated dates. The header carries the display ID and title; the title is read-only — it is edited in the workspace, not here. Tags are absent — they are attached on the entry page and managed in Settings. Editable fields are disabled while the entry is locked by another user.

**Folder properties:** rename and the read-only created date. Top-level Folders in their owning Project additionally carry the Sharing Panel (Organization Admins only); nested Folders show a hint that only top-level Folders can be shared. A shared Folder opened through a sharee Project is read-only — it cannot be renamed through the share.

**Synonyms:** row properties, item properties

### Sharing Panel

The Organization Admin-only section of a top-level Folder's Properties Modal, shown only in the Folder's owning Project. Lists the Folder's shares — target Project identity, a **Read / Read + Write** level dropdown (changes apply instantly), and revoke (confirmed). New shares are added inline: a picker of non-archived Projects excluding the owner and already-shared targets, a level, and Add. Share constraints (one share per pair, overlap rejection, target-root name collisions) are enforced server-side and surfaced inline.

**Synonyms:** share management, folder shares panel

---

## LIMS Domain

### LIMS

The LIMS domain comprises Entity Types, Entities, and Actions. The LIMS mod registers the **Entities Hub** (`/entities`) — a flat, filterable, searchable table over every entity in the system, regardless of which mod owns the entity type. This is where saved Views are created and applied. Individual entities are accessed via their workspace URLs; the entity workspace is the default entity page — a hero header (icon, name, status, copyable display ID, Tags), a tabbed content area (always an Overview tab, plus one tab per enabled Schema Component), and a right-hand Activity panel. Entity types are managed through the Settings hub.

**Synonyms:** entity management, sample database

---

## ELN Concepts

### Notebook Entry (or "ELN Entry")

A single page of narrative lab documentation. Has a title, rich-text content (the Document), an author, a Source, timestamps, a status, and zero or more Tags. The primary unit of scientific narrative in the system.

An entry is the *whole thing* — metadata + document content. It is not the document.

**Invariant:** An entry has exactly one Source.

**Synonyms:** entry, ELN page, notebook page

### Entry Status

A user-settable lifecycle marker on a Notebook Entry. Two states: **In Progress** (the entry is being actively authored) and **Finished** (the entry is complete). The status is displayed as a pill-shaped badge in the metadata panel and is changed via a dropdown — no separate workflow or approval step.

Status cascades down the Source graph: when **any** item's status changes — an entry's or an entity's, manually or via an earlier cascade — the new status is written to every item in its Source subtree, transitively (entry → its registered entities → their results). The cascade is a synchronous write-through, strictly downward, and overwrites descendants' statuses; a manually overridden descendant is re-overwritten by the next upstream change. Items merely *referenced* (via Mentions) are never affected. Folders and Projects carry no status. See [ADR 0026](docs/adr/0026-source-replaces-containment.md), which supersedes [ADR 0005](docs/adr/0005-entry-status-cascade.md).

**Synonyms:** state, lifecycle marker

### Tag

A label created by Organization Admins that can be attached to taggable objects — currently **Notebook Entries** and **Entities**. Each Tag has a **name**, a **color** (chosen from a preset palette of semantic design tokens), and an **icon**. Tags are reusable — a Tag is visible across the Organization and can be attached to any taggable object. Tags have no hierarchy and no independent lifecycle. A Tag is not specific to one kind of object: the same Tag may label an Entry and an Entity.

Tags are **managed by Organization Admins** in Settings — creation, renaming, recoloring, and deletion. Users work with existing Tags only: on an object's workspace page they attach and detach Tags (which requires Edit access on the object) but never create or modify Tags themselves.

**Invariant:** A Tag's name is unique (case-insensitive). A Tag's color comes from the preset palette.

**Synonyms:** label, chip, keyword

### Taggable Object

An object a Tag can be attached to. Taggability is granted per object kind — currently Notebook Entries and Entities — and each taggable kind carries its own set of Tags. Attaching and detaching Tags always happens on the object's own workspace page and always requires Edit access on that object. Read-only viewers see the object's Tags without any attach/detach affordance.

_Avoid_: generic tag target

### Description

The summary paragraph of a Notebook Entry — a short, human-readable overview of what the entry is about. The Description is **not a separate database field**; it is stored as part of the Rich-Text Document (the TipTap JSON content). It is rendered above the main document body with distinct styling (muted color, larger text) and can be edited inline alongside the title.

### Breadcrumb

*(In the ELN Workspace context.)* The navigation bar at the top of the ELN Workspace showing the entry's Source Path as clickable segments, derived from the entry's hydrated Source Path. Project and Folder segments link to that level in the Library console; Entry and Entity segments link to their workspaces.

**Distinction from Library Breadcrumb:** The Library breadcrumb shows the *current browsing location* in the folder tree. The ELN breadcrumb shows the *entry's home location* — where it lives. Both use the same visual pattern; Library-bound segments link to the same Library URLs.

### Shared URL

A read-only link to a Notebook Entry's Workspace. The current implementation is the entry's canonical URL (`/eln/{display_id}`) — no token, no access control, no separate shared view. Anyone with the URL can view the entry. This is a placeholder; a proper sharing model with tokens, permissions, and a shared-view page is deferred to a future PRD.

### Linked Entity

An entity (from the LIMS domain) that is connected to a Notebook Entry through the Mention system. When a user references an entity in the TipTap content (via `@` or a `reference` node), a Mention row is created linking the entry to that entity. The Linked Entities section of the metadata panel renders these Mentions — showing the entity's type icon, name, and display ID. Each is clickable, navigating to the entity's Workspace in the LIMS console.

**Distinction from entities created in the entry:** Entities whose Source is this entry (created via Registry Tables in the content) are connected through the Source reference, not through Mentions. They may or may not appear as Linked Entities. A future PRD will unify both connection types in the panel.

### ELN Workspace Layout

The ELN workspace uses a three-track CSS grid inside `1.5rem` of content padding: `1fr / min(48rem, 100%) / 1fr`. The ProseMirror editor is the grid container; ordinary document blocks occupy the center track, which keeps narrative text readable on wide screens and prevents narrow windows from squeezing it into a sliver. Workspace chrome such as the title, description, tags, and metadata line shares that text-column alignment. The shell sidebar remains persistent chrome outside the content boundary, while the metadata sidebar is `256px` wide and hidden below the `xl` breakpoint (`1280px`).

### Dynamic Bleed

The layout role of every table block in the ELN editor (Registry Table, Plain Table, Result Table). The table's scroll viewport spans the entire content width (all three grid tracks), with the table anchored at rest so its left edge aligns with the text column's left edge; a narrower table fills exactly the text column. Wide tables bleed rightward as far as the content padding and persistent chrome allow, and horizontal scrolling slides the table leftward into the left region so that every column is reachable. The block's chrome bar (title and toolbar) and its add-row control stay anchored to the text column and never slide. A bleed never reaches the literal window edge.

### Workspace Chrome

The persistent UI frame of the ELN Workspace that surrounds the Document: the toolbar (breadcrumb, save status, actions, share), the title/description/tags block, the metadata line, the locked banner, the End of Entry, and the content padding that bounds the editor. Chrome is distinct from the **Document** (the editable rich-text content) and from **slot-rendered extensions** (blocks and buttons) — those are rendered into the chrome's regions but are not part of the chrome itself.

**Synonyms:** editor chrome, workspace frame

### End of Entry

Workspace chrome rendered below the Rich-Text Document on every Notebook Entry workspace. It is not document content — it is never saved into the document JSON, and it is identical for every viewer in both edit and locked/read-only modes. A thin rule with the entry's display ID on the left (e.g. `ELN – E123`) and the label `End of Entry` on the right. The empty region between the last block and the End of Entry accepts clicks and appends a new paragraph to the document.

**Synonyms:** entry footer, end marker

### Block Handle

The `::` affordance of the Block Controls, shown on row hover to the left of every top-level block. Press-and-move drags the block to another position in the document; a plain click opens the Block Action Menu. Hidden when the entry is locked or read-only.

_Avoid_: grip, drag handle

### Add Button

The `+` affordance of the Block Controls, shown on row hover to the left of empty paragraphs only. Opens the Block Popover; the chosen block takes the empty paragraph's position. A paragraph containing any content — even a lone reference node — is not empty. Hidden when the entry is locked or read-only.

### Block Popover

The shared block-insertion menu. Lists the same block catalog as the `/` command, filtered by a fuzzy search bar. The search bar is hideable per invocation: the Add Button shows it; the `/` trigger hides it, because the query typed into the text does the filtering there.

_Avoid_: slash menu (names only the `/` trigger path)

### Block Action Menu

The menu opened by clicking a Block Handle. Offers Delete, Duplicate, Move up, and Move down. Acts on the whole Block Selection when one exists, otherwise on the handle's own block.

### Block Selection

A set of top-level blocks chosen via Shift-click on their Block Handles. Selected blocks are highlighted; drag, delete, duplicate, and move apply to the set as a group — a multi-drag preserves the blocks' relative order. Cleared by Escape or by clicking into document text.

### Formatting Menu

The floating menu shown on a non-empty text selection in the document body. Offers Heading 1–3 (which convert the whole block), Bold, Italic, Strikethrough, Inline Code, and clear formatting. Never appears on custom blocks or table cells — table cells are not document text.

_Avoid_: bubble menu (implementation term)

### Block Controls

The hover affordances shown beside top-level blocks in the ELN editor — the Add Button (`+`) and the Block Handle (`::`). They are rendered as an overlay layer above the editor; they never become part of the document grid, and the document's grid rules and the Dynamic Bleed machinery are never modified for them. They appear in the flexible left `1fr` track of the ELN workspace grid, and that track is reserved for the Block Controls — no other UI may claim it. Distinct from the Center Gutter and Right Gutter.

**Synonyms:** block-controls track

### Center Gutter

The fluid center track of the ELN workspace grid — `min(48rem, 100%)`, centered between two flexible `1fr` tracks. Normal document blocks (paragraphs, headings, and lists) render here by default. Tables use the Dynamic Bleed layout role instead of remaining limited to this track.

**Synonyms:** content column, centered editor area

### Right Gutter

The flexible right track of the ELN workspace grid. It is available to Dynamic Bleed tables after their text-column-aligned start edge. The right track ends at the workspace content padding and persistent chrome. Distinct from the Metadata Sidebar.

### Metadata Sidebar

The ELN workspace's persistent metadata panel. It is `256px` wide and is hidden below the `xl` breakpoint (`1280px`); hiding it does not change the editor's content-padding boundary.

### Rich-Text Document

The structured content *inside* a Notebook Entry. A tree of blocks (paragraphs, headings, lists, tables) stored as a TipTap/ProseMirror JSON document. The document is the editable, renderable content — distinct from the entry's metadata (title, author, folder, dates).

**Invariant:** A document belongs to exactly one Notebook Entry.

**Invariant:** A document always ends with a paragraph — one is appended automatically whenever the last block is not a paragraph, so there is always a caret target at the bottom.

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

### Registry Table

A block within a Notebook Entry's Rich-Text Document (`registry-table`) that creates and edits Entities of one loaded Schema in tabular form. Schema columns become typed cells; the implicit Name Column is the second column; each row maps to one Entity. The loaded Schema is snapshotted into the block and locked — a refresh action migrates the snapshot when the Schema has changed.

Registration is **explicit**: the user reviews the table and presses the register button, which batch-creates/updates the row Entities via the LIMS API and patches Display IDs back into the document. Saving the Entry does not register rows. Each row carries a registration status (unregistered, registered, changed-since-registration, schema-changed) shown as a status indicator.

**Synonyms:** registration table (informal), LimsTable (deprecated)

### Plain Table

A block within a Notebook Entry's Rich-Text Document (`table`) providing a simple free-form table — arbitrary columns and rows of typed cells with no Schema, no entity registration, and no register button. For when the user just wants a table.

**Synonyms:** simple table, normal table

### Table Kit

The Shell-owned deep module behind table-block grids. `TableKit` accepts shape-resolved columns and a controlled two-dimensional grid of typed values, and owns cell rendering/editing, selection, keyboard interaction, typed clipboard conversion, read-only filtering, bounds clamping, and grid layout. Table blocks resolve domain Column Types, map their row objects to and from the grid, and retain persisted state, registration, formula previews, server calls, and block chrome. Leading and trailing decoration slots keep block-owned status and action UI alongside the non-selectable grid.

**Synonyms:** table framework

### Cell Selection

The set of cells currently selected in a table. Always contains exactly one Active Cell. A selection is either a rectangular **Range** (created by dragging or Shift gestures) or non-contiguous (built with Ctrl gestures). Copy serializes the whole selection; paste targets the Active Cell. A plain click or plain arrow key collapses any selection to that single cell.

### Active Cell

The single cell in a table that is the target of keyboard focus, editing, and paste. Marked with a heavier border than the rest of the Cell Selection.

_Avoid_: current cell, focused cell

### Selection Anchor

The origin cell from which a Range is extended by dragging or Shift gestures. Only plain clicks, plain arrow keys, and drag origins move the Anchor — Ctrl gestures move the Active Cell without moving the Anchor.

### Range

A rectangular Cell Selection defined by two diagonally opposite corner cells. Created by dragging or Shift gestures, always extended from the Selection Anchor. Non-contiguous selections are copied as their bounding Range, with unselected cells left blank.

### Mention

A parsed reference from one Notebook Entry to another object (another Entry, an Entity, or any registered entity type). Created when a `#` reference is found in the entry text or when a `reference` node or a Registry Table row references a display ID. The Mention stores the source entry, the target object, and the surrounding context text.

**Resolution chain:** The Mention system is a **listener** to LIMS — it does not encode entity type or workspace knowledge itself. Resolution follows a single chain:

1. `displayId` (e.g. `DNA34`) → extract prefix (`DNA`)
2. Prefix → look up in LIMS's registered entity types → find the owning workspace (`molBio`)
3. Build URL by convention: `/{workspaceId}/{displayId}` → `/molBio/DNA34`

The server's resolve endpoint (`POST /api/mentions/resolve/`) returns `workspaceId` alongside resolved metadata. The frontend uses the convention to build navigation URLs — no hardcoded type-to-URL branching.

**Invariant:** A Mention has exactly one source entry and exactly one target object. Every mentionable entity type is registered with LIMS, which owns the prefix→workspace mapping.

**Access:** Resolution respects Project access — resolve and search only return targets the viewer has effective access to (direct Grant, Team Grant, Organization Admin override, or a Shared Folder). Inaccessible targets simply do not resolve; the UI renders whatever resolution returns.

**Cross-workspace navigation:** Clicking a MentionBadge navigates to the target entity's workspace via `/{workspaceId}/{displayId}`. This works for any registered entity type without per-type wiring — a MolBio DNA sequence resolves and navigates the same way a LIMS sample does.

**Synonyms:** reference, link, `#`-ref

### Entry Version *(deferred)*

A point-in-time snapshot of an entry's rich-text document. When a user saves changes, a new Version is created. The current document is always the latest version; older versions are immutable history.

**Synonyms:** revision, snapshot, save point

---

## LIMS Concepts

### Entity

A trackable physical or conceptual item in the lab. Has a name, a type (EntityType), a display ID, extensible JSON properties, and a Source. Examples: a DNA sample, a chemical reagent, a buffer solution, a piece of equipment.

An Entity is *structured data* — it has typed properties and a known schema (via its EntityType). This distinguishes it from a Notebook Entry, which is *unstructured narrative*.

**Invariant:** An Entity has exactly one EntityType.

**Synonyms:** sample (rejected — too narrow; entities include reagents, equipment, etc.), item

### Entity Type

A classification of Entities. Defines what kind of thing an Entity is (e.g., "DNA", "Chemical", "Buffer", "Equipment"). Carries a schema (`columns`) that defines the JSON properties an Entity of this type can have — each column has a name, type (Text, Number, Date, Boolean, Reference), and optional defaults, units, and description.

Each EntityType has a unique `prefix` (e.g., "DNA", "BLOOD") used to auto-generate display IDs and route references.

**Synonyms:** sample type (rejected — same reason as above), category

### Schema

The structure — name, prefix, and columns — that an Entity is created from. A Schema is owned by exactly one Entity Type. Entities FK to their Schema; the Schema's `columns` array defines the JSON properties an Entity of that Schema can hold. Concrete, queryable, and the unit of data modeling.

A Schema also carries a **Dynamic Icon** and a **Color Token**, chosen by the user at creation time. They are the presentation identity of every instance of that Schema — shown on tabs, mention badges, library rows/cards, and the schema settings list. (The Schema Type deliberately carries no presentation — type-level displays use the default Schema's icon.)

**Invariant:** An Entity's schema reference is immutable after creation (changing an entity's schema would break its stored properties).

**Distinction from Entity Type:** Entity Type is the workspace-registered *category* (e.g. "DNA Sequence"). Schema is the *structure* you build entities from (e.g. "pUC19 Plasmid" with columns `[Resistance, Length, Sequence]`). One Entity Type can own many Schemas.

**Synonyms:** blueprint, entity template, data structure

### Reference Column

A schema column of type `"reference"` whose value points at an entity from another schema. Declared with an optional `referenceSchemaId` that constrains the target to a specific Schema — when set, the server validates that referenced entities belong to that schema. When unset, the reference is open to any entity. Values are stored as display-ID strings in the entity's JSON `properties` field.

Reference columns establish **logical links** between schemas — a "parent sample" column on a DNA schema pointing at a Blood schema. The relationship map renders these as edges between schema cards.

A reference column's value is a **soft reference** — no FK constraint. Deleting the target entity leaves a dangling reference; the UI tolerates this (showing a stale indicator) until a full schema-lifecycle system addresses cascading behavior.

**Synonyms:** cross-schema reference, soft reference, entity reference

### Schema Type

The canonical term for a workspace-registered category that Schemas belong to. Declared by a mod via `register_schema_type()` and recorded in the backend `RegisteredEntityType` table. "Entity Type" is retained as a synonym — both refer to the same concept.

**Invariant:** Every Schema belongs to exactly one Schema Type. The Schema Type owns the prefix allocation (e.g. `DNA`) used for display ID generation.

**Synonyms:** entity type, registered entity type, content type

### Schema Type Tag

A capability label on a Schema Type (e.g. `RegistrationTable`, `ResultTable`) that controls which table blocks offer its Schemas and which schema-settings tabs list it. Registry Tables show only schemas of `RegistrationTable`-tagged types; Result Tables only `ResultTable`-tagged ones; untagged types (e.g. ELN Entries) appear in neither. Tags are declared by the owning mod at registration.

**Synonyms:** type tag, capability tag

### Schema Component

A registered, optional tab on an entity's workspace that a Schema can enable. Mods register Schema Components on the frontend (label, icon, tab renderer); Organization Admins enable or disable them per Schema in the **Schema Components** section of schema settings, and the enabled set is persisted on the Schema. Every enabled Schema Component adds its tab to every entity of that Schema. Registration is frontend-owned — a Schema Component that needs backend capabilities relies on its mod's existing backend registrations (endpoints, services) rather than on a component-specific backend registry. Enabled IDs that resolve to no registered component are silently skipped. Currently offered for entity Schemas only; the concept is deliberately not limited to entities.

The first Schema Component is **Results** — a read-only tab showing every Result Entity whose Entity Column points at the entity, grouped into one block per Result Schema.

**Synonyms:** entity component (rejected — limits the concept to entities)

### Entity Column

The distinguishing column of a Result Schema: an entity-reference column constrained at design time to one Schema or one Schema Type. Each Result Table row inserts one matching Entity into this column, tying every Result Entity to a source Entity. It replaces the implicit Name Column on result schemas. The Entity Column is user-filled data; at registration the Result Table additionally sets the Result Entity's **Source** from it. The two are stored separately and are expected to agree in the UI — the column value is never derived from Source.

**Synonyms:** source entity column, entity slot

### Result Schema

A Schema belonging to a `ResultTable`-tagged Schema Type. Structured like an entity Schema but with an Entity Column instead of the implicit Name Column. Managed in the Result Schemas tab of schema settings.

**Synonyms:** result definition

### Result Entity

An Entity created from a Result Table row. Entity-like in every respect — Display ID, typed properties, appears in the Entities Hub under its result type — except its identity comes from its Entity Column rather than a user-assigned Name, and it has no Workspace yet (a later PR gives results a place to live). A Result Entity's Source is the Entity in its Entity Column, set automatically at registration — results live under their source Entity in the Source graph.

**Synonyms:** result, result record

### Result Table

A block within a Notebook Entry's Rich-Text Document that loads a Result Schema and registers rows as Result Entities. It owns schema loading, formula evaluation and preview, registration, status, and server actions while delegating its shape-resolved typed grid, controlled row mapping, interaction, clipboard behavior, and decoration slots to TableKit. Looks and behaves like a Registry Table — typed cells, explicit register button — but each row inserts a source Entity into the Entity Column instead of typing a Name.

**Synonyms:** results table, assay table

### Registered Entity Type

A declaration by a mod that it contributes an entity type to the LIMS registry. The registration provides:

- **prefix** — the letter prefix for display IDs (e.g. `"DNA"`, `"E"`). Unique across all registrations; LIMS validates no collisions.
- **entityType** — the ContentType name (e.g. `"dna_sequence"`, `"eln_entry"`).
- **workspaceId** — the workspace that owns entities of this type. Used by Mentions to build navigation URLs.
- **displayName** — human-readable label (e.g. `"DNA Sequence"`).

LIMS is the **gatekeeper** for all entity type registrations. Mods register their entity types in the backend (via `register_schema_type()`); the frontend discovers them at boot via the mod registry API. The backend stores registrations in a `RegisteredEntityType` model; the resolve endpoint joins through it to map any `displayId` to its owning workspace.

**Registration flow:** Mod backend boot → `register_schema_type()` → LIMS validates prefix uniqueness and stores the registration. The backend (`RegisteredEntityType` table) is the authoritative mapping; the frontend hydrates its in-memory registry from the backend at boot.

**Invariant:** Every prefix is owned by exactly one entity type. The prefix `E` is reserved for ELN Entries (registered as a custom entity type). The backend `RegisteredEntityType.prefix` has a `unique=True` constraint.

**Out of scope (for now):** custom entity behaviors (DNA sequence viewer, GC analysis), per-entity-type action sets, dynamic registration after boot.

### View (Saved View)

A named, saved filter configuration over the Entities Hub population. Has an owner, a name, and a filter state (search, schema, status, per-column filters, sort). Can be shared with all users (public) or kept private. A View defines *which* entities are in scope — and nothing else. It says nothing about how the population is displayed or reduced.

**Synonyms:** saved view, saved filter

### Metric

A named reduction of a View to a quantitative result: an aggregate function (count, average, standard deviation, …) applied to one column over the View's population. References exactly one View. The Metric is the platform's unit of data display and monitoring — home-page cards render Metrics, and notification rules threshold Metrics.

A Metric's result is a single **scalar** value. Other result shapes (see *Breakdown*) may be added later; the Metric concept is designed to admit new shapes.

**Invariant:** A Metric always evaluates against the *current* definition of its View — editing a View immediately changes what its Metrics report. (Contrast with Protocol Blocks, which deliberately snapshot at insert time for traceability.)

**Distinction from View:** a View answers "which entities?"; a Metric answers "how many / how much?".

**Synonyms:** measure, aggregate (rejected as a noun — "aggregate" is the function, not the thing)

### Breakdown *(deferred)*

A future Metric result shape: the reduction is computed **per bucket** of a second column, yielding one value per bucket (e.g. average temperature *per freezer*, entity count *per status*) instead of a single scalar.

**Synonyms:** group-by, per-bucket reduction

### Metric Card

A Metric pinned to a **surface** (the Home hub, the profile page) for display. The surface is part of the Card's identity — the same Metric-card system serves every surface, and a Card belongs to exactly one. Carries presentation configuration — a label, an icon, and **conditional formatting** rules that map the Metric's live value to colours, icons, and text (e.g. "below 5 → warning colour, 'Attention required'"). A Card references its Metric by identity; creating the Metric and creating the Card are separate steps, and one Metric can back many Cards.

A Card is either **global** (system-seeded, shown to everyone, not user-editable — users *fork* a copy to customize) or **personal** (owned by one user). A surface shows the union of global cards and the viewer's own cards. Because "by me" filters resolve per viewer, one global card shows every user their own numbers.

**Synonyms:** stat tile, dashboard card

### Metric Reading *(deferred)*

One recorded value of a Metric at a point in time. Today Metrics are computed **live** — the aggregate runs against current data on every read, and no history is kept. Recorded readings (periodically snapshotted by a scheduled process) are the deferred foundation for trend graphs and "changed by X% this week" displays.

**Synonyms:** metric snapshot, data point

### Project Filter

A filter on the Entities Hub that narrows rows by Project. A multi-select over the Projects the viewer can access (effective Project Role or Organization Admin override); archived Projects are not offered. Participates in the standard field-filter machinery (`?f=`), saved Views, and Metrics like any other column filter. Absence of a Project Filter means all Projects — saved Views created before the filter existed keep their meaning.

**Synonyms:** project column filter

### By Me Filter

A filter on a user column that resolves to the **current viewer** rather than a fixed user. Stored unresolved; substituted with the viewer's identity at evaluation time. Makes any View, Metric, or Metric Card self-personalizing — one shared definition yields per-user results.

**Synonyms:** current-user filter, "assigned to me"-style filter

### Notification Rule *(deferred)*

A threshold condition on a Metric that sends a message via a channel (email, ntfy, in-app) when crossed. Requires a periodic evaluation loop (no scheduler exists in the platform yet). Structurally, a Notification Rule's condition is the same predicate as a Metric Card's conditional-formatting rule — a future "promote this card rule to a notification" flow is the intended bridge. Deferred to its own PR, built on top of Metrics.

### Current Value *(deferred)*

A future aggregate-like function that returns the **raw value** of a column rather than reducing the population — meaningful when a View narrows to a single entity (e.g. "the current temperature of freezer 3"). Becomes useful once property values are maintained automatically (sensor integrations); until then, `avg` over a single-row View serves the same purpose.

**Synonyms:** raw value, select value

### Entity Action

A user-explicit operation recorded on an Entity. Has a type (e.g., "Used", "Created", "Measured", "Noted"), the performer, optional data (e.g., `{"volume_ul": 50}`), and an optional source Notebook Entry (the entry where this action was recorded).

Entity Actions are **user-explicit** — the user records them deliberately. They are not inferred from text. Distinct from the cross-mod [Action Log](#action-log) entry below.

**Invariant:** An Entity Action acts on exactly one Entity.

**Synonyms:** entity event, entity operation, entity activity

### Core Action

One of four universal operations understood by the Action system: **read**, **created**, **edited**, or **deleted**. The Action's access policy is evaluated before the operation. Read Actions are authorization-only and are not logged; successful mutating Actions produce Action Log Entries. For now, access policies are hardcoded for Core Actions. Custom Actions inherit the policy of the Core Action they map to; per-mod policy registration and overrides are deferred.

### Action Policy

The access rule evaluated before an Action can run. A policy can require a Project Role, an Organization Role, ownership, authentication, or public access. Authorization failure stops the operation; failure to write the subsequent audit record does not undo an operation that already succeeded.

### Action Log Entry

A framework-logged record of any mutating operation in the system. Created automatically by the `log_action()` dispatcher — not manually by users. Each entry records: who performed the operation (`performed_by`), what they did (`action_type`), what record they acted on (`target_type`, `target_id`), when (`created_at`), and relevant metadata about what changed (`metadata` JSON).

Action log entries are the **audit trail** for CFR Part 11 compliance. Every mod owns its own action table via `register_action_model()`. Action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"` (e.g. `"eln.entry.created"`, `"eln.table.edited"`).

**Invariant:** An action log entry belongs to exactly one mod's action table. Action logging failure must never break the operation being logged.

**Synonyms:** audit record, action log row, logged action

---

## Formulas

> Computed Fields use the shared formula grammar, parser, and Function Catalog. See [ADR 0019](docs/adr/0019-formula-evaluation-ownership.md) and the [formula spec](docs/specs/formula-support-cell-formulas-and-computed-fields.md).

### Formula

An expression in the shared formula grammar: `[Column Name]` references, literals, operators, and function calls, with tagged errors (`#DIV/0!`, `#CYCLE!`, `#NAME?`, `#SYNTAX!`, `#VALUE!`). Computed Fields are schema-authored and backend-authoritative.

### Computed Field

A schema column (column type `formula`) whose expression is authored in the Formula Editor at schema creation and applies to every row. Available on all schemas. Cells are read-only and render through the declared result type. The backend is authoritative: it validates the expression at schema save and computes the stored value at registration; client implementations provide a live, display-only preview. A registered value is stored together with the expression version that produced it — editing an expression marks affected rows stale rather than rewriting stored values.

**Synonyms:** formula column (the column type's id is `formula`)

### Preview

The display-only, client-side evaluation of a Computed Field: the value shown in the cell as inputs are typed, produced by the client engine — never the value stored. An expression whose functions all have Client Implementations previews live; an expression containing any function without one shows a placeholder instead, awaiting Refresh. Incomplete inputs produce a silent placeholder — no request, no error flicker. Errors appear only for complete-but-invalid data.

### Refresh

The row action (three-dot menu of the Registry Table and Result Table) that recomputes the row's Computed Fields through the Evaluate Gateway, in dependency order, when the row's expressions contain functions without Client Implementations. Available only when every referenced input is complete; fetched values persist in the document and render dimmed (stale) once inputs change, until the next Refresh. Display-only infrastructure — Refresh never produces stored values.

### Formula Function

A named function usable in Formulas (e.g. `SUM`, `IF`, `molBio.gcContent`). Has exactly one definition and one authoritative backend implementation, both registered in the backend; may optionally carry one client implementation as an optimization. There are no frontend-only functions — anything the frontend can evaluate, the backend can too.

### Function Catalog

The registry of all Formula Functions: backend-owned, mod-extensible, hydrated to the frontend via the mod registry API like column types. Platform-default functions register in the core; mod functions register in their mod with namespaced ids. Each entry declares whether its function has a Client Implementation. The frontend exposes the full catalog for Computed Field editing.

### Client Implementation

The optional frontend implementation of a Formula Function, registered against the hydrated Function Catalog for display-only Computed Field previews — never for stored values. It must be behaviorally identical to the authoritative backend implementation. Each Formula Function declares whether it has a Client Implementation; the client verifies the declaration against its own registrations at boot.

### Backend-Only Function

A Formula Function that has no Client Implementation. The backend evaluates it authoritatively; the client cannot preview it — Computed Field cells that use one show a placeholder awaiting Refresh. Backend-only-ness is queryable catalog data: the question "which functions in this expression lack a Client Implementation?" is answered by the engine, not by scanning the expression text. `#NAME?` is reserved for names absent from the Function Catalog entirely — a Backend-Only Function is known, merely unimplemented on the client.

### Evaluate Gateway

The row-scoped endpoint (`POST /api/formulas/evaluate/`) that previews Computed Field values for expressions containing functions without a client implementation, invoked by the row's Refresh action. Takes one expression plus one row of values and returns one tagged result; Refresh calls it once per column, in dependency order. Display-only infrastructure — stored values come exclusively from the registration path, never from the gateway.

### Formula Editor

The modal opened from the Fx button (sigma icon) on a Computed Field column in schema settings — the expression's only editing surface. It composes the expression with autocomplete over sibling columns and the full Function Catalog, shows live validation, and carries a test bench that evaluates sample values through the Evaluate Gateway.

### Parity Fixture

A named case in the shared parity corpus: an expression, a row of values, and the result both formula engines must produce. A fixture exercising a Backend-Only Function pins the backend's value and pins the client's inability to produce one. Fixtures are hand-authored — they are the behavioral specification of the seam, never generated from either engine's output (a generated expected value would launder an engine bug into the spec).

### Parity Suite

The shared Parity Fixture corpus plus the standing guarantee that **every Formula Function in the Function Catalog appears in at least one fixture** — whether or not it has a Client Implementation. Both engines run the same corpus in their own test trees; drift between the engines is caught wherever the corpus looks, and the corpus is forced to look everywhere.

---

## Sidebar & Navigation

### CollapsibleSidebar

A shared component (`src/shell/src/shared/components/Sidebar/`) that wraps a full-height sidebar panel and provides collapse/expand behavior. Owns the toggle button, collapse animation, and section management. Supports two variants:

- **Icon Strip** (left sidebar): collapses to a narrow vertical bar (~48px) showing only icons — Helix logo, hub icons, workspace icons — with a thin divider between hub icons and workspace icons. All text labels are hidden.
- **Full Hide** (right sidebar): collapses to a thin toggle strip (~24px) on the outer edge. A `[>]` button re-expands the sidebar. No content or icons shown.

Sidebar collapse state is independent of section collapse state — collapsing the whole sidebar preserves which sections were collapsed when it re-expands.

### Sidebar Section

A named, collapsible group within a CollapsibleSidebar (e.g., "Tabs", "Metadata", "Activity"). Has a header with a chevron toggle. All sections are collapsible by default; opt-out via `collapsible={false}`. Collapse icon convention follows VS Code: `▼` (ChevronDown) when expanded, `>` (ChevronRight) when collapsed.

### Collapsed Section

A Sidebar Section whose content is hidden. Renders as a thin clickable header bar in its original position — not moved to a separate tray. The header shows the section label and `>` icon. Clicking re-expands the section in place. Multiple collapsed sections stack as thin bars at their original positions, preserving order.

### Icon Strip

The narrow (~48px) collapsed state of the left sidebar. Renders a vertical stack of icon buttons: Helix logo (top, decorative — no action), hub icons (clickable, navigate to hub), a thin horizontal divider, and workspace icons (clickable, navigate to pinned workspace). Icons are provided by the consumer (`Layout.tsx`); the Icon Strip is a dumb renderer. The helix logo is decorative only and performs no navigation.

### Sidebar Toggle

The `[<]` / `[>]` button that collapses/expands an entire sidebar. Positioned on the outer edge: right edge for left sidebar, left edge for right sidebar. When the sidebar is collapsed (right, variant full-hide), the toggle appears in a thin persistent strip.

### Tab (Pinned Workspace)

A workspace (Entity or Entry) that a User has bookmarked for quick access. Tabs appear in the sidebar's **Tabs** section and persist across sessions. Each Tab stores the target's **display ID**, a human-readable **label**, and the **dedicated URL** for navigation. The label is a snapshot supplied by the frontend at pin time and refreshed whenever the User visits the workspace — the Tabs mod does not resolve names itself. A Tab row shows the label as the primary text with the display ID alongside in small, muted text; when no label exists yet, the display ID stands in. The Tabs mod (formerly Pins) owns the pinning lifecycle and renders the Tabs and History sections of the sidebar.

**Lifecycle:**
- A User pins a workspace from any History row (hover to reveal the pin button) — the new Tab is placed at the top of the Tabs root list, carrying the name History already resolved
- A User unpins a workspace via the sidebar (hover to reveal the unpin button on a pinned row)
- Tabs are ordered by the User — drag-and-drop re-ordering at the section root and inside Tab Folders, persisted as the layout
- A Tab lives either at the root of the Tabs section or inside exactly one Tab Folder; moving a Tab is a move, never a copy

**Invariant:** A Tab belongs to exactly one User. A User cannot pin the same workspace URL twice. A Tab lives in at most one Tab Folder.

**Stale targets:** Deleted or inaccessible targets are not detected — a Tab keeps its snapshot label and clicking it navigates to the workspace's error page, like any broken link. Automatic label refreshes on visit are not logged.

**Out of scope:** inline workspace previews.

**Synonyms:** bookmarked workspace, saved workspace, workspace tab

### Tab Folder

A named, User-created container that organizes Tabs within the Tabs section. One level deep — a Tab Folder holds Tabs only, never other Tab Folders. Folders are created from the Tabs section header, renamed via a row menu, and can be re-ordered by drag alongside root Tabs. Clicking a Tab Folder expands or collapses it; the expanded state persists across sessions.

Deleting a Tab Folder **deletes every Tab inside it**, confirmed by a warning that names the number of affected Tabs. Folder lifecycle events are logged like Tab events; re-ordering is not.

**Invariant:** A Tab Folder belongs to exactly one User. A Tab Folder never nests inside another Tab Folder.

**Synonyms:** pin folder, bookmark folder

### History

The sidebar section under Tabs listing the workspaces the User has visited, without any pinning required. Every visit to a workspace URL records the item; revisiting moves the existing record to the top rather than duplicating it. The list is capped at 20 items (oldest falls off), most-recent-first, and deliberately includes pinned workspaces too — History is intentionally dumb: no filtering, no Tab Folders, no organization. Every row carries a hover pin button (promoting the item to a Tab) and a hover remove button; the currently open workspace is always the topmost, highlighted row.

History is **device-local**: it belongs to the browser, not the User account, and does not follow the User across devices — unlike Tabs, which persist per User.

**Invariant:** A History record is keyed by workspace URL — exactly one record per URL.

**Synonyms:** recently visited, recent workspaces

---

## Relationship Summary

```
Library Hub ──▶ Projects ──▶ Folder tree (the Library is the browsing surface; root lists Projects)

Organization ──▶ Team (1:N — org has many teams)
Organization ──▶ Project (1:N — org has many projects)
Team ──▶ User (M:N — teams have many users; users can be in many teams)
Project ──▶ Grant ──▶ User | Team (Project Roles granted to users and teams)
Folder ──▶ Shared Folder ──▶ Project (M:N — a folder shared into other projects' roots, per-share access level)
NotebookEntry ──▶ Project (N:1 — denormalized owning project, derived from the Source chain)
Entity ──▶ Project (N:1 — denormalized owning project, derived from the Source chain)

Source graph (replaces folder ownership — see ADR 0026):
Project            ──▶ no Source; root of every Source chain
Folder ──▶ Source  ──▶ Folder | Project
NotebookEntry ──▶ Source ──▶ Project | Folder | NotebookEntry | Entity
Entity ──▶ Source  ──▶ Project | Folder | NotebookEntry | Entity

NotebookEntry ──▶ Mention (1:N — entry can mention many things)
NotebookEntry ──▶ Tag (M:N — entry can have many tags; tags belong to many entries)
NotebookEntry ──▶ ProtocolBlock (1:N — entry content can contain many protocol blocks)
Mention ──▶ NotebookEntry | Entity (target of the reference)

Protocol ──▶ Protocol Item (1:N — protocol has ordered items)
Protocol Item ──▶ Step | Note (discriminated by type field)
ProtocolBlock ──▶ Protocol (N:1 — block snapshots a protocol at insert time; no live link)

Entity ──▶ Action (1:N — entity has many actions recorded)
Action ──▶ NotebookEntry (N:1 — action optionally recorded in an entry)

EntityType ──▶ Entity (1:N — type classifies many entities)
RegisteredEntityType ──▶ EntityType (1:1 — registration links an entity type to a workspace)
RegisteredEntityType ──▶ Workspace (N:1 — registration declares which workspace owns the entity type)

Schema.referenceColumn ──▶ Entity (soft reference via display ID in properties JSON, constrained by referenceSchemaId)

Slot ──▶ BlockBinding | ButtonBinding (1:N — slot resolves to ordered bindings)
Block ──▶ SlotBinding (M:N — block can be bound into many slots)
Button ──▶ SlotBinding (M:N — button can be bound into many slots)

Tag (standalone — reusable labels with name + color, managed inline on entries)

User ──▶ NotebookEntry (1:N — author of entries)
User ──▶ Action (1:N — performer of actions)
User ──▶ Entity (1:N — creator of entities)
User ──▶ Tab (1:N — user bookmarks workspaces)
User ──▶ Tab Folder (1:N — user organizes tabs into folders)
User ──▶ Affiliation (1:N — user has career timeline entries)
User ──▶ Publication (1:N — user has publications)
User ──▶ Recognition (1:N — user has honors and awards)

User.profile (JSON blob on User record: title, position, pronouns, location, bio, orcid)

Item.status ──cascades to──▶ status of every item in its Source subtree (downward, transitive, overwriting)

ModLoader ──▶ ModRegistry (populated by register*() calls from mod index.ts / mod.py)
              ├── Registered Hubs → sidebar nav + routes
              ├── Registered Entity Types → prefix→workspace mapping (backend-declared, frontend-discovered via API)
              ├── Registered Settings Sections → settings shell panels
              ├── Registered Blocks → renderer-agnostic content units
              ├── Registered Buttons → toolbar actions
              ├── Declared Slots → named workspace placeholders
              ├── Slot Bindings → block/button→slot connections
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

A **Folder** is a data-model concept — a node in the folder tree with a Source and a name; it owns nothing, items point at it as their Source. The **Library** is the console that lets users navigate, search, and open items within the folder hierarchy. The Library shows a mixed list of folders, entries, and entities sourced at the current location; folders are navigated *into*, entries are opened, and rows with children expand into Source subtrees.

### Project vs Folder

A **Project** is the access boundary: it carries a Dynamic Icon and Color Token, owns Grants, and appears at the Library root. Projects are few and curated — created by Organization Admins only. A **Folder** is a plain library node inside a Project's tree: many, free-form, carrying no permissions of its own (a Folder only affects access when it becomes a Shared Folder).

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

> Visual design terms that form the ubiquitous language for UI decisions. The full styling reference is deferred to a future PRD.

### Semantic Icon Size

A named icon size token — not an ad-hoc pixel value. The three canonical sizes are **sm** (14px, for inline icons inside text or badges), **md** (18px, the default for button icons), and **lg** (24px, for standalone action icons and empty states). Using tokens ensures consistency and makes size changes systematic.

**Synonyms:** icon size token, named icon size

### Tooltip Rule

The hard rule that every icon-only button must have a `title` attribute (native browser tooltip) and an `aria-label` attribute (screen reader label). No exceptions — an unlabeled icon button is inaccessible and ambiguous. This rule applies to all buttons containing only an SVG icon.

**Synonyms:** mandatory tooltip, icon accessibility rule

### Typographic Scale

The set of ten canonical font sizes expressed as CSS custom properties: `--text-2xs` (10px), `--text-xs` (11px), `--text-sm` (12px), `--text-base` (13px), `--text-md` (14px), `--text-lg` (16px), `--text-xl` (20px), `--text-2xl` (24px), `--text-3xl` (30px), `--text-4xl` (42px). Every component references a scale token rather than a raw size. The scale uses `rem` units, so it respects the user's browser font size preference.

**Deliberate deviation:** `--text-base` is 13px — the platform's dominant UI density — not the 16px framework default. Sizes below 12px exist for eyebrows, table headers, and badges; sizes above 24px exist for display titles.

**Synonyms:** type scale, font size tokens

### Font Role

The rule that text uses one of two canonical font families by **role**, never a raw `font-family` value. **Label** (`--font-label`, JetBrains Mono) is the voice of the interface: sidebar section headers, table headers, tabs, eyebrows, settings labels, display IDs, data cells, badges — and page/UI titles (settings heroes, hub heroes, login titles). **Body** (`--font-body`, Inter) is the voice of content: names of things (entry titles, entity names, profile names), editor narrative, button labels, and prose. There is no serif role — the former `--font-serif` token was removed; titles are typeset by role and scale, not by a third family.

**Synonyms:** font family role, type role

### Action → Icon Mapping

The curated table that assigns exactly one Lucide icon to each user-facing action (e.g., Save → `Save`, Delete → `Trash2`, Settings → `Settings`). This mapping is authoritative — two different buttons for the same action must use the same icon. The mapping lives in the styling guide, not in code, so it can be consulted during design review before implementation.

**Synonyms:** icon catalog, icon assignments

### Icon Library

The curated set of icons managed in Settings that users choose from when assigning an icon to a domain object (Schema, Tag, Metric Card). Contains Lucide icon references and uploaded custom icons (SVG-only, stored as sanitized markup in the database), indistinguishable to the picker. User-facing icon pickers offer **only** what is in the Icon Library — never the full Lucide catalog.

**Invariant:** Deleting a library entry is always allowed, even while in use. Referencing objects keep the dangling key and render the hardcoded fallback (a neutral circle glyph, `muted` color). Re-adding an entry under the same key heals all references automatically.

**Synonyms:** icon set, managed icons

### Static Icon

An icon assigned **in code** at registration time — column types, hubs, sidebar slots, buttons. May reference any Lucide icon directly; it is not drawn from the Icon Library and requires no curation step. Static Icons are display-only: users see them but can never change them.

**Synonyms:** fixed icon, code-set icon

### Dynamic Icon

An icon chosen by a **user** from the Icon Library and stored on a domain object (Schema, Tag, Metric Card). Editable by the user at any time via the shared icon picker.

**Synonyms:** picked icon, user-assigned icon

### Color Token

A named color in the platform palette, managed by admins in Settings (add, name, define). Every place that stores an icon may also store a Color Token alongside it — tags, schemas, metric cards, and code-level registrations alike. Pickers offer **only** palette colors; arbitrary hex input is not allowed. The default Color Token for new objects is **muted** (gray).

**Synonyms:** palette color, named color

### Theme Token

A CSS custom property that defines one slot of the application's own visual theme (e.g. Primary, Accent). Theme Tokens color the **app chrome and components** — never domain objects. This is the hard distinction from **Color Token**: a Color Token is *data* stored on a domain object (tag, schema, metric card); a Theme Token is *styling* applied to the platform itself. Theme Tokens are the layer that user Preferences will override.

**Synonyms:** design token, CSS variable, theme variable

### Theme Seed

A Theme Token that is **set directly** — never derived — and anchors one family of Derived Shades. The five canonical seeds: **Background** (app canvas), **Surface** (raised panels and cards), **Ink** (text; also the source of borders, hairlines, and muted text), **Primary**, **Accent**. Semantic colors (destructive, success, warning) are platform-fixed: they are not seeds and cannot be user-customized. A user colour scheme is exactly a choice of five seeds — every other color in the app derives from them.

**Synonyms:** seed color, scheme seed

### Primary

The Theme Token for the **action color** — buttons, links, and active states. Deep teal in the default theme.

**Distinction from Accent:** Primary marks what you can *do*; Accent marks what is *selected*.

### Accent

The Theme Token for the **highlight color** — selection backgrounds, hover tints, and emphasized areas. Light teal in the default theme.

**Distinction from Primary:** Accent marks what is *selected*; Primary marks what you can *do*.

### Derived Shade

A state variant of a Theme Token that is **computed from the token** (via `color-mix()` in OKLCH space) rather than stored as an independent value — hover, active, and subtle-tint shades. Because a Derived Shade is computed, changing a Theme Token (e.g. from Preferences) updates its entire state ladder automatically. Hardcoding a shade that could be derived is a defect.

**The canonical ladder:** per seed — **hover**, **active**, **subtle** (a low-tint wash over Background), **foreground** (contrast-resolved text on the seed). From Ink specifically — **border**, **hairline**, **muted-foreground**. Focus indication and disabled state are *rules*, not tokens (Accent ring; reduced opacity).

**Synonyms:** derived state, computed shade

### Theme

A named, user-pickable colour scheme: exactly the five Theme Seeds plus a name and description — never Derived Shades, which are always computed. The unit of choice in the Preferences Window.

**Synonyms:** colour scheme, colour theme

### Built-in Theme

A Theme that ships with the platform (Original, Cyberpunk, Forest, Terminal, Lavender, GPT, Claude, Benchling, eLabFTW). Built-in Themes are read-only — editing one in the Customize tab saves a Custom Theme instead. Original is the default for new users.

**Synonyms:** preset theme, shipped theme

### Custom Theme

A Theme authored by a user in the Customize tab and stored as part of their Preferences — per-user and per-device, never visible to other users.

**Invariant:** deleting the Active Theme falls back to Original.

**Synonyms:** user theme, saved theme

### Active Theme

The Theme currently applied to the platform. Exactly one at a time; defaults to Original.

**Synonyms:** current theme, selected theme

### Preferences Window

The Modal — opened from the user menu — where a user manages their Preferences: picking a Theme (Themes tab) or editing the five Theme Seeds and saving them as a Custom Theme (Customize tab). Despite the casual name, it is a **Modal** (centered, overlay-backed), not a Popover — popovers in this codebase are anchored and non-modal.

**Synonyms:** preferences modal, preferences dialog

### Preferences vs Settings

**Preferences** are per-user, cosmetic choices stored on the user's own device — the theme today, density and similar later. They never touch the server and are never visible to other users. **Settings** are server-backed configuration shared with the workspace (Icon Library, Color Tokens, dropdowns). If a choice is about how the platform *looks to one user*, it is a Preference; if it configures *shared data or behavior*, it is a Setting.
