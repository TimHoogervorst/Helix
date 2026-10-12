/** Shared Project-root path semantics for Library and entry breadcrumbs. */
export function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function appendPath(path: string, segment: string): string {
  return path ? `${path}/${segment}` : `/${segment}`;
}

export function parentPath(path: string): string {
  const segments = pathSegments(path);
  segments.pop();
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

export function segmentPath(segments: string[], index: number): string {
  return `/${segments.slice(0, index + 1).join("/")}`;
}
