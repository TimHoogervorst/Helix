import { lazy } from "react";
import { Tag } from "lucide-react";
import { registerSettingsSection } from "../../shell/src/mod-system";
export function register() {
  // ── Settings: Tag management ──────────────────────────────────────────
  registerSettingsSection({
    id: "tags.manage",
    modId: "tags",
    label: "Labelling",
    icon: Tag,
    component: lazy(() => import("./settings/TagSettings")),
    order: 20,
  });
}
