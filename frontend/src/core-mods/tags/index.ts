import { lazy } from "react";
import { Tag } from "lucide-react";
import { registerSettingsSection } from "../../core/mod-system";

export const meta = {
  id: "tags",
  displayName: "Tags",
  dependsOn: [] as string[],
};

export function register() {
  // ── Settings: Tag management ──────────────────────────────────────────
  registerSettingsSection({
    id: "tags.manage",
    modId: "tags",
    label: "Tags",
    icon: Tag,
    component: lazy(() => import("./settings/TagSettings")),
    order: 20,
  });
}
