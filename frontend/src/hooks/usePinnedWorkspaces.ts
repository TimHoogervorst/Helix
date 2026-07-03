// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to
// core-mods/pins/hooks/usePinnedWorkspaces.ts.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export {
  usePinnedWorkspaces,
  type UsePinnedWorkspacesReturn,
} from "../core-mods/pins/hooks/usePinnedWorkspaces";
