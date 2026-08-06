import { ModLoader } from "./mod-system";
import Router from "./shell/Router";
import { CurrentUserProvider } from "./user/CurrentUserProvider";
import { ThemeProvider } from "./preferences";

function App() {
  return (
    <CurrentUserProvider>
      <ModLoader>
        <ThemeProvider>
          <Router />
        </ThemeProvider>
      </ModLoader>
    </CurrentUserProvider>
  );
}

export default App;
