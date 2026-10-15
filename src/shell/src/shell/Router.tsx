import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { Suspense } from "react";
import Layout from "./Layout";
import { ModRegistry } from "../mod-system/ModRegistry";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";
import NotFound from "../shared/components/NotFound";
import type { WorkspaceReference } from "../mod-system/references";
import { legacyWorkspaceUrl } from "../mod-system/references";
import Unavailable from "../shared/components/Unavailable";

/** Shared loading fallback for lazy-loaded route components. */
function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      data-testid="route-loading-fallback"
    >
      <p className="text-base text-muted-foreground">Loading…</p>
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

function LegacyWorkspaceRedirect({ workspace }: { workspace: WorkspaceReference }) {
  const { displayId = "" } = useParams<{ displayId: string }>();
  const location = useLocation();
  const query = `${location.search}${location.hash}`;
  return <Navigate to={`${workspace.urlFor(displayId)}${query}`} replace />;
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

  const legacyWorkspaceRoutes = [...registry.getWorkspaces().values()].map((workspace) => (
    <Route
      key={`legacy-${workspace.reference.id}`}
      path={legacyWorkspaceUrl(workspace.reference, ":displayId")}
      element={<LegacyWorkspaceRedirect workspace={workspace.reference} />}
    />
  ));

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
        {legacyWorkspaceRoutes}
      </Route>
      <Route path="*" element={<RouteFallback />} />
    </Routes>
  );
}

/** A route may be left behind in a bookmark after its mod is removed. */
function RouteFallback() {
  const location = useLocation();
  // Keep genuinely unknown URLs as the established not-found state while
  // making the degradation message useful for route-shaped persisted links.
  // A mod-owned bookmark has a namespace, resource, and usually an ID. Keep
  // short unknown URLs on the normal not-found surface.
  if (location.pathname.split("/").filter(Boolean).length >= 3) {
    return <Unavailable kind="Route" name={location.pathname} />;
  }
  return <NotFound />;
}

export default Router;
