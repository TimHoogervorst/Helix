import { ModLoader } from "./core/mod-system";
import Router from "./core/shell/Router";
import { CurrentUserProvider } from "./core/user/CurrentUserProvider";

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
