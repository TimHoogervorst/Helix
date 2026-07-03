/** The three-panel layout view state shared by all console pages. */
export type ViewState = "list" | "detail" | "expanded";

/** Context value exposed by ConsoleProvider for use by Layout and other consumers. */
export interface ConsoleContextValue {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
}
