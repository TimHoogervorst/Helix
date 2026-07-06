import { get, post, patch } from "../../core/api/client";
import type { CurrentUser, CoreSetting } from "./types";

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
