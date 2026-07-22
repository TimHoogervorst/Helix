import { get, post, patch, del } from "../../shell/src/api/client";
import type {
  Affiliation,
  CurrentUser,
  CoreSetting,
  Publication,
  Recognition,
} from "./types";

// ── User management (admin) ──────────────────────────────────────────────

export function listUsers(): Promise<CurrentUser[]> {
  return get<CurrentUser[]>("/core/users/");
}

export function createUser(
  username: string,
  password: string,
): Promise<CurrentUser> {
  return post<CurrentUser>("/core/users/", { username, password });
}

export function deactivateUser(id: number): Promise<CurrentUser> {
  return patch<CurrentUser>(`/core/users/${id}/`, { is_active: false });
}

export function deleteUser(id: number): Promise<void> {
  return del<void>(`/core/users/${id}/`);
}

// ── CoreSetting ──────────────────────────────────────────────────────────

export function fetchCoreSetting(key: string): Promise<CoreSetting> {
  return get<CoreSetting>(`/core/settings/${key}/`);
}

export function updateCoreSetting(
  key: string,
  value: unknown,
): Promise<CoreSetting> {
  return patch<CoreSetting>(`/core/settings/${key}/`, { value });
}

// ── Profile list CRUD ─────────────────────────────────────────────────────

// ── Affiliations ──────────────────────────────────────────────────────────

export function createAffiliation(
  data: Omit<Affiliation, "id">,
): Promise<Affiliation> {
  return post<Affiliation>("/core/me/affiliations/", data);
}

export function updateAffiliation(
  id: number,
  data: Partial<Omit<Affiliation, "id">>,
): Promise<Affiliation> {
  return patch<Affiliation>(`/core/me/affiliations/${id}/`, data);
}

export function deleteAffiliation(id: number): Promise<void> {
  return del<void>(`/core/me/affiliations/${id}/`);
}

// ── Publications ──────────────────────────────────────────────────────────

export function createPublication(
  data: Omit<Publication, "id">,
): Promise<Publication> {
  return post<Publication>("/core/me/publications/", data);
}

export function updatePublication(
  id: number,
  data: Partial<Omit<Publication, "id">>,
): Promise<Publication> {
  return patch<Publication>(`/core/me/publications/${id}/`, data);
}

export function deletePublication(id: number): Promise<void> {
  return del<void>(`/core/me/publications/${id}/`);
}

// ── Recognitions ──────────────────────────────────────────────────────────

export function createRecognition(
  data: Omit<Recognition, "id">,
): Promise<Recognition> {
  return post<Recognition>("/core/me/recognitions/", data);
}

export function updateRecognition(
  id: number,
  data: Partial<Omit<Recognition, "id">>,
): Promise<Recognition> {
  return patch<Recognition>(`/core/me/recognitions/${id}/`, data);
}

export function deleteRecognition(id: number): Promise<void> {
  return del<void>(`/core/me/recognitions/${id}/`);
}
