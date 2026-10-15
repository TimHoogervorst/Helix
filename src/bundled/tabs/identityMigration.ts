export class UnknownPersistedIdentity extends Error {}

const WORKSPACES: Record<string, string> = {
  lims: "helix.lims:workspace",
  results: "helix.lims:results-workspace",
};

export interface StoredWorkspaceHistory {
  displayId: string;
  name: string;
  url: string;
  icon: string;
  workspaceReference?: string;
}

/** Migrate local browser history without inferring an unknown URL namespace. */
export function migrateWorkspaceHistoryItem(
  item: StoredWorkspaceHistory,
): StoredWorkspaceHistory {
  const parts = item.url.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (parts[0] === "w" && parts.length === 5) {
    return {
      ...item,
      workspaceReference: `${parts[1]}.${parts[2]}:${parts[3]}`,
    };
  }
  const reference = WORKSPACES[parts[0]];
  if (parts.length !== 2 || !reference) {
    throw new UnknownPersistedIdentity(`Unknown persisted workspace URL: ${item.url}`);
  }
  const [mod, workspace] = reference.split(":");
  const [vendor, name] = mod.split(".");
  const suffix = item.url.slice(item.url.indexOf(parts[1]) + parts[1].length);
  return {
    ...item,
    workspaceReference: reference,
    url: `/w/${vendor}/${name}/${workspace}/${parts[1]}${suffix}`,
  };
}
