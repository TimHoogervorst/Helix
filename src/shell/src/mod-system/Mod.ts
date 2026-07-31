import { ModRegistry } from "./ModRegistry";
import type {
  ModManifest,
  BlockHandle,
  SlotHandle,
  ButtonHandle,
  BlockRegistration,
  SlotDeclaration,
  ButtonRegistration,
  HubConfig,
  RouteConfig,
  SettingsSectionConfig,
} from "./types";

/**
 * Public registration API for a mod.
 *
 * Each mod creates one ``Mod`` instance at module scope from its own
 * ``modManifest.json``.  All ``register*()`` methods derive global IDs
 * automatically from ``manifest.name + "." + localName`` and delegate
 * storage to the internal {@link ModRegistry}.
 *
 * Mods import ``Mod`` directly; ``ModRegistry`` and the standalone
 * ``registerBlock()`` / ``declareSlot()`` / etc. functions are no longer
 * part of the public API.
 *
 * ## Example
 *
 * .. code-block:: ts
 *
 *    import modManifest from "./modManifest.json";
 *    const mod = new Mod(modManifest as ModManifest);
 *
 *    const tableBlock = mod.registerBlock("table", {
 *      label: "Table",
 *      icon: TableIcon,
 *      component: TableBlockComponent,
 *      // ...
 *    });
 *    // tableBlock.globalId === "eln.table"
 *    // tableBlock.modId === "helix.eln"
 */
export class Mod {
  /** The manifest this mod was created from. */
  readonly manifest: ModManifest;

  constructor(manifest: ModManifest) {
    this.manifest = manifest;
  }

  /**
   * Fully-qualified mod identity: ``vendor + "." + name``.
   *
   * This is the uniqueness anchor used throughout the mod system for
   * duplicate detection, topological sort, and cross-mod references.
   */
  get id(): string {
    return `${this.manifest.vendor}.${this.manifest.name}`;
  }

  // ── Block ─────────────────────────────────────────────────────────────

  /**
   * Register a renderer-agnostic content block.
   *
   * The global ID is derived as ``{manifest.name}.{name}``
   * (e.g. ``"eln.table"``).  The returned {@link BlockHandle} carries the
   * derived identity and typed emitters for every entry in ``emits``.
   */
  registerBlock(
    name: string,
    config: Omit<BlockRegistration, "id">,
  ): BlockHandle {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().registerBlock({ ...config, id: globalId });

    // Build typed emitters from the emits array.
    // Not wired to the bus yet — fire() constructs the payload shape only.
    const emits: Record<string, { fire: (payload: unknown) => void }> = {};
    if (config.emits) {
      for (const e of config.emits) {
        emits[e.id] = {
          fire: (_payload: unknown) => {
            // Emitter shape defined; bus wiring deferred to a follow-up issue.
          },
        };
      }
    }

    return {
      __brand: "BlockHandle" as const,
      globalId,
      modId: this.id,
      emits,
    };
  }

  // ── Slot ──────────────────────────────────────────────────────────────

  /**
   * Declare a named placeholder in a workspace.
   *
   * The global slot ID is derived as ``{manifest.name}.{name}``
   * (e.g. ``"eln.editor"``).  Returns a {@link SlotHandle} carrying the
   * ``accepts`` type so {@link registerIntoSlot} can compile-check that
   * bound targets match.
   */
  declareSlot(
    name: string,
    config: Omit<SlotDeclaration, "id">,
  ): SlotHandle {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().declareSlot({ ...config, id: globalId });

    return {
      __brand: "SlotHandle" as const,
      globalId,
      modId: this.id,
      accepts: config.accepts,
    };
  }

  // ── Button ────────────────────────────────────────────────────────────

  /**
   * Register a simple fire-only button for toolbar and button-group slots.
   *
   * The global button ID is derived as ``{manifest.name}.{name}``
   * (e.g. ``"eln.export"``).  Returns a {@link ButtonHandle} for use with
   * {@link registerIntoSlot}.
   */
  registerButton(
    name: string,
    config: Omit<ButtonRegistration, "id">,
  ): ButtonHandle {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().registerButton({ ...config, id: globalId });

    return {
      __brand: "ButtonHandle" as const,
      globalId,
      modId: this.id,
    };
  }

  // ── Slot binding ─────────────────────────────────────────────────────

  /**
   * Bind a block or button into an existing slot.
   *
   * Accepts typed handles instead of raw strings — the type system prevents
   * binding a button into a block-only slot (and vice versa).
   *
   * @param slot   - Handle returned by {@link declareSlot}.
   * @param target - Handle returned by {@link registerBlock} or {@link registerButton}.
   * @param overrides - Per-binding overrides merged with slot defaults (binding wins per-key).
   * @param order     - Position within the slot. Lower = earlier (leftmost/topmost).
   */
  registerIntoSlot(
    slot: SlotHandle,
    target: BlockHandle | ButtonHandle,
    overrides?: Record<string, unknown>,
    order?: number,
  ): void {
    ModRegistry.getInstance().registerIntoSlot(
      slot.globalId,
      target.globalId,
      overrides,
      order,
    );
  }

  // ── Cross-mod slot lookup ────────────────────────────────────────────

  /**
   * Resolve a slot declared by another mod at runtime.
   *
   * The ``qualifiedModId`` is the fully-qualified ``vendor.name`` identity
   * (e.g. ``"helix.eln"``).  The ``slotName`` is the local slot name within
   * that mod (e.g. ``"editor"``).  Together they resolve to the global slot
   * ID ``"eln.editor"``.
   *
   * Returns a {@link SlotHandle} when the slot exists so the caller can pass
   * it to {@link registerIntoSlot}.  Returns ``undefined`` when the target
   * mod or slot is not found, or when the slot hasn't been declared yet.
   *
   * The ``dependsOn`` manifest field guarantees the target mod loads first,
   * so the slot is always registered before the consumer queries it.
   *
   * **Example:**
   *
   * .. code-block:: ts
   *
   *    const editorSlot = mod.resolveSlot("helix.eln", "editor");
   *    if (editorSlot) {
   *      mod.registerIntoSlot(editorSlot, myBlock);
   *    }
   */
  resolveSlot(qualifiedModId: string, slotName: string): SlotHandle | undefined {
    // Derive the target mod's manifest name from the qualified ID.
    // Qualified mod ID is "vendor.name" (e.g. "helix.eln"); the manifest
    // name is everything after the first dot (e.g. "eln").
    const targetModName = qualifiedModId.substring(
      qualifiedModId.indexOf(".") + 1,
    );
    const globalSlotId = `${targetModName}.${slotName}`;

    const slot = ModRegistry.getInstance().getSlots().get(globalSlotId);
    if (!slot) return undefined;

    return {
      __brand: "SlotHandle" as const,
      globalId: slot.id,
      modId: qualifiedModId,
      accepts: slot.accepts,
    };
  }

  // ── Hub ───────────────────────────────────────────────────────────────

  /**
   * Register a hub (browsing surface) with the mod system.
   *
   * The global hub ID is derived as ``{manifest.name}.{name}``.
   * Automatically adds a sidebar nav item and a route.
   */
  registerHub(
    name: string,
    config: Omit<HubConfig, "id">,
  ): void {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().registerHub({ ...config, id: globalId });
  }

  // ── Route ─────────────────────────────────────────────────────────────

  /**
   * Register a standalone route not tied to a hub or workspace.
   *
   * The global route ID is derived as ``{manifest.name}.{name}``.
   * The ``modId`` is automatically set from the manifest's short name.
   */
  registerRoute(
    name: string,
    config: Omit<RouteConfig, "id" | "modId">,
  ): void {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().registerRoute({
      ...config,
      id: globalId,
      modId: this.manifest.name,
    });
  }

  // ── Settings section ──────────────────────────────────────────────────

  /**
   * Register a settings panel in the Settings shell.
   *
   * The global section ID is derived as ``{manifest.name}.{name}``.
   * The ``modId`` is automatically set from the manifest's short name.
   */
  registerSettingsSection(
    name: string,
    config: Omit<SettingsSectionConfig, "id" | "modId">,
  ): void {
    const globalId = `${this.manifest.name}.${name}`;
    ModRegistry.getInstance().registerSettingsSection({
      ...config,
      id: globalId,
      modId: this.manifest.name,
    });
  }
}
