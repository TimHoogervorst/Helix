import { BookOpen } from "lucide-react";
import { registerConsole } from "../../core/mod-system";
import LibraryConsole from "./console/LibraryConsole";
import ElnDetailCard from "../eln/console/ElnDetailCard";

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
      // ELN mod owns the detail card — Library delegates rendering
      detailCard: ElnDetailCard,
      // TODO: add ELN mod's ElnWorkspace when the full ELN mod is created (#85)
    },
    accepts: { only: ["eln.entry"] },
  });
}
