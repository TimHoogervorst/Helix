import { lazy } from "react";
import { Tag } from "lucide-react";
import { registerSettingsSection } from "../../core/mod-system";

export const meta = {
  id: "tags",
  displayName: "Labelling",
  version: "0.1.0",
  dependsOn: [] as string[],
};

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
