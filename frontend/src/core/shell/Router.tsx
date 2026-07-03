import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import { ConsoleProvider } from "../console/ConsoleContext";
import { ModRegistry } from "../mod-system/ModRegistry";

/**
 * Registry-driven route generator.
 *
 * Reads the mod registry and generates all routes dynamically:
 *   - Console routes from `registry.getConsoles()`
 *   - Standalone routes from `registry.getRoutes()`
 *   - App-level redirects: `/` → `/library`, `/eln` → `/library`
 *
 * This is the "make the change easy" prefactor — Router exists alongside
 * LegacyApp but is not wired in yet. Once all routes are registered via
 * the mod system, LegacyApp will be deleted and Router will take over.
 */
function Router() {
  const registry = ModRegistry.getInstance();

  // ── Dynamic console routes (one per registered console) ──────────────
  const consoleRoutes = [...registry.getConsoles().values()].map((c) => {
    const Comp = c.component;
    return <Route key={c.id} path={c.route} element={<Comp />} />;
  });

  // ── Dynamic standalone routes (e.g. full-page workspaces) ────────────
  const standaloneRoutes = [...registry.getRoutes().values()].map((r) => {
    const Comp = r.component;
    return <Route key={r.id} path={r.path} element={<Comp />} />;
  });

  return (
    <ConsoleProvider>
      <Routes>
        <Route element={<Layout />}>
          {/* App-level redirects */}
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/eln" element={<Navigate to="/library" replace />} />
          {consoleRoutes}
          {standaloneRoutes}
        </Route>
      </Routes>
    </ConsoleProvider>
  );
}

export default Router;
