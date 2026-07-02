import { ModLoader } from "./core/mod-system";
import LegacyApp from "./LegacyApp";

function App() {
  return (
    <ModLoader>
      <LegacyApp />
    </ModLoader>
  );
}

export default App;
