// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/references/ReferenceProvider.tsx.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { ReferenceProvider, useReferenceContext } from "../core/references/ReferenceProvider";
