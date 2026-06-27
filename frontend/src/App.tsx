import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ElnNew from "./pages/ElnNew";
import ElnDetail from "./pages/ElnDetail";
import LimsConsole from "./console/instances/lims/LimsConsole";
import EntityWorkspace from "./pages/EntityWorkspace";
import LibraryConsole from "./console/instances/library/LibraryConsole";
import Settings from "./pages/settings/SettingsPage";
import { ConsoleProvider } from "./console/core/ConsoleProvider";

function App() {
  return (
    <ConsoleProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/eln" element={<Navigate to="/library" replace />} />
          <Route path="/eln/new" element={<ElnNew />} />
          <Route path="/eln/:id" element={<ElnDetail />} />
          <Route path="/lims" element={<LimsConsole />} />
          <Route path="/lims/:displayId" element={<EntityWorkspace />} />
          <Route path="/library" element={<LibraryConsole />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </ConsoleProvider>
  );
}

export default App;
