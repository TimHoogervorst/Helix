import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ElnNew from "./pages/ElnNew";
import ElnDetail from "./pages/ElnDetail";
import LimsList from "./pages/LimsList";
import EntityWorkspace from "./pages/EntityWorkspace";
import LibraryView from "./pages/LibraryView";
import Settings from "./pages/Settings";
import { BrowserProvider } from "./components/browser/BrowserProvider";

function App() {
  return (
    <BrowserProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/eln" element={<Navigate to="/library" replace />} />
          <Route path="/eln/new" element={<ElnNew />} />
          <Route path="/eln/:id" element={<ElnDetail />} />
          <Route path="/lims" element={<LimsList />} />
          <Route path="/lims/:displayId" element={<EntityWorkspace />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserProvider>
  );
}

export default App;
