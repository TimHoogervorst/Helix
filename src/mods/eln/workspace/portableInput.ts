import type { ContractType } from "@helix/mod-api/contracts";

/** Decode editor block storage for discovery without changing the saved document. */
export function decodeBlockContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBlockContent);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const result = Object.fromEntries(Object.entries(object).map(([key, child]) => [key, decodeBlockContent(child)]));
  const attrs = object.attrs as Record<string, unknown> | undefined;
  if (attrs && typeof attrs.content === "string") {
    try {
      const decoded = JSON.parse(attrs.content);
      if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
        result.attrs = decodeBlockContent(decoded);
      }
    } catch { /* Invalid opaque content remains untouched. */ }
  }
  return result;
}

/** Read typed values and the JSON row arrays stored by editor tables. */
export function getTypedPath(root: unknown, path: readonly string[]) {
  let value = root;
  for (const segment of path) {
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  if (Array.isArray(value)) return { type: { type: "json" } as ContractType, value };
  if (!value || typeof value !== "object") return undefined;
  const typed = value as { type?: unknown; value?: unknown };
  return (typeof typed.type === "string" || (typeof typed.type === "object" && typed.type !== null))
    ? { type: typed.type as ContractType, value: typed.value }
    : undefined;
}
