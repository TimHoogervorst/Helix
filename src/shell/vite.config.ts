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
 * Packages that Vite pre-bundles internally.  We must let Vite handle
 * resolution for these so the optimized ESM builds are used (otherwise
 * named exports like ``Fragment`` from ``react/jsx-dev-runtime`` are
 * missing, causing white-screen crashes on pages that use JSX fragments).
 */
const VITE_PREBUNDLED = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  // prosemirror packages must be handled by Vite's native pre-bundling,
  // NOT by the modResolutionPlugin.  The plugin resolves to CJS paths
  // while Vite resolves to ESM — two copies break instanceof checks in
  // DecorationGroup.from(), causing the localsInner crash (issue #329).
  "prosemirror-view",
  "prosemirror-state",
  "prosemirror-model",
  "prosemirror-transform",
  "prosemirror-commands",
  "prosemirror-dropcursor",
  "prosemirror-gapcursor",
  "prosemirror-history",
  "prosemirror-inputrules",
  "prosemirror-keymap",
  "prosemirror-changeset",
  "prosemirror-tables",
]);

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
      // Let Vite handle pre-bundled packages so optimized ESM is used.
      if (VITE_PREBUNDLED.has(id)) return null;
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
    // Prevent duplicate React instances when modules are resolved via
    // different paths (e.g. shell vs mod directory resolution).
    dedupe: [
      "react",
      "react-dom",
      "prosemirror-view",
      "prosemirror-state",
      "prosemirror-model",
      "prosemirror-transform",
    ],
    // Force all prosemirror imports to a single path.  Without this,
    // Vite's pre-bundler inlines prosemirror code into each tiptap
    // dependency chunk (@tiptap/pm, @tiptap/suggestion, etc.), creating
    // multiple copies of DecorationSet.  instanceof checks fail across
    // copies, corrupting DecorationGroup.from() members and causing the
    // localsInner crash (issue #329).
    alias: {
      "prosemirror-view": path.resolve(nodeModules, "prosemirror-view"),
      "prosemirror-state": path.resolve(nodeModules, "prosemirror-state"),
      "prosemirror-model": path.resolve(nodeModules, "prosemirror-model"),
      "prosemirror-transform": path.resolve(nodeModules, "prosemirror-transform"),
      "prosemirror-commands": path.resolve(nodeModules, "prosemirror-commands"),
      "prosemirror-dropcursor": path.resolve(nodeModules, "prosemirror-dropcursor"),
      "prosemirror-gapcursor": path.resolve(nodeModules, "prosemirror-gapcursor"),
      "prosemirror-history": path.resolve(nodeModules, "prosemirror-history"),
      "prosemirror-inputrules": path.resolve(nodeModules, "prosemirror-inputrules"),
      "prosemirror-keymap": path.resolve(nodeModules, "prosemirror-keymap"),
      "prosemirror-changeset": path.resolve(nodeModules, "prosemirror-changeset"),
      "prosemirror-tables": path.resolve(nodeModules, "prosemirror-tables"),
      // React 19 bundles useSyncExternalStore natively.  @tiptap/react
      // still imports it from the CJS shim (for React 16-18 compat).
      // Aliasing to local ESM shims avoids Vite's CJS interop failures
      // when node_modules is served from outside the project root via /@fs/.
      "use-sync-external-store/shim/index.js":
        path.resolve(import.meta.dirname, "src/shims/use-sync-external-store-shim.js"),
      "use-sync-external-store/shim":
        path.resolve(import.meta.dirname, "src/shims/use-sync-external-store-shim.js"),
      "use-sync-external-store/shim/with-selector.js":
        path.resolve(import.meta.dirname, "src/shims/use-sync-external-store-with-selector.js"),
    },
  },
  optimizeDeps: {
    // Prevent Vite from pre-bundling prosemirror & tiptap packages.
    // When pre-bundled, esbuild inlines prosemirror code into each tiptap
    // chunk (@tiptap/pm, @tiptap/suggestion, etc.), creating separate
    // copies of DecorationSet.  instanceof checks fail across copies,
    // corrupting DecorationGroup.from() members and causing the
    // localsInner crash (issue #329).
    // Excluding them forces native ESM import chains so all re-exports
    // resolve to a single prosemirror-view module instance.
    exclude: [
      "prosemirror-view",
      "prosemirror-state",
      "prosemirror-model",
      "prosemirror-transform",
      "prosemirror-commands",
      "prosemirror-dropcursor",
      "prosemirror-gapcursor",
      "prosemirror-history",
      "prosemirror-inputrules",
      "prosemirror-keymap",
      "prosemirror-changeset",
      "prosemirror-tables",
      "@tiptap/pm",
      "@tiptap/core",
      "@tiptap/suggestion",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-table",
      "@tiptap/extension-bubble-menu",
      "@tiptap/extension-mention",
    ],
    // Ensure CJS packages imported by excluded tiptap/react are
    // pre-bundled to ESM.  @tiptap/react depends on
    // ``use-sync-external-store/shim`` which is pure CJS
    // (``module.exports = require(...)``).  Without pre-bundling,
    // Vite's runtime CJS interop cannot extract named exports,
    // causing "does not provide an export named useSyncExternalStore".
    include: ["use-sync-external-store"],
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
