import { BookOpen } from "lucide-react";
import { registerHub } from "../../shell/src/mod-system";
import LibraryHub from "./hub/LibraryHub";
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
