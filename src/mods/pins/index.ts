import { registerSidebarAction } from "../../shell/src/mod-system";
import PinnedWorkspacesSidebar from "./components/PinnedWorkspacesSidebar";
export function register() {
  // ── Sidebar action: workspace section (renders for all workspaces) ──────
  registerSidebarAction({
    id: "pins.sidebar",
    workspaceId: "*", // wildcard: render for all workspaces
    component: PinnedWorkspacesSidebar,
    position: "inline",
  });
}
