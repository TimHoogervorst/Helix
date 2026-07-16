import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import Layout from "./Layout";
import { ModRegistry } from "../mod-system/ModRegistry";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";

/** Shared loading fallback for lazy-loaded route components. */
function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      data-testid="route-loading-fallback"
    >
      <p className="text-[13px] text-muted-foreground">Loading…</p>
    </div>
  );
}

/**
 * Wraps a route component in ErrorBoundary + Suspense so that:
 *   1. Render crashes don't unmount the full component tree (white-page crash)
 *   2. Lazy-loaded components show a loading fallback during code-split fetch
 */
function wrapRoute(Comp: React.ComponentType<any>) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Comp />
      </Suspense>
    </ErrorBoundary>
  );
}

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
    return (
      <Route
        key={h.id}
        path={h.route}
        element={wrapRoute(h.component)}
      />
    );
  });

  // ── Dynamic layout routes (rendered inside Layout shell) ─────────────
  const layoutRoutes = registry.getLayoutRoutes().map((r) => {
    return (
      <Route
        key={r.id}
        path={r.path}
        element={wrapRoute(r.component)}
      />
    );
  });

  // ── Dynamic public routes (rendered outside Layout, no sidebar) ──────
  const publicRoutes = registry.getPublicRoutes().map((r) => {
    return (
      <Route
        key={r.id}
        path={r.path}
        element={wrapRoute(r.component)}
      />
    );
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
