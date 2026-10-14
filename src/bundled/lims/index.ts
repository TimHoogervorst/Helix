import { Cog, Database, Info, LayoutList, Users, FlaskConical, MessageSquare, History } from "lucide-react";
import { BlockEvent, type Mod } from "@helix/mod-api";
import { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
import LimsWorkspacePage from "./workspace/LimsWorkspacePage";
import SchemaSettings from "./settings/SchemaSettings";
import { SelectionBlock } from "./blocks/SelectionBlock";
import { MyViewsBlock } from "./blocks/MyViewsBlock";
import { GlobalViewsBlock } from "./blocks/GlobalViewsBlock";
import { ActivityFeedBlock } from "./blocks/ActivityFeedBlock";
import ResultsTab from "./workspace/ResultsTab";
import { patch } from "../../shell/src/api/client";
import { CommentBlockComponent } from "./blocks/CommentNodeView";
import { ProtocolBlockComponent } from "./blocks/ProtocolBlockNode";
import { RegistryTableBlockComponent } from "./blocks/RegistryTableNode";
import { ResultTableBlockComponent } from "./blocks/ResultTableNode";

export function register(mod: Mod) {
  mod.registerContentSource("entity", {
  label: "Entity",
  edit: (displayId, changes) => patch(`/lims/entities/${displayId}/`, changes),
  navigate: (displayId, params) => {
    const query = params.toString();
    return `/lims/${displayId}${query ? `?${query}` : ""}`;
  },
  });

  const editorBlock = (name: string, config: Parameters<Mod["registerBlock"]>[1]) =>
    mod.registerBlock(name, { ...config, affinity: ["editor"] });

  editorBlock("comment", {
    label: "Comment", icon: MessageSquare, component: CommentBlockComponent,
    listensTo: [], onEvent: {}, emits: [], tags: ["discussion", "annotation"],
    getDisplayName: (attrs) => ((attrs.thread as Array<{ authorName?: string }>)?.[0]?.authorName || "Comment"),
    serialize: (state) => JSON.stringify(state), deserialize: (json) => { try { return JSON.parse(json); } catch { return {}; } },
    defaultState: { resolved: false, thread: [] },
  });
  editorBlock("protocol", {
    label: "Protocol", icon: FlaskConical, component: ProtocolBlockComponent,
    listensTo: [], onEvent: {}, emits: [], tags: ["procedure", "workflow"], preserve: ["protocolId"],
    getDisplayName: (attrs) => (attrs.name as string) || "Protocol",
    serialize: (state) => JSON.stringify(state), deserialize: (json) => { try { return JSON.parse(json); } catch { return {}; } },
    defaultState: { protocolId: null, name: "Protocol", items: [], stepStates: {}, editable: false },
  });
  editorBlock("registry-table", {
    label: "Registry Table", layout: "dynamic-bleed", icon: Database, component: RegistryTableBlockComponent,
    listensTo: [], onEvent: {}, emits: [BlockEvent.action({ id: "entities-registered", core: "edited" }), BlockEvent.action({ id: "row-added", core: "edited" }), BlockEvent.ui({ id: "column-resized" })], tags: ["table", "registry", "lims"], preserve: ["schemaId"],
    getDisplayName: (attrs) => (attrs.schemaName || attrs.title) as string || "Registry Table",
    serialize: (state) => JSON.stringify(state), deserialize: (json) => { try { return JSON.parse(json); } catch { return {}; } },
    defaultState: { schemaId: null, schemaName: null, schemaContentHash: null, title: "Registry Table", columns: [], rows: [] },
  });
  editorBlock("result-table", {
    label: "Result Table", layout: "dynamic-bleed", icon: Database, component: ResultTableBlockComponent,
    listensTo: [], onEvent: {}, emits: [BlockEvent.action({ id: "results-registered", core: "edited" })], tags: ["table", "result", "lims"], preserve: ["schemaId"],
    getDisplayName: (attrs) => (attrs.schemaName || attrs.title) as string || "Result Table",
    serialize: (state) => JSON.stringify(state), deserialize: (json) => { try { return JSON.parse(json); } catch { return {}; } },
    defaultState: { schemaId: null, schemaName: null, schemaContentHash: null, title: "Result Table", columns: [], rows: [] },
  });

mod.registerSchemaComponent("results", {
  label: "Results",
  icon: Database,
  component: ResultsTab,
  order: 10,
});

// ── Standalone route: full entity workspace page ──────────────────────
mod.registerWorkspace("lims", {
  component: LimsWorkspacePage,
});

// ── Settings: schema CRUD ───────────────────────────────────────────
mod.registerSettingsSection("schema-settings", {
  label: "Schemas",
  icon: Cog,
  component: SchemaSettings,
  order: 10,
});

// ── Slot: Entities Hub Sidebar ────────────────────────────────────────
const sidebarSlot = mod.declareSlot("sidebar", {
  accepts: "block",
  renderer: SlotSidebar,
  layout: "vertical",
  order: 0,
  defaults: {},
});

// ── Block: Selection placeholder ──────────────────────────────────────
const selectionBlock = mod.registerBlock("selection", {
  label: "Selection",
  icon: Info,
  component: SelectionBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: My Views placeholder ───────────────────────────────────────
const myViewsBlock = mod.registerBlock("my-views", {
  label: "My Views",
  icon: LayoutList,
  component: MyViewsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Global Views placeholder ───────────────────────────────────
const globalViewsBlock = mod.registerBlock("global-views", {
  label: "Global Views",
  icon: Users,
  component: GlobalViewsBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Block: Entity Activity Feed ─────────────────────────────────────────
const activityFeedBlock = mod.registerBlock("activity-feed", {
  label: "Activity Feed",
  icon: History,
  component: ActivityFeedBlock,
  listensTo: [],
  onEvent: {},
  emits: [],
  serialize: () => "{}",
  deserialize: () => ({}),
  defaultState: {},
});

// ── Bind blocks into the sidebar slot ─────────────────────────────────
mod.registerIntoSlot(sidebarSlot, selectionBlock, {}, 0);
mod.registerIntoSlot(sidebarSlot, myViewsBlock, {}, 1);
mod.registerIntoSlot(sidebarSlot, globalViewsBlock, {}, 2);
mod.registerIntoSlot(sidebarSlot, activityFeedBlock, {}, 3);

}
