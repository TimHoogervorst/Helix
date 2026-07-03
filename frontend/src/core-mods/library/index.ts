import { lazy } from "react";
import { BookOpen } from "lucide-react";
import { registerConsole } from "../../core/mod-system";
import LibraryConsole from "./console/LibraryConsole";

export const meta = {
  id: "library",
  displayName: "Library",
  dependsOn: ["eln"],
};

export function register() {
  // ── Console: Library browsing surface ──────────────────────────────────
  registerConsole({
    id: "library",
    label: "Library",
    icon: BookOpen,
    route: "/library",
    component: LibraryConsole,
    order: 10, // First in sidebar
    defaults: {
      // Cross-mod references use lazy imports at the registration boundary.
      // The ELN mod owns the detail card and workspace — Library delegates.
      detailCard: lazy(() => import("../eln/console/ElnDetailCard")),
      workspace: lazy(() => import("../eln/workspace/ElnWorkspace")),
    },
    accepts: { only: ["eln.entry"] },
  });
}
