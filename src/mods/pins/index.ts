import { registerSidebarAction } from "../../shell/src/mod-system";
import type { ModManifest } from "../../shell/src/mod-system/types";
import PinnedWorkspacesSidebar from "./components/PinnedWorkspacesSidebar";

export const meta: ModManifest = {
  id: "pins",
  displayName: "Pinned Workspaces",
  dependsOn: [],
};

export function register() {
  // ── Sidebar action: workspace section (renders for all workspaces) ──────
  registerSidebarAction({
    id: "pins.sidebar",
    workspaceId: "*", // wildcard: render for all workspaces
    component: PinnedWorkspacesSidebar,
    position: "inline",
  });
}
