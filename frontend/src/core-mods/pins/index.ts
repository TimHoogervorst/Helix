import { registerSidebarAction } from "../../core/mod-system";
import PinnedWorkspacesSidebar from "./components/PinnedWorkspacesSidebar";

export const meta = {
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
