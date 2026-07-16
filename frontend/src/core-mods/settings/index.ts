import { registerRoute } from "../../core/mod-system";
import SettingsPage from "./pages/SettingsPage";

export const meta = {
  id: "settings",
  displayName: "Settings",
  version: "0.1.0",
  dependsOn: [],
};

export function register() {
  // ── Route: /settings shell with sidebar-nav layout ─────────────────────
  registerRoute({
    id: "settings.page",
    modId: "settings",
    path: "/settings",
    component: SettingsPage,
  });
}
