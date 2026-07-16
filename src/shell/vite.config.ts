/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const shellNodeModules = path.resolve(import.meta.dirname, "node_modules");
const shellRequire = createRequire(import.meta.url);

/**
 * Vite plugin that redirects bare-specifier imports from mod files
 * (``src/mods/*``) to the shell's ``node_modules``.  Without this,
 * mod files cannot resolve npm packages because Node module resolution
 * walks up from the mod directory and never reaches the shell.
 */
function modResolutionPlugin() {
  return {
    name: "mod-resolution",
    enforce: "pre" as const,
    resolveId(id: string, importer: string | undefined) {
      if (!importer) return null;
      const normalized = importer.replace(/\\/g, "/");
      if (!normalized.includes("/mods/")) return null;
      // Only redirect bare specifiers, not relative imports.
      if (id.startsWith(".") || id.startsWith("/") || id.startsWith("\0")) return null;
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
