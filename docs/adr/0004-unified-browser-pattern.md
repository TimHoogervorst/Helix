# ADR-0004: Unified Browser Pattern for LIMS and Library

> Date: 2026-06-27
> Status: Accepted

---

## Context

The platform has two browsing surfaces — the **Library** (filesystem-like browsing of Folders and ELN Entries at `/library`) and **LIMS** (database-like browsing of Entities at `/lims`). Both implement the same progressive-disclosure UI pattern:

| State | Library | LIMS |
|-------|---------|------|
| List | Mixed folder + entry table | Entity table |
| Detail | Entry summary card | Entity summary card |
| Expanded | Embedded TipTap editor | Tabbed detail view (Activity, Insights, Storage) |

Despite sharing this pattern, the two browsers are implemented as **near-duplicate code** with no shared abstraction:

| Duplicated artifact | LIMS copy | Library copy | Difference |
|---------------------|-----------|--------------|------------|
| View state context | `LimsViewContext.tsx` | `LibraryViewContext.tsx` | Name only (28 lines each) |
| Collapsed strip | `LimsCollapsedStrip.tsx` | `LibraryCollapsedStrip.tsx` | CSS class + title string (19 lines each) |
| Detail card | `LimsDetailCard.tsx` | `LibraryDetailCard.tsx` | Different fields, same structure |
| More detail panel | `LimsMoreDetailPanel.tsx` | `LibraryMoreDetailPanel.tsx` | Tabbed placeholder vs embedded editor |
| View state machine | Inline in `LimsList.tsx` | Inline in `LibraryView.tsx` | Identical state transitions + animation timings |

The `ViewState` type (`"list" | "detail" | "expanded"`) lives in `frontend/src/types/lims.ts` and is **imported by library code** — making the Library formally dependent on the LIMS module for its core UI state type.

Adding a third browser (e.g., a Protocol browser, a Plate browser) under the current structure would create a third copy of every component. Future plugin/modding support requires a single extension point, not N copies to integrate with.

Three approaches were evaluated:

| Approach | Code sharing | Backend impact | Plugin-ready | Migration risk |
|----------|-------------|----------------|--------------|----------------|
| **A) Merge Django apps** | Full — one app serves both browsers | High — merge `lims/` + `library/` + `eln/` into one app | Yes | High — migration conflicts, FK renames |
| **B) Shared abstract base + shared frontend components** (chosen) | Frontend: full. Backend: shared base classes, separate apps | Low — apps stay independent, shared base extracted | Yes | Low — no data migration, additive only |
| **C) Frontend-only sharing** | Frontend only | None | Partial — backend stays duplicated | None |

---

## Decision

**Extract the three-panel browser pattern into shared frontend components and a shared backend abstract base, while keeping the `lims/`, `library/`, and `eln/` Django apps as separate modules.**

### 1. Canonical Terminology (CONTEXT.md)

The following terms are now canonical and replace all ad-hoc naming:

| Term | Type | Definition |
|------|------|------------|
| **Browser** | Pattern | A concrete instance of the Three-Panel Browser pattern (Library, LIMS) |
| **Master Panel** | UI | Left panel — the item table |
| **Detail Panel** | UI | Middle panel — the summary card |
| **Workspace Panel** | UI | Right panel — the full work surface (editor, detail view, plugin surface) |
| **List** | State | Full-width Master, no Detail, no Workspace |
| **Detail** | State | Master + Detail visible |
| **Expanded** | State | Collapsed Master + Detail + Workspace |
| **Item** | Domain | Any row in a Master table — Entity, Entry, Folder, or future plugin types |

These replace the current ad-hoc names: "three-step fold," "LIMS three-step fold," "collapsed strip," "more detail panel."

### 2. Frontend: Shared Component Library

Extract the following shared components from the duplicated pairs:

```
frontend/src/components/browser/
├── BrowserProvider.tsx        ← replaces LimsViewContext + LibraryViewContext
├── BrowserMasterPanel.tsx     ← shared table wrapper with selection state
├── BrowserDetailPanel.tsx     ← shared detail card shell (header, fields, actions)
├── BrowserWorkspacePanel.tsx  ← shared workspace shell (header bar, slot content)
├── BrowserCollapsedStrip.tsx  ← replaces LimsCollapsedStrip + LibraryCollapsedStrip
└── useBrowserView.ts          ← shared View State machine hook
```

Domain-specific content is injected via **slots** (React children or render props):

- `BrowserDetailPanel` accepts a `fields` array and an optional `properties` section — LIMS passes entity metadata, Library passes entry metadata
- `BrowserWorkspacePanel` accepts `children` — LIMS renders tabbed detail, Library renders ElnEditor, plugins render custom surfaces
- `BrowserMasterPanel` accepts column definitions and row renderers — each browser defines its own columns

The `ViewState` type moves from `types/lims.ts` to a new `types/browser.ts`.

### 3. Backend: Shared Abstract Base

Extract a shared abstract base class for resource-like models without merging Django apps:

```python
# backend/core/abstracts.py (or a new backend/browser/ app)
class BrowsableItem(models.Model):
    """Abstract base for any model that can appear as a row in a Browser Master table."""
    display_id = models.CharField(max_length=50, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = ForeignKey(User, null=True, on_delete=CASCADE)

    class Meta:
        abstract = True

    def generate_display_id(self, prefix: str) -> str:
        """Auto-generate a display ID from a prefix."""
        ...
```

`NotebookEntry` and `Entity` both inherit from `BrowsableItem`, gaining shared display ID generation, `created_by`/`created_at` fields, and a common interface for the reference resolution system.

The `references` app's `PREFIX_MAP` already treats both models uniformly — a shared base formalizes this.

### 4. Testing Strategy

To prevent regressions when working on one browser affecting the other:

| Layer | What to test | Shared or per-browser |
|-------|-------------|----------------------|
| **View State machine** | List→Detail→Expanded transitions, back-navigation, animation timers | Shared (one suite for the hook) |
| **Shared components** | CollapsedStrip renders, DetailPanel field rendering, WorkspacePanel slot rendering | Shared |
| **Browser-specific integration** | Each browser's Master table, Detail card fields, Workspace content | Per-browser (LIMS suite + Library suite) |
| **Item type registry** | Adding a new Item type doesn't break existing browsers | Shared (plugin contract test) |
| **Backend abstract base** | Display ID generation, prefix routing, `BrowsableItem` interface | Shared (one suite for the abstract) |
| **Backend app integration** | Each app's CRUD endpoints still work after inheriting from abstract base | Per-app (lims tests + eln tests) |

The key principle: **shared code has shared tests; browser-specific code has browser-specific tests.** A change to the shared View State machine must pass both the shared unit tests and each browser's integration tests before merging.

---

## Rationale

### Why not merge Django apps (Option A)

- **Migration risk.** Merging `lims/`, `library/`, and `eln/` into one app requires renaming database tables (`lims_entity` → `inventory_entity`), which means manual migration surgery or data loss in dev. The project has no production data, but the churn is unnecessary — the apps are already cleanly separated by concern.
- **Different query patterns.** LIMS queries are flat and filtered (`?search=&type=`). Library queries are hierarchical (`?path=`). Merging them into one `views.py` would create a large, multi-concern file. Separate apps keep views focused.
- **Different admin registrations.** Each app registers its own models with Django admin. Merging would create a monolithic `admin.py`.

### Why not frontend-only sharing (Option C)

- **The duplication is in both layers.** `NotebookEntry.display_id` and `Entity.display_id` have identical generation logic (prefix + sequence, gap-tolerant, per-prefix counters). A shared `BrowsableItem` base eliminates this duplication and ensures future Item types (Protocols, Plates) get correct display IDs by default.
- **The reference system already treats them uniformly.** `references/services.py` maps both `E` → `NotebookEntry` and `{EntityType.prefix}` → `Entity` through the same `PREFIX_MAP` dictionary. A shared base formalizes what's already true: both are "things you can reference by display ID."
- **Plugin readiness.** A plugin that adds a new Item type (e.g., `DNA_SEQUENCE`) should only need to inherit from `BrowsableItem` and register a Workspace component — not re-implement display ID generation, reference routing, and Master table integration.

### Why shared frontend components

- **The copies are structural clones.** `LimsCollapsedStrip` and `LibraryCollapsedStrip` are 19 lines each, differing only in component name, CSS class, and button title. There is no domain logic in these components — they are pure layout. Maintaining two copies means twice the bug surface for zero benefit.
- **Animation consistency.** Both browsers use the same CSS animation classes (`lims-slide-in`, `library-slide-in`) with the same 250ms timings. A shared component guarantees both browsers animate identically — a change to animation timing changes both at once.
- **Plugin surface area.** A plugin/modding API needs ONE Workspace component to target, not N. If the Workspace slot is a shared component, a plugin registers once and works in every browser that hosts that Item type.

### Why slots, not configuration objects

The Detail Panel and Workspace Panel are **slots** (rendered children), not configuration objects (arrays of field definitions). Rationale:

- **Entities have a dynamic schema.** An Entity's Detail Panel shows properties defined by its EntityType's `columns` array — the fields are not known at compile time. A slot lets the Entity detail card build its field list from the schema at render time.
- **Workspaces are interactive.** The ELN editor is a full TipTap instance with its own state machine (loading → view → edit → saving). A configuration object cannot express this. A slot can be any React tree.
- **Plugins ship their own components.** A Molecular Plugin ships a `DnaSequenceWorkspace` component. The browser doesn't need to know what a DNA editor looks like — it just renders the plugin's component in the Workspace slot.

---

## Consequences

### Current benefits

- **Single source of truth for the browser pattern.** The View State machine, panel layout CSS, and animation system live in one place. Adding a feature to one browser (e.g., keyboard navigation) benefits all browsers.
- **No Lims→Library import dependency.** The `ViewState` type moves to `types/browser.ts`. Library no longer imports from the LIMS module.
- **Display ID logic deduplicated.** `BrowsableItem.generate_display_id()` replaces the duplicate implementation in `Entity.save()` and `NotebookEntry.save()`.
- **Plugin-ready extension point.** The Workspace slot and Item type registry are the foundation for the future modding API. A plugin registers an Item type + a Workspace component; the browser handles the rest.

### Constraints

- **Master tables differ in row behavior.** Library rows have two click targets: folder rows navigate *into* the folder, entry rows open Detail. LIMS rows have one: click opens Detail. The shared `BrowserMasterPanel` must support both single-action and dual-action row types.
- **Search/filter models differ.** Library search filters by name + display ID within a folder path. LIMS search filters by display ID + name with an optional EntityType filter. The shared Master panel must accept browser-specific search controls.
- **The abstract base is additive, not a migration.** Existing `Entity` and `NotebookEntry` tables keep their columns. The abstract base is a code-level sharing mechanism, not a database-level inheritance (no multi-table inheritance). This means the abstract base cannot enforce database constraints across both tables — it only shares Python behavior.
- **Workspace content is type-dependent.** The browser provides the Workspace shell (header bar with close/collapse, animation), but the content is entirely type-specific. There is no "generic Workspace" — every Item type must register a Workspace component, even if it's a placeholder.

### Future considerations

- **Plugin Item type registration.** A registry (e.g., `itemTypeRegistry.register({ type: "dna_sequence", prefix: "DNA", masterRow: DnaRow, detailCard: DnaDetail, workspace: DnaWorkspace })`) allows plugins to add new Item types without modifying browser code.
- **Cross-browser Item appearance.** An Entity appears in the LIMS browser as a Master row and in the Library browser as a ReferenceBadge inside an Entry. The Item type system should support different renderings in different contexts.
- **Workspace header actions.** The Workspace shell provides a header bar. Future actions (save status indicator, "open in dedicated page" button, share/export) can be added to the header without modifying individual Workspace content components.
- **Shared backend browser API.** If multiple browsers need the same query patterns (paginated list, search, filter), a shared `BrowserViewSet` base class could emerge — but this is deferred until a third browser exists to validate the abstraction.

---

## Rejected Alternatives

- **Single "Unified Browser" route.** One `/browse` page that switches between LIMS and Library modes based on a URL parameter. Rejected: LIMS and Library are conceptually different enough (flat database vs hierarchical filesystem) that separate routes provide clearer URLs, breadcrumbs, and navigation. Users bookmark `/library?path=/Experiments/Q1` and `/lims?type=DNA` — these are different entry points, not modes of the same page.
- **Web Components for plugin slots.** Rejected for now: the frontend is React/TypeScript. Introducing a second component model adds build complexity without benefit — plugins can ship React components. If non-React plugins become a requirement, Web Components are the escape hatch.
- **Database-level inheritance (Django multi-table inheritance).** Rejected: Django's multi-table inheritance creates a parent table + child tables with JOINs on every query. The shared fields (display_id, created_at, created_by) are simple enough that code-level sharing via an abstract base is sufficient. Multi-table inheritance would add query complexity for no gain.
