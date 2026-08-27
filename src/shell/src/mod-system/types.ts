import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { WorkspaceBus } from "../workspace/WorkspaceBus";
import type { BlockEvent } from "./BlockEvent";

// ── Mod Manifest ──────────────────────────────────────────────────────────

/**
 * What each mod's index.ts exports as ``meta``.
 * Read by ModLoader during boot to order mods.
 *
 * The compound key ``vendor + "." + name`` (e.g. ``"helix.eln"``) is the
 * uniqueness anchor used across the entire mod system.  ``name`` alone is
 * the mod's local identifier within its vendor namespace.
 */
export interface ModManifest {
  /**
   * Vendor namespace.  Core platform mods use ``"helix"``.
   * Combined with ``name`` to form the globally-unique ``vendor.name`` key.
   */
  vendor: string;
  /**
   * Local mod name within the vendor namespace, e.g. ``"eln"``, ``"lims"``.
   * The compound key ``vendor.name`` (e.g. ``"helix.eln"``) is used as the
   * unique mod identity everywhere in the system.
   */
  name: string;
  /** Human-readable name, e.g. 'LIMS', 'Electronic Lab Notebook'. */
  displayName: string;
  /** Semver version string. Optional — core mods inherit the platform version when omitted. */
  version?: string;
  /**
   * Fully-qualified ``vendor.name`` strings identifying mods that must load
   * before this mod.  Each entry can be either a bare ``"vendor.name"``
   * string or an object with an ``id`` (also ``vendor.name``) and optional
   * ``version`` constraint.
   *
   * Example: ``["helix.lims", { id: "helix.tags", version: ">=2.0" }]``
   */
  dependsOn: (string | { id: string; version?: string })[];
  /** Minimum platform version required by this mod. */
  coreVersion?: string;
  /** Legacy Lucide icon name. Temporary; kept for compatibility. */
  icon?: string;
  /** Short description for settings and mod listing screens. */
  description?: string;
}

// ── Typed Handles ──────────────────────────────────────────────────────────

/**
 * Opaque handle returned by {@link Mod.registerBlock}.
 *
 * Carries the derived global ID, the owning mod's fully-qualified identity,
 * and typed emitters for every entry in the block's ``emits`` array.
 * The emitter shape is defined but not wired to the bus yet.
 */
export interface BlockHandle {
  /** Brand to distinguish from other handle types at compile time. */
  readonly __brand: "BlockHandle";
  /** Derived global ID, e.g. ``"eln.table"``. */
  readonly globalId: string;
  /** Fully-qualified mod identity, e.g. ``"helix.eln"``. */
  readonly modId: string;
  /**
   * Typed emitters keyed by emit local ID.
   * Each value exposes a ``fire(payload)`` method.
   */
  readonly emits: Record<string, { fire: (payload: unknown) => void }>;
}

/**
 * Opaque handle returned by {@link Mod.declareSlot}.
 *
 * Carries the derived global slot ID and the slot's ``accepts`` type so
 * {@link Mod.registerIntoSlot} can compile-check that the bound target
 * matches the slot's expectation.
 */
export interface SlotHandle {
  /** Brand to distinguish from other handle types at compile time. */
  readonly __brand: "SlotHandle";
  /** Derived global slot ID, e.g. ``"eln.editor"``. */
  readonly globalId: string;
  /** Fully-qualified mod identity, e.g. ``"helix.eln"``. */
  readonly modId: string;
  /** What can be bound into this slot. */
  readonly accepts: "block" | "button";
}

/**
 * Opaque handle returned by {@link Mod.registerButton}.
 *
 * Carries the derived global button ID for use with
 * {@link Mod.registerIntoSlot}.
 */
export interface ButtonHandle {
  /** Brand to distinguish from other handle types at compile time. */
  readonly __brand: "ButtonHandle";
  /** Derived global ID, e.g. ``"eln.export"``. */
  readonly globalId: string;
  /** Fully-qualified mod identity, e.g. ``"helix.eln"``. */
  readonly modId: string;
}

// ── Hub ───────────────────────────────────────────────────────────────────

export interface HubConfig {
  id: string;
  label: string;
  icon: ComponentType<any>;
  route: string;
  component: ComponentType<any>;
  order: number;
  /** Short description shown in hub listings and navigation. */
  description?: string;
}

// ── Settings Section ──────────────────────────────────────────────────────

export interface SettingsSectionConfig {
  id: string;
  modId: string;
  label: string;
  icon?: ComponentType<any>;
  component: ComponentType<any>;
  order: number;
}

// ── Schema Component ───────────────────────────────────────────────────────

export interface SchemaComponentProps {
  entity: Record<string, unknown>;
}

export interface SchemaComponentRegistration {
  /** Globally unique identifier, e.g. "lims.results". */
  id: string;
  /** Human-readable label shown in schema settings and workspace tabs. */
  label: string;
  /** Icon displayed beside the component label. */
  icon: ComponentType<any>;
  /** Renderer for the component tab. */
  component: ComponentType<SchemaComponentProps>;
  /** Lower values are shown first after the Overview tab. */
  order: number;
}

// ── Route ─────────────────────────────────────────────────────────────────

export interface RouteConfig {
  id: string;
  modId: string;
  path: string;
  component: ComponentType<any>;
  /** When true, the route renders outside the Layout shell (no sidebar). */
  public?: boolean;
}

// ── Block ──────────────────────────────────────────────────────────────────

// ── Service (shape only — implementation deferred) ────────────────────────

export interface ServiceConfig {
  id: string;
  handler: (...args: unknown[]) => Promise<unknown>;
}

// ── Workspace ──────────────────────────────────────────────────────────────

/** A column definition within a schema type. */
export interface SchemaColumnDef {
  id?: string;
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
  /** ID of the target Schema when type is "reference". */
  referenceSchemaId?: number;
}

/**
 * Schema type identity carried by a workspace.
 *
 * Workspace + schemaType metadata is hydrated from the backend via
 * ``GET /api/mod-registry/`` — no separate service call is required.
 */
export interface SchemaTypeConfig {
  /** Unique schema type identifier, e.g. "lims.entity", "eln.entry". */
  id: string;
  /** Human-readable name, e.g. "Entity", "ELN Entry". */
  displayName: string;
  /** Default prefix for display IDs, e.g. "E" → "E1". */
  defaultPrefix: string;
  /** Optional column definitions. */
  columns?: SchemaColumnDef[];
  /** Icon-library key for the schema's default icon. */
  icon?: string;
}

/**
 * Workspace metadata hydrated from the backend via ``GET /api/mod-registry/``.
 *
 * The workspace `id` doubles as the URL namespace: `/{workspaceId}/{displayId}`.
 * Must be a valid URL path segment (lowercase alphanumeric by convention).
 */
export interface WorkspaceConfig {
  /** Unique workspace identifier, also used as the URL namespace. */
  id: string;
  /** Human-readable name, e.g. 'LIMS', 'Electronic Lab Notebook'. */
  displayName: string;
  /** Optional Lucide icon. Falls back to a generic default when absent. */
  icon?: LucideIcon;
  /**
   * Optional schema type identity.
   *
   * When provided, workspace registration carries everything needed for
   * entity type identity — no separate service call is required.
   */
  schemaType?: SchemaTypeConfig;
}

// ── Current Workspace ───────────────────────────────────────────────────────

/**
 * Resolved metadata for the currently active workspace, derived from the URL.
 *
 * Defined in core/ so both tabs and mentions modules can share it without
 * creating an inverted dependency (core importing from a mods package).
 */
export interface CurrentWorkspace {
  displayId: string;
  url: string;
  /** Workspace ID — used to look up the workspace config for an icon. */
  icon: string;
}

// ── Slot System — Forward-Declaring Interfaces ────────────────────────────────

/** Single action catalog entry hydrated from the backend. */
export interface ActionCatalogEntry {
  id: string;
  label: string;
  action_type: string;
}

/**
 * Flat bag of metadata available to every block and button in a workspace slot.
 */
export interface SlotContext {
  workspaceId: string;
  user: unknown;
  viewMode: unknown;
  entryId?: string;
  entityId?: string;
  displayId?: string;
  /** Arbitrary entry-specific data passed from workspace to sidebar blocks. */
  entry?: unknown;
  /** Action catalog for this workspace, hydrated from ``GET /api/mod-registry/``. */
  actions?: ActionCatalogEntry[];
  /**
   * Emit a custom domain action declared in the block registration
   * `emits` field.
   *
   * Set by the renderer (BlockNodeView / useBlockInstance) per-block.
   * The renderer derives the global action ID as
   * ``{blockGlobalId}.{localId}`` and emits the event on the workspace
   * bus where the accumulation layer picks it up alongside lifecycle
   * events.
   *
   * Blocks call this instead of the legacy ``sendAction`` on props.
   */
  emitAction?: (localId: string, payload?: Record<string, unknown>) => void;
}

/**
 * Handle to a specific occurrence of a block in a slot.
 *
 * Created by the renderer. `attrs` is the deserialized block state — the
 * block component works with native objects, not JSON strings.
 */
export interface BlockInstance {
  id: string;
  blockId: string;
  slotId: string;
  attrs: Record<string, unknown>;
  updateAttrs: (attrs: Record<string, unknown>) => void;
}

/**
 * Props contract every block component receives from its renderer.
 *
 * Blocks never touch the bus or the HTTP layer directly. Listening is done
 * declaratively via ``listensTo``/``onEvent``, and emitting custom actions
 * via ``context.emitAction`` — both managed by the renderer.
 *
 * ``sendAction`` is exclusively called by ``useActionAccumulator`` inside
 * ``TipTapRenderer`` — blocks do not call it.
 */
export interface BlockComponentProps {
  context: SlotContext;
  instance: BlockInstance;
  /** Binding-level overrides merged from slot defaults and per-binding config. */
  overrides: Record<string, unknown>;
  /**
   * Typed emitters for every entry in the block's ``emits`` array.
   *
   * Set by the renderer (BlockNodeView / PanelRenderer / TabRenderer) at
   * render time.  Each emitter's ``fire(payload)`` method constructs a
   * ``BlockEvent``-shaped payload and dispatches it on the workspace bus.
   *
   * Example: ``props.emits.entitiesRegistered.fire({ count: 5 })``
   */
  emits?: Record<string, { fire: (payload: Record<string, unknown>) => void }>;
}

// ── Slot System — Registration Types ─────────────────────────────────────────

/**
 * Registration for a reusable block type.
 *
 * Renderer-agnostic — the same block can be bound into a TipTap editor slot,
 * a sidebar panel slot, or a tab slot without the block author writing any
 * rendering-mode-specific code. The slot's renderer owns presentation.
 *
 * Registered once via `registerBlock()`, bindable into many slots via
 * `registerIntoSlot()`.
 */
export interface BlockRegistration {
  /** Globally unique identifier, e.g. "eln.table". */
  id: string;
  /** Human-readable label, e.g. "Table". */
  label: string;
  /** Lucide icon component. */
  icon: ComponentType<any>;
  /** React component that renders the block. Receives BlockComponentProps. */
  component: ComponentType<BlockComponentProps>;
  /** Events this block reacts to (default: []). */
  listensTo: string[];
  /** Map of event name → handler. Called by the renderer when a listened-to event fires. */
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  /** Extract a display name from block attributes for human-readable action log messages. */
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  /** Custom domain actions this block can emit via `context.emitAction()`. */
  emits?: BlockEvent[];
  tags?: string[];
  /** Layout role used by renderers for blocks that intentionally span the editor. */
  layout?: "default" | "dynamic-bleed";
  /** Serialize block state to a JSON string for persistence. */
  serialize: (state: Record<string, unknown>) => string;
  /** Deserialize a JSON string back to block state. */
  deserialize: (json: string) => Record<string, unknown>;
  /** Default state used when no stored content exists. */
  defaultState: Record<string, unknown>;
  /** State fields to carry over when duplicating this block. */
  preserve?: string[];
}

/**
 * Registration for a simple fire-only button rendered in toolbar slots.
 *
 * Buttons emit events via `bus.collect()` / `bus.emit()` / `bus.request()`
 * but never listen. If a UI element needs to both listen and fire, use a block.
 */
export interface ButtonRegistration {
  /** Globally unique identifier, e.g. "eln.export". */
  id: string;
  /** Human-readable label, e.g. "Export". */
  label: string;
  /** Optional Lucide icon component. */
  icon?: ComponentType<any>;
  /** Click handler. Receives the workspace bus and slot context. */
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}

/**
 * A named placeholder in a workspace that owns how things are rendered.
 *
 * The slot's `renderer` field IS the type — no fixed enum of slot types.
 * `accepts: "block" | "button"` is the only type distinction.
 */
export interface SlotDeclaration {
  /** Unique slot identifier, e.g. "eln.editor" ({workspaceId}.{region}.{name}). */
  id: string;
  /** What can be bound into this slot. */
  accepts: "block" | "button";
  /** The rendering strategy component. Determines how bound content is presented. */
  renderer: ComponentType<any>;
  /** How contents are arranged within the slot. */
  layout: "horizontal" | "vertical";
  /** Slot position within the workspace. */
  order: number;
  /** Default overrides that apply to all bindings in this slot. */
  defaults: Record<string, unknown>;
}

/**
 * Connects a block or button to a slot, with optional per-binding overrides.
 *
 * Created by `registerIntoSlot()`. Overrides are merged with slot defaults;
 * binding overrides win on a per-key basis.
 */
export interface SlotBinding {
  /** The slot this binding targets, e.g. "eln.editor". */
  slotId: string;
  /** The block or button ID to bind, e.g. "eln.table". */
  targetId: string;
  /** Per-binding overrides merged with slot defaults. */
  overrides: Record<string, unknown>;
  /** Position within the slot. Lower = earlier (leftmost/topmost). */
  order: number;
}

// ── Slot System — Renderer Types ──────────────────────────────────────────────

/**
 * Minimal base shape shared by all resolved bindings passed to renderers.
 *
 * Extended by {@link BlockBinding} and {@link ButtonBinding}. The renderer
 * receives an array of these via {@link RendererProps.bindings}.
 */
export interface BaseBinding {
  /** Position within the slot. Lower = earlier (leftmost/topmost). */
  order: number;
}

/**
 * Resolved block binding — what TipTapRenderer, PanelRenderer, and TabRenderer receive.
 *
 * Built by merging a {@link SlotBinding} with its slot's {@link SlotDeclaration.defaults}
 * and the resolved {@link BlockRegistration}. Binding overrides win per-key.
 */
export interface BlockBinding extends BaseBinding {
  type: "block";
  /** The block's registration ID, e.g. "eln.table". */
  id: string;
  /** Human-readable label from the block registration. */
  label: string;
  /** Icon component from the block registration. */
  icon: ComponentType<any>;
  /** React component that renders the block. */
  component: ComponentType<BlockComponentProps>;
  /** Events this block reacts to. */
  listensTo: string[];
  /** Map of event name → handler. */
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  /** Extract a display name from block attributes. */
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  /** Tags for block picker filtering. */
  tags?: string[];
  /** Layout role copied from the block registration. */
  layout?: "default" | "dynamic-bleed";
  /** Custom domain actions this block can emit via `context.emitAction()`. */
  emits?: BlockEvent[];
  /** Merged overrides: slot defaults ← binding overrides (binding wins per-key). */
  overrides: Record<string, unknown>;
  /** Serialize block state to a JSON string for persistence. */
  serialize: (state: Record<string, unknown>) => string;
  /** Deserialize a JSON string back to block state. */
  deserialize: (json: string) => Record<string, unknown>;
  /** Default state used when no stored content exists. */
  defaultState: Record<string, unknown>;
  /** State fields to carry over when duplicating this block. */
  preserve?: string[];
}

/**
 * Resolved button binding — what ButtonGroupRenderer receives.
 *
 * Built by merging a {@link SlotBinding} with its resolved {@link ButtonRegistration}.
 */
export interface ButtonBinding extends BaseBinding {
  type: "button";
  /** The button's registration ID, e.g. "eln.export". */
  id: string;
  /** Human-readable label from the button registration. */
  label: string;
  /** Optional icon component from the button registration. */
  icon?: ComponentType<any>;
  /** Click handler that receives the workspace bus and slot context. */
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}

/**
 * Props contract every renderer receives from SlotRenderer.
 *
 * SlotRenderer resolves the slot + bindings, merges defaults with overrides,
 * builds {@link BlockBinding} or {@link ButtonBinding} arrays, and passes them
 * to the renderer component via this interface.
 */
export interface RendererProps<T extends BaseBinding = BaseBinding> {
  /** The slot ID being rendered, e.g. "eln.editor". */
  slotId: string;
  /** Resolved bindings — blocks or buttons, depending on the slot's `accepts`. */
  bindings: T[];
  /** The optional workspace-scoped event bus. */
  bus?: WorkspaceBus;
  /** Flat bag of metadata available to all blocks and buttons. */
  context: SlotContext;
}

// ── Icon Library & Color Palette ─────────────────────────────────────────

export interface IconLibraryEntry {
  key: string;
  label: string;
  kind: "lucide" | "custom";
  token: string;
  svg: string;
}

export interface ColorToken {
  key: string;
  label: string;
  hex: string;
  hexDark: string;
  hexLight: string;
}
