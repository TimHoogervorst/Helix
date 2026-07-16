import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import { ModRegistry } from "../mod-system/ModRegistry";

/**
 * Registry-driven route generator.
 *
 * Reads the mod registry and generates all routes dynamically:
 *   - Public routes (login, register) render *outside* Layout — no sidebar
 *   - Hub routes from `registry.getHubs()`
 *   - Layout routes from `registry.getLayoutRoutes()`
 *   - App-level redirects: `/` → `/library`, `/eln` → `/library`
 */
function Router() {
  const registry = ModRegistry.getInstance();

  // ── Dynamic hub routes (one per registered hub) ───────────────────────
  const hubRoutes = [...registry.getHubs().values()].map((h) => {
    const Comp = h.component;
    return <Route key={h.id} path={h.route} element={<Comp />} />;
  });

  // ── Dynamic layout routes (rendered inside Layout shell) ─────────────
  const layoutRoutes = registry.getLayoutRoutes().map((r) => {
    const Comp = r.component;
    return <Route key={r.id} path={r.path} element={<Comp />} />;
  });

  // ── Dynamic public routes (rendered outside Layout, no sidebar) ──────
  const publicRoutes = registry.getPublicRoutes().map((r) => {
    const Comp = r.component;
    return <Route key={r.id} path={r.path} element={<Comp />} />;
  });

  return (
    <Routes>
      {/* Public routes — no sidebar, full-page (login, register, etc.) */}
      {publicRoutes}

      {/* Layout-wrapped routes */}
      <Route element={<Layout />}>
        {/* App-level redirects */}
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/eln" element={<Navigate to="/library" replace />} />
        {hubRoutes}
        {layoutRoutes}
      </Route>
    </Routes>
  );
}

export default Router;
