import { registerRoute } from "../../shell/src/mod-system";
import SettingsPage from "./pages/SettingsPage";
export function register() {
  // ── Route: /settings shell with sidebar-nav layout ─────────────────────
  registerRoute({
    id: "settings.page",
    modId: "settings",
    path: "/settings",
    component: SettingsPage,
  });
}
