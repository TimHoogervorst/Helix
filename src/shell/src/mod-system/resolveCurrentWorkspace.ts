/**
 * Resolve the current workspace from a URL pathname.
 *
 * Uses ModRegistry.getWorkspaces() to match the pathname against registered
 * workspace URL namespaces. The convention is `/{workspaceId}/{displayId}`.
 *
 * Lifted from mods/tabs/ so both tabs and mentions can share it.
 */
import { ModRegistry } from "./ModRegistry";
import type { CurrentWorkspace } from "./types";

/**
 * Extract a workspace ID from a URL path, if the first segment matches
 * a registered workspace. Returns null when no workspace matches.
 *
 * Works for both full paths (`/lims/BLOOD1`) and bare workspace paths
 * (`/lims`), so it serves both `resolveCurrentWorkspace` and sidebar
 * icon derivation from tab URLs.
 */
export function extractWorkspaceId(url: string): string | null {
  const workspaces = ModRegistry.getInstance().getWorkspaces();
  for (const [workspaceId] of workspaces) {
    if (url.startsWith(`/${workspaceId}/`) || url === `/${workspaceId}`) {
      return workspaceId;
    }
  }
  return null;
}

export function resolveCurrentWorkspace(
  pathname: string,
): CurrentWorkspace | null {
  const workspaceId = extractWorkspaceId(pathname);
  if (!workspaceId) return null;

  // Extract the displayId from the second path segment.
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  return {
    displayId: parts[1],
    url: pathname,
    icon: workspaceId,
  };
}
