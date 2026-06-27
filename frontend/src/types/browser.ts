/** The three-panel layout view state shared by all browser pages. */
export type ViewState = "list" | "detail" | "expanded";

/** Context value exposed by BrowserProvider for use by Layout and other consumers. */
export interface BrowserContextValue {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
}
