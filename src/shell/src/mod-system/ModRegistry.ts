import type {
  HubConfig,
  SettingsSectionConfig,
  RouteConfig,
  ServiceConfig,
  WorkspaceConfig,
  BlockRegistration,
  ButtonRegistration,
  SlotDeclaration,
  SlotBinding,
  BlockBinding,
  ButtonBinding,
  SchemaColumnDef,
  ModManifest,
  ActionCatalogEntry,
  IconLibraryEntry,
  ColorToken,
} from "./types";
import {
  getClientFormulaFunctionIds,
  hydrateFormulaCatalog,
  registerFormulaFunction as registerClientFormulaFunction,
  type FormulaFunctionImplementation,
} from "../shared/formulas/formulaEngine";

/** Schema type entry from the backend mod-registry payload. */
interface BackendSchemaType {
  id: string;
  displayName: string;
  prefix: string;
  columns?: Record<string, unknown>[];
}

/** Operator definition from the backend column type registry. */
export interface BackendOperator {
  id: string;
  label: string;
  operandShape: string;
  djangoLookupName: string;
}

/** Aggregate definition from the backend column type registry. */
export interface BackendAggregate {
  id: string;
  label: string;
  djangoAggregateName: string;
  resultOperandShape: string;
}

/** Column type entry from the backend mod-registry payload. */
export interface BackendColumnType {
  id: string;
  displayName: string;
  icon: string;
  color: string;
  operandShape: string;
  defaultValue: unknown;
  operators: BackendOperator[];
  aggregates: BackendAggregate[];
}

/** Formula metadata hydrated from the backend function catalog. */
export interface BackendFormulaFunction {
  id: string;
  argumentKinds: string[];
  resultKind: string;
  description: string;
  clientImplemented: boolean;
}

/** Single workspace entry in the backend mod-registry response. */
interface BackendModRegistryEntry {
  workspaceId: string;
  schemaTypes: BackendSchemaType[];
  actions: Array<{ id: string; label: string; action_type: string }>;
}

/** Type guard: structural check that a value is a workspace entry. */
function isWorkspaceEntry(
  value: unknown,
): value is BackendModRegistryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "workspaceId" in value
  );
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

function getCsrfCookie(): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split("; csrftoken=");
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

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
  private services = new Map<string, ServiceConfig>();
  private workspaces = new Map<string, WorkspaceConfig>();
  private blocks = new Map<string, BlockRegistration>();
  private slots = new Map<string, SlotDeclaration>();
  private buttons = new Map<string, ButtonRegistration>();
  /** Bindings keyed by slotId. Each slot can have multiple bindings. */
  private bindings = new Map<string, SlotBinding[]>();

  /** Action catalogs keyed by workspace ID, hydrated from the backend. */
  private actions = new Map<string, ActionCatalogEntry[]>();

  /** Column type definitions keyed by type ID, hydrated from the backend. */
  private columnTypes = new Map<string, BackendColumnType>();

  /** Icon library entries keyed by key, hydrated from the backend. */
  private iconLibrary = new Map<string, IconLibraryEntry>();

  /** Color palette entries keyed by key, hydrated from the backend. */
  private colorPalette = new Map<string, ColorToken>();
  private formulaFunctions = new Map<string, BackendFormulaFunction>();
  private clientFormulaFunctionIds = new Set<string>();
  private formulaCatalogHydrated = false;

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

  registerService(config: ServiceConfig): void {
    if (this.services.has(config.id)) {
      throw new Error(
        `Duplicate service registration: '${config.id}' is already registered.`,
      );
    }
    this.services.set(config.id, config);
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
    payload: Record<string, unknown>,
    manifests: ReadonlyMap<string, ModManifest>,
  ): void {
    for (const [key, value] of Object.entries(payload)) {
      if (key === "columnTypes" && Array.isArray(value)) {
        this.columnTypes.clear();
        for (const ct of value) {
          this.columnTypes.set(ct.id, ct as BackendColumnType);
        }
        continue;
      }

      if (key === "formulaFunctions" && Array.isArray(value)) {
        this.formulaCatalogHydrated = true;
        this.formulaFunctions.clear();
        for (const entry of value) {
          const functionEntry = entry as BackendFormulaFunction;
          this.formulaFunctions.set(functionEntry.id, functionEntry);
        }
        hydrateFormulaCatalog(this.formulaFunctions.values());
        for (const id of this.clientFormulaFunctionIds) {
          if (!this.formulaFunctions.has(id)) {
            this.clientFormulaFunctionIds.delete(id);
          }
        }
        continue;
      }

      if (key === "iconLibrary" && Array.isArray(value)) {
        this.iconLibrary.clear();
        for (const entry of value) {
          const e = entry as { key: string; label: string; kind: string; token: string; svg: string };
          this.iconLibrary.set(e.key, {
            key: e.key,
            label: e.label,
            kind: e.kind as "lucide" | "custom",
            token: e.token,
            svg: e.svg,
          });
        }
        continue;
      }

      if (key === "colorPalette" && Array.isArray(value)) {
        this.colorPalette.clear();
        for (const entry of value) {
          const e = entry as { key: string; label: string; hex: string; hexDark: string; hexLight: string };
          this.colorPalette.set(e.key, {
            key: e.key,
            label: e.label,
            hex: e.hex,
            hexDark: e.hexDark ?? e.hex,
            hexLight: e.hexLight ?? e.hex,
          });
        }
        continue;
      }

      // Structural guard: workspace entries have a workspaceId property.
      if (!isWorkspaceEntry(value)) {
        continue;
      }

      const wsEntry = value;
      const manifest = manifests.get(key);
      const schemaType = wsEntry.schemaTypes?.[0];

      this.workspaces.set(key, {
        id: key,
        displayName: manifest?.displayName ?? key,
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

      // Hydrate action catalog for this workspace.
      // Always replace — an empty actions array clears the catalog so
      // stale entries from a previous hydration call are not retained.
      if (wsEntry.actions) {
        this.actions.set(
          key,
          wsEntry.actions.map((a) => ({
            id: a.id,
            label: a.label,
            action_type: a.action_type,
          })),
        );
      }
    }
  }

  /** Register a client implementation for a hydrated or pending catalog ID. */
  registerFormulaFunction(
    id: string,
    implementation: FormulaFunctionImplementation,
  ): void {
    if (this.formulaCatalogHydrated && !this.formulaFunctions.has(id)) {
      console.warn(`Unknown formula function '${id}' was not registered.`);
      return;
    }
    registerClientFormulaFunction(id, implementation);
    this.clientFormulaFunctionIds.add(id);
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
          getDisplayName: block.getDisplayName,
          tags: block.tags,
          emits: block.emits,
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

  /**
   * Return the action catalog for a workspace, hydrated from the backend.
   *
   * Returns an empty array when no actions have been hydrated for the
   * given workspace (e.g. before hydration completes or when the backend
   * has no action model registered for this workspace).
   */
  getActions(workspaceId: string): ActionCatalogEntry[] {
    return this.actions.get(workspaceId) ?? [];
  }

  /**
   * Look up a registered column type by its ID.
   *
   * Returns ``undefined`` when no column type with the given ID has been
   * hydrated from the backend.
   */
  getColumnType(typeId: string): BackendColumnType | undefined {
    return this.columnTypes.get(typeId);
  }

  /** Return the complete backend formula catalog. */
  getFormulaFunctions(): ReadonlyMap<string, BackendFormulaFunction> {
    return this.formulaFunctions;
  }

  /** Return catalog entries with client implementations available. */
  getClientFormulaFunctions(): BackendFormulaFunction[] {
    const clientIds = getClientFormulaFunctionIds();
    return [...this.formulaFunctions.values()].filter((entry) =>
      clientIds.has(entry.id),
    );
  }

  /**
   * Return all registered column types as a read-only map.
   *
   * Returns an empty map before hydration completes.
   */
  getColumnTypes(): ReadonlyMap<string, BackendColumnType> {
    return this.columnTypes;
  }

  /**
   * Return all icon library entries as a read-only map, keyed by icon key.
   *
   * Returns an empty map before hydration completes.
   */
  getIconLibrary(): ReadonlyMap<string, IconLibraryEntry> {
    return this.iconLibrary;
  }

  /**
   * Return all color palette entries as a read-only map, keyed by color key.
   *
   * Returns an empty map before hydration completes.
   */
  getColorPalette(): ReadonlyMap<string, ColorToken> {
    return this.colorPalette;
  }

  /**
   * Resolve a human-readable label for an action type from a catalog.
   *
   * Returns the catalog entry's ``label`` when a matching entry exists,
   * falling back to the raw ``actionType`` string (e.g. "eln.table.created").
   * This is the single place for the label-resolution strategy — both
   * ``useBlockActionLogging`` and ``ActivityFeedBlock`` route through here.
   */
  static resolveActionLabel(
    actionType: string,
    catalog: ActionCatalogEntry[],
  ): string {
    return catalog.find((a) => a.id === actionType)?.label ?? actionType;
  }

  // ── Action sync ──────────────────────────────────────────────────────

  /**
   * Compute action IDs from block emits and lifecycle actions, then
   * sync them to the backend via ``POST /api/mod-registry/sync-actions/``.
   *
   * Called by ModLoader during boot **before**
   * ``loadFromBackend`` so the backend catalog is up-to-date when the
   * frontend fetches it.
   *
   * **Editor-slot-bound blocks** (renderer name ``"TipTapRenderer"``)
   * get three baked-in lifecycle actions: ``{blockId}.created``,
   * ``{blockId}.edited``, ``{blockId}.deleted``.
   *
   * **Custom emit actions** are derived from each block's ``emits``
   * array: ``{blockId}.{emit.id}`` for every ``BlockEvent.action()``
   * entry.  ``BlockEvent.ui()`` entries are skipped — they stay on the
   * bus and never hit the database.
   *
   * Actions are grouped by mod (first ``"."``-separated segment of the
   * block ID) and POSTed to the backend.  Per-mod POSTs are
   * parallelized via ``Promise.all`` — each mod's sync is independent.
   *
   * Returns a rejected promise when any mod's backend POST returns a
   * validation mismatch (non-OK response).  The caller (ModLoader)
   * catches this and boots fail-soft, proceeding to the registry fetch
   * without a fresh action catalog.
   */
  async syncActions(): Promise<void> {
    // Step 1 — identify editor-slot-bound block IDs.
    const editorBlockIds = new Set<string>();

    for (const [slotId, slotBindings] of this.bindings) {
      const slot = this.slots.get(slotId);
      if (!slot) continue;

      // Editor slots are identified by renderer name — TipTapRenderer
      // is the only editor renderer in the platform.
      if (slot.renderer.name !== "TipTapRenderer") continue;

      for (const binding of slotBindings) {
        editorBlockIds.add(binding.targetId);
      }
    }

    // Step 2 — compute action IDs grouped by mod.
    const actionsByMod = new Map<
      string,
      Array<{ id: string; core: string }>
    >();

    const addAction = (modId: string, actionId: string, core: string) => {
      if (!actionsByMod.has(modId)) {
        actionsByMod.set(modId, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      actionsByMod.get(modId)!.push({ id: actionId, core });
    };

    for (const [blockId, block] of this.blocks) {
      // First segment is the mod name (e.g. "eln" in "eln.table").
      const modId = blockId.split(".")[0];

      // Lifecycle actions — only for editor-slot-bound blocks.
      if (editorBlockIds.has(blockId)) {
        addAction(modId, `${blockId}.created`, "created");
        addAction(modId, `${blockId}.edited`, "edited");
        addAction(modId, `${blockId}.deleted`, "deleted");
      }

      // Custom emit actions — skip UI-only events.
      if (block.emits) {
        for (const emit of block.emits) {
          if (emit.category === "action") {
            addAction(modId, `${blockId}.${emit.id}`, emit.core);
          }
        }
      }
    }

    // Step 3 — POST each mod's actions to the backend in parallel.
    await Promise.all(
      Array.from(actionsByMod.entries()).map(async ([modId, actions]) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const csrfToken = getCsrfCookie();
        if (csrfToken) {
          headers["X-CSRFToken"] = csrfToken;
        }
        const response = await fetch("/api/mod-registry/sync-actions/", {
          method: "POST",
          headers,
          body: JSON.stringify({ mod_id: modId, actions }),
        });

        if (!response.ok) {
          const result = (await response.json()) as any;
          throw new Error(
            `Action sync failed for mod '${modId}': ` +
              (result.missing
                ? `Missing actions: ${result.missing.join(", ")}`
                : result.error || `HTTP ${response.status}`),
          );
        }
      }),
    );
  }

  // ── Backend hydration ─────────────────────────────────────────────────

  /**
   * Fetch ``GET /api/mod-registry/`` and hydrate the registry.
   *
   * Called by ModLoader during boot.  In production this replaces
   * the inline fetch logic in ModLoader so the registry is the single
   * owner of its hydration strategy.
   *
   * Uses raw ``fetch`` (not the API client) so a 401 does not trigger
   * a login redirect — the login page is rendered promptly via the
   * fail-soft path instead.
   *
   * @param manifests - Mod manifests already collected from JSON globs.
   *   Used to supply ``displayName`` for each workspace.
   * @returns A promise that resolves when hydration completes (even on
   *   failure — errors are caught and logged as warnings, keeping the
   *   promise resolved so boot is never permanently blocked).
   */
  static async loadFromBackend(
    manifests: ReadonlyMap<string, ModManifest>,
  ): Promise<void> {
    const registry = ModRegistry.getInstance();

    try {
      const response = await fetch("/api/mod-registry/");
      if (response.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = (await response.json()) as any;
        registry.hydrateFromBackend(payload, manifests);
      } else {
        console.warn(
          `Failed to fetch /api/mod-registry/ (status ${response.status}). ` +
            `Workspaces won't be hydrated from backend.`,
        );
      }
    } catch (err) {
      console.warn(
        "Failed to fetch /api/mod-registry/. Workspaces won't be hydrated from backend.",
        err,
      );
    }
  }
}
