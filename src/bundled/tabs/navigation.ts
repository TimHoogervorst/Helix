/** Keep saved workspace paths absolute so navigation is rooted at the app. */
export function normalizeWorkspaceUrl(url: string): string {
  return url.startsWith("/") ? url : `/${url}`;
}
