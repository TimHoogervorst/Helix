/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const nodeModules = path.resolve(repoRoot, "node_modules");
const shellRequire = createRequire(import.meta.url);

/**
 * Rewrite ``use-sync-external-store/shim/*`` imports in @tiptap/react
 * to load local ESM shims.  The upstream CJS files use ``module.exports =
 * require(...)`` which Vite's runtime CJS interop cannot extract named
 * exports from — and ``resolveId`` hooks don't fire reliably for imports
 * inside excluded node_modules packages.  A ``transform`` hook on the
 * @tiptap/react source replaces the specifiers before import analysis runs.
 */
function useSyncExternalStorePlugin() {
  const shimDir = path.resolve(import.meta.dirname, "src/shims");
  const shimIndex = path.resolve(shimDir, "use-sync-external-store-shim.js");
  const shimWithSelector = path.resolve(shimDir, "use-sync-external-store-with-selector.js");
  return {
    name: "transform-use-sync-external-store",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.includes("@tiptap/react")) return null;
      let changed = false;
      // Replace both import specifiers with absolute paths to our shims.
      code = code.replace(
        /"use-sync-external-store\/shim\/index\.js"/g,
        () => { changed = true; return JSON.stringify(shimIndex); },
      );
      code = code.replace(
        /"use-sync-external-store\/shim\/with-selector\.js"/g,
        () => { changed = true; return JSON.stringify(shimWithSelector); },
      );
      if (!changed) return null;
      return { code, map: null };
    },
  };
}

/**
 * Vite plugin that redirects bare-specifier imports from mod files
 * (``src/mods/*``) to the shell's ``node_modules`` as a **last resort**.
 *
 * Vite's built-in dependency resolution searches for ``node_modules``
 * starting from the importer's directory up to the filesystem root, and
 * also falls back to the project root.  For most packages this works
 * correctly and - crucially - returns the **pre-bundled ESM** version.
 *
 * This plugin only fires when Vite's default resolution would fail
 * (packages that are installed in the shell's node_modules but for
 * whatever reason aren't found by the standard upward search).  It runs
 * at ``enforce: "post"`` so Vite's native resolution (including
 * dependency pre-bundling) takes precedence.
 */
function modResolutionPlugin() {
  return {
    name: "mod-resolution-fallback",
    enforce: "post" as const,
    resolveId(id: string, importer: string | undefined) {
      if (!importer) return null;
      const normalized = importer.replace(/\\/g, "/");
      if (!normalized.includes("/mods/")) return null;
      // Only redirect bare specifiers, not relative imports.
      if (id.startsWith(".") || id.startsWith("/") || id.startsWith("\0")) return null;
      try {
        const resolved = shellRequire.resolve(id, {
          paths: [nodeModules],
        });
        // Only intercept when the resolved package lives inside the
        // shell's own node_modules — otherwise Vite's native ESM
        // resolution already handles it correctly (including the
        // "import" condition in package.json exports).  Returning a
        // CJS path from an ancestor node_modules would break default
        // imports (e.g. @tiptap/extension-placeholder).
        if (!resolved.startsWith(nodeModules)) return null;
        return resolved;
      } catch {
        return null;
      }
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), useSyncExternalStorePlugin(), modResolutionPlugin()],
  resolve: {
    // Prevent duplicate instances when modules are resolved via
    // different paths.  React dedupe avoids double React trees;
    // prosemirror dedupe prevents multiple copies of DecorationSet /
    // EditorState / etc. that would break instanceof checks and cause
    // the localsInner crash (issue #329).
    dedupe: [
      "react",
      "react-dom",
      "prosemirror-view",
      "prosemirror-state",
      "prosemirror-model",
      "prosemirror-transform",
    ],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: true,
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)", "../mods/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.*",
        "src/**/__tests__/**",
        "src/test/**",
      ],
    },
  },
});
