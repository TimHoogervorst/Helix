import { get, post, patch } from "../api/client";
import type { CurrentUser } from "./types";

export function fetchMe(): Promise<CurrentUser> {
  return get<CurrentUser>("/core/me/");
}

export function updateMe(data: Partial<Pick<CurrentUser, "username">>): Promise<CurrentUser> {
  return patch<CurrentUser>("/core/me/", data);
}

export function changePassword(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ detail: string }> {
  return post<{ detail: string }>("/core/me/change-password/", {
    old_password: oldPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
}

export function login(username: string, password: string): Promise<CurrentUser> {
  return post<CurrentUser>("/core/login/", { username, password });
}

export function logout(): Promise<{ detail: string }> {
  return post<{ detail: string }>("/core/logout/", {});
}

export function register(username: string, password: string): Promise<CurrentUser> {
  return post<CurrentUser>("/core/register/", { username, password });
}
