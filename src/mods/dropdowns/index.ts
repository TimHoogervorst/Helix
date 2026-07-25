import { lazy } from "react";
import { List } from "lucide-react";
import { registerSettingsSection } from "../../shell/src/mod-system";

export function register() {
  // ── Settings: Dropdown management ────────────────────────────────────
  registerSettingsSection({
    id: "dropdowns.manage",
    modId: "dropdowns",
    label: "Dropdowns",
    icon: List,
    component: lazy(() => import("./settings/DropdownSettings")),
    order: 30,
  });
}
