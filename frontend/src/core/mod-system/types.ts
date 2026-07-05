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

// ── Service (shape only — implementation deferred) ────────────────────────

export interface ServiceConfig {
  id: string;
  handler: (...args: unknown[]) => Promise<unknown>;
}
