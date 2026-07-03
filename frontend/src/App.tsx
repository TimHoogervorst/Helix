import { ModLoader } from "./core/mod-system";
import Router from "./core/shell/Router";

function App() {
  return (
    <ModLoader>
      <Router />
    </ModLoader>
  );
}

export default App;
