import { BookOpen } from "lucide-react";
import { registerHub } from "../../core/mod-system";
import LibraryHub from "./hub/LibraryHub";

export const meta = {
  id: "library",
  displayName: "Library",
  dependsOn: ["tags", "eln"],
};

export function register() {
  // ── Hub: Library browsing surface ─────────────────────────────────────
  registerHub({
    id: "library",
    label: "Library",
    icon: BookOpen,
    route: "/library",
    component: LibraryHub,
    order: 10,
  });
}
