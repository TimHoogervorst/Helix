import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ElnDetail from "./pages/ElnDetail";
import LibraryConsole from "./console/instances/library/LibraryConsole";
import { ConsoleProvider } from "./console/core/ConsoleProvider";
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

  // ── Settings shell — composes registered settings sections ───────────
  const settingsSections = registry.getSettingsSections();
  const settingsRoute =
    settingsSections.length > 0 ? (
      <Route
        key="settings"
        path="/settings"
        element={
          <div className="page settings-page">
            {settingsSections.map((s) => {
              const Comp = s.component;
              return <Comp key={s.id} />;
            })}
          </div>
        }
      />
    ) : null;

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
          <Route path="/library" element={<LibraryConsole />} />
          {settingsRoute}
        </Route>
      </Routes>
    </ConsoleProvider>
  );
}

export default LegacyApp;
