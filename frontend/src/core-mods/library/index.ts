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
    defaults: {},
    accepts: { only: ["eln.entry"] },
  });
}
