import { get, patch, post, del } from "../../shell/src/api/client";
import type { AccessPolicy, FolderShare, Grant, Organization, Person, Project, Team } from "./types";

export function fetchOrganization(): Promise<Organization> {
  return get<Organization>("/access/organization/");
}

export function updateOrganization(
  data: Partial<Organization>,
): Promise<Organization> {
  return patch<Organization>("/access/organization/", data);
}

export function fetchPeople(): Promise<Person[]> {
  return get<Person[]>("/access/people/");
}

export function fetchPolicies(): Promise<AccessPolicy[]> {
  return get<AccessPolicy[]>("/access/policies/");
}

export function fetchTeams(): Promise<Team[]> {
  return get<Team[]>("/access/teams/");
}

export function fetchTeam(id: number): Promise<Team> {
  return get<Team>(`/access/teams/${id}/`);
}

export function createTeam(
  data: { name: string; icon_key?: string; color_key?: string },
): Promise<Team> {
  return post<Team>("/access/teams/", data);
}

export function updateTeam(
  id: number,
  data: Partial<Pick<Team, "name" | "icon_key" | "color_key">>,
): Promise<Team> {
  return patch<Team>(`/access/teams/${id}/`, data);
}

export function deleteTeam(id: number): Promise<void> {
  return del<void>(`/access/teams/${id}/`);
}

export function addTeamMember(teamId: number, userId: number): Promise<Team> {
  return post<Team>(`/access/teams/${teamId}/add_member/`, { user_id: userId });
}

export function removeTeamMember(teamId: number, userId: number): Promise<Team> {
  return post<Team>(`/access/teams/${teamId}/remove_member/`, { user_id: userId });
}

export function fetchProjects(
  includeArchived?: boolean,
): Promise<Project[]> {
  const params = includeArchived ? "?include_archived=1" : "";
  return get<Project[]>(`/access/projects/${params}`);
}

export function fetchProjectsWithRole(
  includeArchived?: boolean,
): Promise<Project[]> {
  const params = includeArchived ? "?include_archived=1&with_role=1" : "?with_role=1";
  return get<Project[]>(`/access/projects/${params}`);
}

export function fetchProject(id: number): Promise<Project> {
  return get<Project>(`/access/projects/${id}/`);
}

export function createProject(
  data: { name: string; icon_key?: string; color_key?: string },
): Promise<Project> {
  return post<Project>("/access/projects/", data);
}

export function updateProject(
  id: number,
  data: Partial<Pick<Project, "name" | "icon_key" | "color_key" | "is_archived">>,
): Promise<Project> {
  return patch<Project>(`/access/projects/${id}/`, data);
}

export function deleteProject(id: number): Promise<void> {
  return del<void>(`/access/projects/${id}/`);
}

export function fetchGrants(projectId: number): Promise<Grant[]> {
  return get<Grant[]>(`/access/projects/${projectId}/grants/`);
}

export function createGrant(
  projectId: number,
  data: { role: "read" | "edit"; user?: number; team?: number },
): Promise<Grant> {
  return post<Grant>(`/access/projects/${projectId}/grants/`, data);
}

export function deleteGrant(
  projectId: number,
  grantId: number,
): Promise<void> {
  return del<void>(`/access/projects/${projectId}/grants/${grantId}/`);
}

export function fetchOutgoingShares(folderId: number): Promise<FolderShare[]> {
  return get<FolderShare[]>(`/access/folders/${folderId}/shares/`);
}

export function createFolderShare(
  projectId: number,
  data: { source_folder: number; level: string },
): Promise<FolderShare> {
  return post<FolderShare>(`/access/projects/${projectId}/folder_shares/`, data);
}

export function patchFolderShareLevel(
  shareId: number,
  level: string,
): Promise<FolderShare> {
  return patch<FolderShare>(`/access/folder_shares/${shareId}/`, { level });
}

export function deleteFolderShare(shareId: number): Promise<void> {
  return del<void>(`/access/folder_shares/${shareId}/`);
}
