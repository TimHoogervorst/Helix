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
        return shellRequire.resolve(id, { paths: [shellNodeModules] });
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
    dedupe: ["react", "react-dom"],
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
