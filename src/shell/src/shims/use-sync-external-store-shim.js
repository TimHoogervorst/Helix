// ESM shim replacing the CJS use-sync-external-store/shim/index.js.
// React 19 exports useSyncExternalStore natively — the CJS compatibility
// shim is unnecessary.  @tiptap/react still imports from it for React
// 16-18 backwards compat; this alias eliminates the CJS→ESM interop
// failure when node_modules is outside Vite's project root.
export { useSyncExternalStore } from "react";
