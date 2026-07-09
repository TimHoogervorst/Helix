import type { ComponentType } from "react";

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

// ── Slash Command (shape only — implementation deferred) ──────────────────

/** Placeholder type for slash command context. Will be refined. */
export type SlashContext = Record<string, unknown>;

export interface SlashCommandConfig {
  id: string;
  label: string;
  icon?: ComponentType<any>;
  workspaces: string[];
  action: (context: SlashContext) => void;
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
