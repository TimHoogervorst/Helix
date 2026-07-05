import type {
  ConsoleConfig,
  WorkspaceConfig,
  SettingsSectionConfig,
  RouteConfig,
  SidebarActionConfig,
  SlashCommandConfig,
  ServiceConfig,
} from "./types";

/**
 * Central registry for all mod registrations.
 *
 * Populated during boot by mods calling register*() functions.
 * Read by Core to build routes, sidebar nav, console behavior, and settings.
 *
 * This is a singleton — there is exactly one registry per application.
 * The singleton pattern is chosen over React Context because the registry
 * must be available outside the component tree (e.g. route matching, mod
 * loading) and must not trigger re-renders.
 */
export class ModRegistry {
  // ── Singleton ─────────────────────────────────────────────────────────

  private static instance: ModRegistry | null = null;

  static getInstance(): ModRegistry {
    if (!ModRegistry.instance) {
      ModRegistry.instance = new ModRegistry();
    }
    return ModRegistry.instance;
  }

  /** Reset the singleton. For use in tests only. */
  static _reset(): void {
    ModRegistry.instance = null;
  }

  // ── Internal stores ───────────────────────────────────────────────────

  private consoles = new Map<string, ConsoleConfig>();
  private workspaces = new Map<string, WorkspaceConfig>();
  private settingsSections = new Map<string, SettingsSectionConfig>();
  private routes = new Map<string, RouteConfig>();
  private sidebarActions = new Map<string, SidebarActionConfig>();
  private slashCommands = new Map<string, SlashCommandConfig>();
  private services = new Map<string, ServiceConfig>();

  /** Set of registered mod IDs for cross-reference validation. */
  private modIds = new Set<string>();

  // ── Registration methods ──────────────────────────────────────────────

  /** Register a mod's identity. Called by ModLoader before the mod's register function. */
  registerMod(id: string): void {
    if (this.modIds.has(id)) {
      throw new Error(`Duplicate mod ID: ${id}`);
    }
    this.modIds.add(id);
  }

  registerConsole(config: ConsoleConfig): void {
    if (this.consoles.has(config.id)) {
      throw new Error(
        `Duplicate console registration: '${config.id}' is already registered.`,
      );
    }
    this.consoles.set(config.id, config);
  }

  registerWorkspace(config: WorkspaceConfig): void {
    if (this.workspaces.has(config.id)) {
      throw new Error(
        `Duplicate workspace registration: '${config.id}' is already registered.`,
      );
    }
    if (config.consoleIds.length === 0) {
      throw new Error(
        `Workspace '${config.id}' must declare at least one consoleId.`,
      );
    }
    this.workspaces.set(config.id, config);
  }

  registerSettingsSection(config: SettingsSectionConfig): void {
    if (this.settingsSections.has(config.id)) {
      throw new Error(
        `Duplicate settings section registration: '${config.id}' is already registered.`,
      );
    }
    this.settingsSections.set(config.id, config);
  }

  registerRoute(config: RouteConfig): void {
    if (this.routes.has(config.id)) {
      throw new Error(
        `Duplicate route registration: '${config.id}' is already registered.`,
      );
    }
    this.routes.set(config.id, config);
  }

  registerSidebarAction(config: SidebarActionConfig): void {
    if (this.sidebarActions.has(config.id)) {
      throw new Error(
        `Duplicate sidebar action registration: '${config.id}' is already registered.`,
      );
    }
    this.sidebarActions.set(config.id, config);
  }

  registerSlashCommand(config: SlashCommandConfig): void {
    // Shape only — implementation deferred.
    // Logs a warning so developers know this isn't wired yet.
    if (this.slashCommands.has(config.id)) {
      throw new Error(
        `Duplicate slash command registration: '${config.id}' is already registered.`,
      );
    }
    this.slashCommands.set(config.id, config);
    console.warn(
      `[ModRegistry] registerSlashCommand('${config.id}') — slash commands are not yet implemented.`,
    );
  }

  registerService(config: ServiceConfig): void {
    if (this.services.has(config.id)) {
      throw new Error(
        `Duplicate service registration: '${config.id}' is already registered.`,
      );
    }
    this.services.set(config.id, config);
  }

  // ── Resolution methods ────────────────────────────────────────────────

  /**
   * Resolve the renderers (row, detailCard, workspace) for a workspace in a
   * specific console. Uses layered defaults: workspace override → console
   * default → undefined.
   */
  resolveWorkspaceRenderers(
    workspaceId: string,
    consoleId: string,
  ): {
    row?: WorkspaceConfig["row"];
    detailCard?: WorkspaceConfig["detailCard"];
    workspace?: WorkspaceConfig["workspace"];
  } {
    const ws = this.workspaces.get(workspaceId);
    const con = this.consoles.get(consoleId);

    return {
      row: ws?.row ?? con?.defaults?.row,
      detailCard: ws?.detailCard ?? con?.defaults?.detailCard,
      workspace: ws?.workspace ?? con?.defaults?.workspace,
    };
  }

  /**
   * Find the workspace whose route matches the given pathname.
   * Handles path parameters like `:displayId` by converting the route
   * pattern to a regex.
   */
  getWorkspaceForRoute(pathname: string): WorkspaceConfig | undefined {
    for (const ws of this.workspaces.values()) {
      const pattern = ws.route.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(pathname)) {
        return ws;
      }
    }
    return undefined;
  }

  // ── Service invocation ────────────────────────────────────────────────

  /**
   * Invoke a registered service by ID.
   *
   * Looks up the handler registered for `serviceId` and calls it with the
   * provided arguments. Returns the handler's result.
   *
   * Throws if no service is registered under `serviceId`.
   * Errors thrown by the handler propagate to the caller.
   */
  async call(serviceId: string, ...args: unknown[]): Promise<unknown> {
    const config = this.services.get(serviceId);
    if (!config) {
      throw new Error(
        `Service '${serviceId}' is not registered. ` +
          `Ensure the owning mod calls registerService() before other mods try to call it.`,
      );
    }
    return config.handler(...args);
  }

  // ── Validation ────────────────────────────────────────────────────────

  /**
   * Validate cross-references across all registrations.
   * Throws on the first error found.
   */
  validate(): void {
    // Validate workspace consoleIds resolve to registered consoles
    for (const ws of this.workspaces.values()) {
      for (const consoleId of ws.consoleIds) {
        if (!this.consoles.has(consoleId)) {
          throw new Error(
            `Workspace '${ws.id}' references console '${consoleId}' which is not registered.`,
          );
        }
      }
    }

    // Validate route modIds resolve to registered mods
    for (const route of this.routes.values()) {
      if (!this.modIds.has(route.modId)) {
        throw new Error(
          `Route '${route.id}' references mod '${route.modId}' which is not registered.`,
        );
      }
    }

    // Validate settings section modIds resolve to registered mods
    for (const section of this.settingsSections.values()) {
      if (!this.modIds.has(section.modId)) {
        throw new Error(
          `Settings section '${section.id}' references mod '${section.modId}' which is not registered.`,
        );
      }
    }

    // Validate sidebar action workspaceIds resolve to registered workspaces
    for (const action of this.sidebarActions.values()) {
      if (action.workspaceId === "*") continue; // wildcard: always valid
      if (!this.workspaces.has(action.workspaceId)) {
        throw new Error(
          `Sidebar action '${action.id}' references workspace '${action.workspaceId}' which is not registered.`,
        );
      }
    }
  }

  // ── Read-only accessors ───────────────────────────────────────────────

  /** Returns a read-only view of all registered consoles. */
  getConsoles(): ReadonlyMap<string, ConsoleConfig> {
    return this.consoles;
  }

  /** Returns a read-only view of all registered workspaces. */
  getWorkspaces(): ReadonlyMap<string, WorkspaceConfig> {
    return this.workspaces;
  }

  /** Returns a read-only view of all registered settings sections, sorted by order. */
  getSettingsSections(): SettingsSectionConfig[] {
    return [...this.settingsSections.values()].sort(
      (a, b) => a.order - b.order,
    );
  }

  /** Returns a read-only view of all registered routes. */
  getRoutes(): ReadonlyMap<string, RouteConfig> {
    return this.routes;
  }

  /** Returns a read-only view of all registered sidebar actions. */
  getSidebarActions(): ReadonlyMap<string, SidebarActionConfig> {
    return this.sidebarActions;
  }
}
