import { registerWorkspace } from "../../core/mod-system";
import ElnDetailCard from "./console/ElnDetailCard";

export const meta = {
  id: "eln",
  displayName: "ELN",
  dependsOn: [] as string[],
};

export function register() {
  // ── Workspace: ELN entry item type ──────────────────────────────────────
  // Registered so the Library console can resolve detail cards and workspaces
  // for ELN entries. The ELN console itself will be registered when the full
  // ELN mod is implemented (#85).
  registerWorkspace({
    id: "eln.entry",
    label: "Entry",
    consoleIds: ["library"],
    route: "/eln/:displayId",
    detailCard: ElnDetailCard,
    // workspace: ElnWorkspace,  // TODO: add when created (#85)
  });

  // ── Standalone route: full ELN editor page ──────────────────────────────
  // TODO: point to ElnWorkspacePage when created (#85)
  // registerRoute({
  //   id: "eln.entry-page",
  //   modId: "eln",
  //   path: "/eln/:displayId",
  //   component: ElnWorkspacePage,
  // });
}
