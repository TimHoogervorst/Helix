import type {
  HubConfig,
  SettingsSectionConfig,
  RouteConfig,
  SidebarActionConfig,
  ServiceConfig,
  LibraryItemConfig,
  WorkspaceConfig,
  BlockRegistration,
  ButtonRegistration,
  SlotDeclaration,
  SlotBinding,
  BlockBinding,
  ButtonBinding,
  SchemaColumnDef,
  ModManifest,
} from "./types";

/** Schema type entry from the backend mod-registry payload. */
interface BackendSchemaType {
  id: string;
  displayName: string;
  prefix: string;
  columns?: Record<string, unknown>[];
}

/** Single workspace entry in the backend mod-registry response. */
interface BackendModRegistryEntry {
  workspaceId: string;
  schemaTypes: BackendSchemaType[];
  actions: Array<{ id: string; label: string; core: boolean }>;
}

/**
 * Central registry for all mod registrations.
 *
 * Populated during boot by mods calling register*() functions.
 * Read by Core to build routes, sidebar nav, hub behavior, and settings.
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

  private hubs = new Map<string, HubConfig>();
  private settingsSections = new Map<string, SettingsSectionConfig>();
  private routes = new Map<string, RouteConfig>();
  private sidebarActions = new Map<string, SidebarActionConfig>();
  private services = new Map<string, ServiceConfig>();
  private libraryItems = new Map<string, LibraryItemConfig>();
  private workspaces = new Map<string, WorkspaceConfig>();
  private blocks = new Map<string, BlockRegistration>();
  private slots = new Map<string, SlotDeclaration>();
  private buttons = new Map<string, ButtonRegistration>();
  /** Bindings keyed by slotId. Each slot can have multiple bindings. */
  private bindings = new Map<string, SlotBinding[]>();

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

  registerHub(config: HubConfig): void {
    if (this.hubs.has(config.id)) {
      throw new Error(
        `Duplicate hub registration: '${config.id}' is already registered.`,
      );
    }
    this.hubs.set(config.id, config);
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

  registerService(config: ServiceConfig): void {
    if (this.services.has(config.id)) {
      throw new Error(
        `Duplicate service registration: '${config.id}' is already registered.`,
      );
    }
    this.services.set(config.id, config);
  }

  registerLibraryItem(config: LibraryItemConfig): void {
    if (this.libraryItems.has(config.id)) {
      throw new Error(
        `Duplicate library item registration: '${config.id}' is already registered.`,
      );
    }
    this.libraryItems.set(config.id, config);
  }

  registerWorkspace(config: WorkspaceConfig): void {
    if (this.workspaces.has(config.id)) {
      throw new Error(
        `Duplicate workspace registration: '${config.id}' is already registered.`,
      );
    }
    this.workspaces.set(config.id, config);
  }

  /**
   * Hydrate workspace data from the backend mod-registry API response.
   *
   * Called by ModLoader after manifest globbing and mod registration.
   * Populates the workspaces map so that ``getWorkspaces()`` returns
   * backend-sourced data — consumers like ``resolveCurrentWorkspace()`` and
   * ``PinnedWorkspacesSidebar`` work unchanged because the data shape is the same.
   *
   * @param payload - The parsed JSON body from ``GET /api/mod-registry/``,
   *   keyed by workspace ID.
   * @param manifests - Mod manifests already collected from JSON globs.
   *   Used to supply ``displayName`` for each workspace.
   */
  hydrateFromBackend(
    payload: Record<string, BackendModRegistryEntry>,
    manifests: ReadonlyMap<string, ModManifest>,
  ): void {
    for (const [workspaceId, entry] of Object.entries(payload)) {
      const manifest = manifests.get(workspaceId);
      const schemaType = entry.schemaTypes?.[0];

      this.workspaces.set(workspaceId, {
        id: workspaceId,
        displayName: manifest?.displayName ?? workspaceId,
        icon: undefined,
        schemaType: schemaType
          ? {
              id: schemaType.id,
              displayName: schemaType.displayName,
              defaultPrefix: schemaType.prefix,
              columns: schemaType.columns as SchemaColumnDef[] | undefined,
            }
          : undefined,
      });
    }
  }

  /**
   * Register a renderer-agnostic content block.
   *
   * Blocks are stored in a single map and can be bound into any slot via
   * {@link registerIntoSlot}. Consumers read blocks via {@link getBlocks}
   * or resolve them through the slot system via {@link resolveSlot}.
   */
  registerBlock(config: BlockRegistration): void {
    if (this.blocks.has(config.id)) {
      throw new Error(
        `Duplicate block registration: '${config.id}' is already registered.`,
      );
    }
    this.blocks.set(config.id, config);
  }

  declareSlot(config: SlotDeclaration): void {
    if (this.slots.has(config.id)) {
      throw new Error(
        `Duplicate slot declaration: '${config.id}' is already registered.`,
      );
    }
    this.slots.set(config.id, config);
  }

  registerButton(config: ButtonRegistration): void {
    if (this.buttons.has(config.id)) {
      throw new Error(
        `Duplicate button registration: '${config.id}' is already registered.`,
      );
    }
    this.buttons.set(config.id, config);
  }

  registerIntoSlot(
    slotId: string,
    targetId: string,
    overrides: Record<string, unknown> = {},
    order = 0,
  ): void {
    const binding: SlotBinding = { slotId, targetId, overrides, order };
    const existing = this.bindings.get(slotId);
    if (existing) {
      existing.push(binding);
    } else {
      this.bindings.set(slotId, [binding]);
    }
  }

  // ── Resolution methods ────────────────────────────────────────────────

  /**
   * Resolve the registered LibraryItemConfig for a given item type ID.
   * Returns undefined if no registration matches.
   */
  resolveLibraryItem(itemTypeId: string): LibraryItemConfig | undefined {
    return this.libraryItems.get(itemTypeId);
  }

  /**
   * Resolve a slot into its renderer-ready bindings.
   *
   * Looks up the slot declaration, resolves each binding's target (block or
   * button) from the registry, and merges slot `defaults` with per-binding
   * `overrides` (binding overrides win on a per-key basis).
   *
   * Returns `null` when the slot is not declared or has no valid bindings.
   * Bindings whose targets don't exist in the registry are silently skipped.
   *
   * The returned array is sorted ascending by `order`.
   */
  resolveSlot(
    slotId: string,
  ): { renderer: SlotDeclaration["renderer"]; bindings: (BlockBinding | ButtonBinding)[] } | null {
    const slot = this.slots.get(slotId);
    if (!slot) return null;

    const rawBindings = this.bindings.get(slotId);
    if (!rawBindings || rawBindings.length === 0) return null;

    const resolved: (BlockBinding | ButtonBinding)[] = [];

    for (const binding of rawBindings) {
      if (slot.accepts === "block") {
        const block = this.blocks.get(binding.targetId);
        if (!block) continue;

        // Merge slot defaults with binding overrides (binding wins per-key)
        const mergedOverrides: Record<string, unknown> = {
          ...slot.defaults,
          ...binding.overrides,
        };

        resolved.push({
          type: "block" as const,
          id: block.id,
          label: block.label,
          icon: block.icon,
          component: block.component,
          listensTo: block.listensTo,
          onEvent: block.onEvent,
          messages: block.messages,
          getDisplayName: block.getDisplayName,
          tags: block.tags,
          overrides: mergedOverrides,
          serialize: block.serialize,
          deserialize: block.deserialize,
          defaultState: block.defaultState,
          order: binding.order,
        });
      } else {
        const button = this.buttons.get(binding.targetId);
        if (!button) continue;

        resolved.push({
          type: "button" as const,
          id: button.id,
          label: button.label,
          icon: button.icon,
          onClick: button.onClick,
          order: binding.order,
        });
      }
    }

    if (resolved.length === 0) return null;

    // Sort ascending by order
    resolved.sort((a, b) => a.order - b.order);

    return { renderer: slot.renderer, bindings: resolved };
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

    // Validate slot bindings (warning-based — bad bindings are skipped, not crashed)
    for (const [slotId, slotBindings] of this.bindings) {
      const slot = this.slots.get(slotId);

      // Check 1: slot must be declared before bindings target it
      if (!slot) {
        console.warn(
          `Slot binding skipped: slot '${slotId}' is not declared. ` +
            `Declare the slot with declareSlot() before calling registerIntoSlot().`,
        );
        this.bindings.delete(slotId);
        continue;
      }

      // Check 2 & 3: each binding's target must exist and match slot accepts
      const validBindings = slotBindings.filter((binding) => {
        // Check target exists in blocks or buttons
        const targetInBlocks = this.blocks.has(binding.targetId);
        const targetInButtons = this.buttons.has(binding.targetId);

        if (!targetInBlocks && !targetInButtons) {
          console.warn(
            `Slot binding skipped: target '${binding.targetId}' is not a registered ` +
              `block or button. Register the target before calling registerIntoSlot().`,
          );
          return false;
        }

        // Check target type matches slot's accepts
        if (slot.accepts === "block" && !targetInBlocks) {
          console.warn(
            `Slot binding skipped: slot '${slotId}' accepts 'block' but target ` +
              `'${binding.targetId}' is a button.`,
          );
          return false;
        }

        if (slot.accepts === "button" && !targetInButtons) {
          console.warn(
            `Slot binding skipped: slot '${slotId}' accepts 'button' but target ` +
              `'${binding.targetId}' is a block.`,
          );
          return false;
        }

        return true;
      });

      // Replace with validated bindings
      if (validBindings.length > 0) {
        this.bindings.set(slotId, validBindings);
      } else {
        this.bindings.delete(slotId);
      }
    }
  }

  // ── Read-only accessors ───────────────────────────────────────────────

  /** Returns a read-only view of all registered hubs. */
  getHubs(): ReadonlyMap<string, HubConfig> {
    return this.hubs;
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

  /** Returns only routes registered with ``public: true`` (outside Layout). */
  getPublicRoutes(): RouteConfig[] {
    return [...this.routes.values()].filter((r) => r.public === true);
  }

  /** Returns only routes that render inside the Layout shell. */
  getLayoutRoutes(): RouteConfig[] {
    return [...this.routes.values()].filter((r) => !r.public);
  }

  /** Returns a read-only view of all registered sidebar actions. */
  getSidebarActions(): ReadonlyMap<string, SidebarActionConfig> {
    return this.sidebarActions;
  }

  /** Returns a read-only view of all registered library items. */
  getLibraryItems(): ReadonlyMap<string, LibraryItemConfig> {
    return this.libraryItems;
  }

  /** Returns a read-only view of all registered workspaces. */
  getWorkspaces(): ReadonlyMap<string, WorkspaceConfig> {
    return this.workspaces;
  }

  /** Returns a read-only view of all registered blocks. */
  getBlocks(): ReadonlyMap<string, BlockRegistration> {
    return this.blocks;
  }

  /** Returns a read-only view of all declared slots. */
  getSlots(): ReadonlyMap<string, SlotDeclaration> {
    return this.slots;
  }

  /** Returns a read-only view of all registered buttons. */
  getButtons(): ReadonlyMap<string, ButtonRegistration> {
    return this.buttons;
  }

  /** Returns a read-only view of all slot bindings, keyed by slotId. */
  getBindings(): ReadonlyMap<string, SlotBinding[]> {
    return this.bindings;
  }
}
