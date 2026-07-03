import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./core/shell/Layout";
import ElnDetail from "./pages/ElnDetail";
import { ConsoleProvider } from "./core/console/ConsoleContext";
import { ModRegistry } from "./core/mod-system/ModRegistry";

function LegacyApp() {
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
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/eln" element={<Navigate to="/library" replace />} />
          <Route path="/eln/new" element={<ElnDetail />} />
          <Route path="/eln/:id" element={<ElnDetail />} />
          {consoleRoutes}
          {standaloneRoutes}
        </Route>
      </Routes>
    </ConsoleProvider>
  );
}

export default LegacyApp;
