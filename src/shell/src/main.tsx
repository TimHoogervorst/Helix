import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import {
  ModuleRegistry,
  AllCommunityModule,
  provideGlobalGridOptions,
} from "ag-grid-community";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import "./styles.css";

// AG Grid v36: modules must be explicitly registered when not using AgGridProvider
ModuleRegistry.registerModules([AllCommunityModule]);

// Use legacy CSS theming so ag-theme-alpine continues to work
// (v36 defaults to the new Theming API / themeQuartz).
provideGlobalGridOptions({ theme: "legacy" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
