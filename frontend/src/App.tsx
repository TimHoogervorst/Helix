import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ElnList from "./pages/ElnList";
import ElnNew from "./pages/ElnNew";
import ElnDetail from "./pages/ElnDetail";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/eln" replace />} />
        <Route path="/eln" element={<ElnList />} />
        <Route path="/eln/new" element={<ElnNew />} />
        <Route path="/eln/:id" element={<ElnDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
