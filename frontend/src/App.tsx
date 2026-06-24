import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ElnList from "./pages/ElnList";
import ElnNew from "./pages/ElnNew";
import ElnDetail from "./pages/ElnDetail";
import LimsList from "./pages/LimsList";
import Settings from "./pages/Settings";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/eln" replace />} />
        <Route path="/eln" element={<ElnList />} />
        <Route path="/eln/new" element={<ElnNew />} />
        <Route path="/eln/:id" element={<ElnDetail />} />
        <Route path="/lims" element={<LimsList />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
