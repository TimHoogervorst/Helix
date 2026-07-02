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
  icon: ComponentType;
  route: string;
  component: ComponentType;
  order: number;
  defaults: {
    row?: ComponentType;
    detailCard?: ComponentType;
    workspace?: ComponentType;
  };
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
  icon?: ComponentType;
  /** Standalone page route — auto-registers as a route. */
  route: string;
  /** Custom row renderer (falls back to console default). */
  row?: ComponentType;
  /** Custom detail card (falls back to console default). */
  detailCard?: ComponentType;
  /** Custom workspace (falls back to console default). */
  workspace?: ComponentType;
}

// ── Settings Section ──────────────────────────────────────────────────────

export interface SettingsSectionConfig {
  id: string;
  modId: string;
  label: string;
  icon?: ComponentType;
  component: ComponentType;
  order: number;
}

// ── Route ─────────────────────────────────────────────────────────────────

export interface RouteConfig {
  id: string;
  modId: string;
  path: string;
  component: ComponentType;
}

// ── Sidebar Action ────────────────────────────────────────────────────────

export interface SidebarActionConfig {
  id: string;
  workspaceId: string;
  component: ComponentType;
  position: "inline" | "hover";
}

// ── Slash Command (shape only — implementation deferred) ──────────────────

/** Placeholder type for slash command context. Will be refined. */
export type SlashContext = Record<string, unknown>;

export interface SlashCommandConfig {
  id: string;
  label: string;
  icon?: ComponentType;
  workspaces: string[];
  action: (context: SlashContext) => void;
}

// ── Service (shape only — implementation deferred) ────────────────────────

export interface ServiceConfig {
  id: string;
  handler: (...args: unknown[]) => Promise<unknown>;
}
