import type { ComponentType } from "react";
import type { Node } from "@tiptap/core";
import type { WorkspaceBus } from "../workspace/WorkspaceBus";

// ── Mod Manifest ──────────────────────────────────────────────────────────

/**
 * What each mod's index.ts exports as `meta`.
 * Read by ModLoader during boot to order mods.
 */
export interface ModManifest {
  /** Globally unique mod identifier, e.g. 'lims', 'eln'. */
  id: string;
  /** Human-readable name, e.g. 'LIMS', 'Electronic Lab Notebook'. */
  displayName: string;
  /** Mod IDs that must load before this mod. */
  dependsOn: string[];
}

// ── Hub ───────────────────────────────────────────────────────────────────

export interface HubConfig {
  id: string;
  label: string;
  icon: ComponentType<any>;
  route: string;
  component: ComponentType<any>;
  order: number;
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

// ── Route ─────────────────────────────────────────────────────────────────

export interface RouteConfig {
  id: string;
  modId: string;
  path: string;
  component: ComponentType<any>;
  /** When true, the route renders outside the Layout shell (no sidebar). */
  public?: boolean;
}

// ── Sidebar Action ────────────────────────────────────────────────────────

export interface SidebarActionConfig {
  id: string;
  workspaceId: string;
  component: ComponentType<any>;
  position: "inline" | "hover";
}

// ── Block ──────────────────────────────────────────────────────────────────

/**
 * Discriminator value for blocks whose payload is a TipTap Node extension.
 * Consumers filter on this value to discover editor content blocks.
 */
export const BLOCK_TYPE_TIPTAP_NODE = "tiptap-node";

/**
 * Type guard: narrows a BlockConfig | BlockRegistration to the legacy
 * BlockConfig shape (type-discriminated, with `type` + `payload`).
 *
 * Use when filtering the blocks store for legacy consumers that only
 * understand the old shape. New consumers should work with BlockRegistration
 * directly or use the slot system.
 */
export function isLegacyBlockConfig(
  config: BlockConfig | BlockRegistration,
): config is BlockConfig {
  return "type" in config;
}

/**
 * Configuration for a content block registered by a mod.
 *
 * Blocks are type-discriminated: the `type` field selects the payload shape.
 * The ELN editor's slash menu is the first consumer — it reads blocks with
 * `type: "tiptap-node"` and auto-derives insert actions from the payload.
 *
 * Future non-TipTap consumers (e.g., a MolBio viewer workspace) can register
 * and consume their own block types through the same registry.
 */
export interface BlockConfig {
  /** Globally unique identifier, e.g. "eln.table". */
  id: string;
  /** Human-readable label shown in the slash menu, e.g. "Table". */
  label: string;
  /** Short description, e.g. "Insert a schema-backed LIMS table". */
  description: string;
  /** Emoji or icon identifier shown in the slash menu, e.g. "📊". */
  icon: string;
  /** Discriminator that selects the payload shape, e.g. "tiptap-node". */
  type: string;
  /** Type-specific data. Shape depends on `type`. */
  payload: unknown;
}

/**
 * Payload shape for blocks with `type: "tiptap-node"`.
 *
 * The slash command consumer auto-derives the insert action from
 * `node.name` and `defaultAttrs`.
 */
export interface TipTapBlockPayload {
  /** TipTap Node extension (e.g., LimsTable). */
  node: Node;
  /** Optional default attributes for the insert action. */
  defaultAttrs?: Record<string, unknown>;
}

// ── Library Item ──────────────────────────────────────────────────────────

/** Flexible metadata field for a library item card. */
export interface PropertyField {
  /** Value accessor on the data item, e.g. "samples_count". */
  key: string;
  /** Optional display label. */
  label?: string;
}

/** Props contract between BaseCard and mod-provided card components. */
export interface LibraryCardProps {
  /** The data item to render. */
  item: Record<string, unknown>;
  /** Which view mode is currently active. */
  viewMode: "list" | "grid" | "compact";
  /** Whether this card is currently selected. */
  isSelected: boolean;
}

/** Configuration for a library item type registered by a mod. */
export interface LibraryItemConfig {
  /** Globally unique identifier, e.g. "eln.entry". */
  id: string;
  /** Icon component for the card. */
  icon: ComponentType<any>;
  /** The full list-row card component provided by the mod. */
  listCard: ComponentType<LibraryCardProps>;
  /** Flexible metadata fields rendered inline as · value1 · value2 · value3. */
  property_fields?: PropertyField[];
}

// ── Service (shape only — implementation deferred) ────────────────────────

export interface ServiceConfig {
  id: string;
  handler: (...args: unknown[]) => Promise<unknown>;
}

// ── Workspace ──────────────────────────────────────────────────────────────

/**
 * Configuration for a workspace registered by a mod.
 *
 * The workspace `id` doubles as the URL namespace: `/{workspaceId}/{displayId}`.
 * Must be a valid URL path segment (lowercase alphanumeric by convention).
 */
export interface WorkspaceConfig {
  /** Unique workspace identifier, also used as the URL namespace. */
  id: string;
  /** Human-readable name, e.g. 'LIMS', 'Electronic Lab Notebook'. */
  displayName: string;
  /** Optional icon component. Falls back to a generic default when absent. */
  icon?: ComponentType<any>;
}

// ── Entity Type (client-side type for lims.registerEntityType service) ─────

/**
 * A mentionable entity type registered with LIMS.
 *
 * Mods call `registry.call("lims.registerEntityType", config)` at boot to
 * declare which entity types they own. LIMS validates prefix uniqueness.
 *
 * This is the client-side contract — the backend mirrors it with a
 * `RegisteredEntityType` model in `lims/models.py`.
 */
export interface RegisteredEntityType {
  /** Prefix extracted from display IDs, e.g. "E" → "E1", "DNA" → "DNA34". */
  prefix: string;
  /** The entity type identifier, e.g. "eln_entry", "sample". */
  entityType: string;
  /** The workspace that owns this entity type. */
  workspaceId: string;
  /** Human-readable name shown in search results, e.g. "Entry", "Sample". */
  displayName: string;
}

// ── Current Workspace ───────────────────────────────────────────────────────

/**
 * Resolved metadata for the currently active workspace, derived from the URL.
 *
 * Defined in core/ so both pins and mentions modules can share it without
 * creating an inverted dependency (core importing from a mods package).
 */
export interface CurrentWorkspace {
  displayId: string;
  url: string;
  /** Workspace ID — used to look up the workspace config for an icon. */
  icon: string;
}

// ── Slot System — Forward-Declaring Interfaces ────────────────────────────────

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
 * No `bus` — blocks respond to events via `onEvent` handlers, they never
 * initiate bus calls. Buttons (which fire events) receive `bus` in their
 * `onClick`; blocks (which respond) use `onEvent`.
 */
export interface BlockComponentProps {
  context: SlotContext;
  instance: BlockInstance;
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
  /** Optional activity feed message overrides for lifecycle events. */
  messages?: {
    created?: string;
    edited?: string;
    deleted?: string;
  };
  /** Extract a display name from block attributes for human-readable action log messages. */
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  /** Tags for block picker / slash menu filtering. */
  tags?: string[];
  /** Serialize block state to a JSON string for persistence. */
  serialize: (state: Record<string, unknown>) => string;
  /** Deserialize a JSON string back to block state. */
  deserialize: (json: string) => Record<string, unknown>;
  /** Default state used when no stored content exists. */
  defaultState: Record<string, unknown>;
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
