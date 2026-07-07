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

// ── Console ───────────────────────────────────────────────────────────────

export interface ConsoleConfig {
  id: string;
  label: string;
  icon: ComponentType<any>;
  route: string;
  component: ComponentType<any>;
  order: number;
  defaults: {
    row?: ComponentType<any>;
    detailCard?: ComponentType<any>;
    workspace?: ComponentType<any>;
  };
  /** Narrows which workspace item types appear in this console. */
  accepts?: {
    only?: string[];
    except?: string[];
  };
}

// ── Workspace ─────────────────────────────────────────────────────────────

export interface WorkspaceConfig {
  /** Globally unique — includes mod prefix, e.g. 'lims.entity', 'eln.entry'. */
  id: string;
  /** Which consoles host this workspace. */
  consoleIds: string[];
  label: string;
  icon?: ComponentType<any>;
  /** Standalone page route — auto-registers as a route. */
  route: string;
  /** Custom row renderer (falls back to console default). */
  row?: ComponentType<any>;
  /** Custom detail card (falls back to console default). */
  detailCard?: ComponentType<any>;
  /** Custom workspace (falls back to console default). */
  workspace?: ComponentType<any>;
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
