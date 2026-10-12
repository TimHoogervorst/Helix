import { get, post, patch, put, del } from "../../shell/src/api/client";
import type { PinnedWorkspace, TabFolder, TabLayout, TabLayoutResponse } from "./types";
import type { ResolvedMention } from "../../shell/src/mentions/types";

/** Fetch all pinned workspaces for the current user. */
export function getTabs(): Promise<PinnedWorkspace[]> {
  return get<PinnedWorkspace[]>("/core/tabs/");
}

/** Create a new pinned workspace. */
export function createTab(data: {
  display_id: string;
  label: string;
  url: string;
}): Promise<PinnedWorkspace> {
  return post<PinnedWorkspace>("/core/tabs/", data);
}

/** Delete a pinned workspace by ID. */
export function deleteTab(id: number): Promise<void> {
  return del(`/core/tabs/${id}/`);
}

/** Fetch the current user's tab folders for complete layout saves. */
export function getTabFolders(): Promise<TabFolder[]> {
  return get<TabFolder[]>("/core/tabs/folders/");
}

export function createTabFolder(name: string): Promise<TabFolder> {
  return post<TabFolder>("/core/tabs/folders/", { name });
}

export function updateTabFolder(id: number, data: Partial<Pick<TabFolder, "name" | "expanded">>): Promise<TabFolder> {
  return patch<TabFolder>(`/core/tabs/folders/${id}/`, data);
}

export function deleteTabFolder(id: number): Promise<void> {
  return del(`/core/tabs/folders/${id}/`);
}

/** Update only a tab's frontend-supplied snapshot label. */
export function updateTabLabel(id: number, label: string): Promise<PinnedWorkspace> {
  return patch<PinnedWorkspace>(`/core/tabs/${id}/label/`, { label });
}

/** Persist the complete tab layout after a reorder. */
export function putTabLayout(layout: TabLayout): Promise<TabLayoutResponse> {
  return put<TabLayoutResponse>("/core/tabs/layout/", layout);
}

/** Resolve a workspace display ID for a fresh visit-time label snapshot. */
export async function resolveWorkspace(
  displayId: string,
): Promise<ResolvedMention | null> {
  const result = await post<Record<string, ResolvedMention | null>>(
    "/mentions/resolve/",
    { ids: [displayId] },
  );
  return result[displayId] ?? null;
}
