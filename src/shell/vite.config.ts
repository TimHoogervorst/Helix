/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const shellNodeModules = path.resolve(import.meta.dirname, "node_modules");
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
          paths: [shellNodeModules],
        });
        // Only intercept when the resolved package lives inside the
        // shell's own node_modules — otherwise Vite's native ESM
        // resolution already handles it correctly (including the
        // "import" condition in package.json exports).  Returning a
        // CJS path from an ancestor node_modules would break default
        // imports (e.g. @tiptap/extension-placeholder).
        if (!resolved.startsWith(shellNodeModules)) return null;
        return resolved;
      } catch {
        return null;
      }
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), modResolutionPlugin()],
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
      "prosemirror-view": path.resolve(shellNodeModules, "prosemirror-view"),
      "prosemirror-state": path.resolve(shellNodeModules, "prosemirror-state"),
      "prosemirror-model": path.resolve(shellNodeModules, "prosemirror-model"),
      "prosemirror-transform": path.resolve(shellNodeModules, "prosemirror-transform"),
      "prosemirror-commands": path.resolve(shellNodeModules, "prosemirror-commands"),
      "prosemirror-dropcursor": path.resolve(shellNodeModules, "prosemirror-dropcursor"),
      "prosemirror-gapcursor": path.resolve(shellNodeModules, "prosemirror-gapcursor"),
      "prosemirror-history": path.resolve(shellNodeModules, "prosemirror-history"),
      "prosemirror-inputrules": path.resolve(shellNodeModules, "prosemirror-inputrules"),
      "prosemirror-keymap": path.resolve(shellNodeModules, "prosemirror-keymap"),
      "prosemirror-changeset": path.resolve(shellNodeModules, "prosemirror-changeset"),
      "prosemirror-tables": path.resolve(shellNodeModules, "prosemirror-tables"),
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
