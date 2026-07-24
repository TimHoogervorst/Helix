/**
 * Tabs mod — user-pinned workspace bookmarks rendered in the sidebar.
 *
 * The component listens to URL/workspace navigation changes reactively via
 * useLocation() — no registration API needed. Layout.tsx renders the
 * component directly as a regular sidebar section.
 */
export function register() {
  // No-op: the Tabs component is rendered directly by Layout.tsx.
  // Navigation reactivity is handled internally via useLocation().
}
