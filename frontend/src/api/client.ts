// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/api/client.ts.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { get, post, put, patch, del, ApiError } from "../core/api/client";
