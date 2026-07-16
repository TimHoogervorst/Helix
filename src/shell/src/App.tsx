import { ModLoader } from "./mod-system";
import Router from "./shell/Router";
import { CurrentUserProvider } from "./user/CurrentUserProvider";

function App() {
  return (
    <CurrentUserProvider>
      <ModLoader>
        <Router />
      </ModLoader>
    </CurrentUserProvider>
  );
}

export default App;
