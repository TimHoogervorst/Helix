import type { PortableBlockContent } from "@helix/mod-api/portable-blocks";

export function collectPortableBlocks(value: unknown, blocks = new Map<string, PortableBlockContent>()): Map<string, PortableBlockContent> {
  if (Array.isArray(value)) {
    for (const child of value) collectPortableBlocks(child, blocks);
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const attrs = object.attrs && typeof object.attrs === "object" ? object.attrs as Record<string, unknown> : undefined;
    const source = attrs?.source && typeof attrs.source === "object" ? attrs.source as Record<string, unknown> : undefined;
    const sourceAttrs = source?.attrs && typeof source.attrs === "object" ? source.attrs as Record<string, unknown> : undefined;
    const candidateAttrs = sourceAttrs ?? attrs;
    const candidate = candidateAttrs?.portableBlock && typeof candidateAttrs.portableBlock === "object"
      ? candidateAttrs.portableBlock as PortableBlockContent
      : candidateAttrs as PortableBlockContent | undefined;
    if (candidate) {
      const id = typeof candidate.id === "string" ? candidate.id : String(source?.type ?? "");
      const content = candidate.content ?? (Array.isArray(candidateAttrs?.rows)
        ? { type: { type: "json" }, value: candidateAttrs }
        : undefined);
      blocks.set(id, { ...candidate, id, ...(content ? { content } : {}) });
    }
    for (const child of Object.values(object)) collectPortableBlocks(child, blocks);
  }
  return blocks;
}

/** Add presentation baselines only to rows created by this invocation. */
export function registrationBaselines<T>(document: T, createdIds: ReadonlySet<string>): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(object).map(([key, child]) => [key, visit(child)]));
    if (typeof object.content === "string") {
      try { next.content = JSON.stringify(visit(JSON.parse(object.content))); } catch { /* Preserve opaque content. */ }
    }
    if (Array.isArray(object.rows)) {
      next.rows = object.rows.map((row) => {
        if (!createdIds.has(row.recordId ?? row.entityId)) return row;
        const values = { ...row.values, __name: row.__name };
        return { ...row, lastRegisteredSchemaContentHash: object.schemaContentHash,
          lastRegisteredValueHash: JSON.stringify(Object.fromEntries(Object.keys(values).sort().map((key) => [key, values[key]]))) };
      });
    }
    return next;
  };
  return visit(document) as T;
}
