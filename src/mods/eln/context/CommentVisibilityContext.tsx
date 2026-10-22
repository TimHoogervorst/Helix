/**
 * React context for the global comment visibility toggle in the ELN workspace.
 *
 * ``ElnWorkspace`` provides this context so that ``CommentNodeView`` instances
 * (rendered by TipTap's ReactNodeViewRenderer, not by React directly) can
 * read the global toggle state and render accordingly:
 *
 * - ``showComments === true``  → active comments render as full cards
 * - ``showComments === false`` → active comments collapse to a ghost icon
 * - Resolved comments are always checkmark icons, unaffected by the toggle
 */
import { createContext, useContext } from "react";

export interface CommentVisibilityState {
  showComments: boolean;
}

const CommentVisibilityContext = createContext<CommentVisibilityState>({
  showComments: true,
});

export function CommentVisibilityProvider({
  showComments,
  children,
}: {
  showComments: boolean;
  children: React.ReactNode;
}) {
  return (
    <CommentVisibilityContext.Provider value={{ showComments }}>
      {children}
    </CommentVisibilityContext.Provider>
  );
}

/**
 * Read the global comment visibility toggle state.
 *
 * Returns ``{ showComments: boolean }``.  Defaults to ``true`` when no
 * provider is present (standalone editor renders, tests, etc.).
 */
export function useCommentVisibility(): CommentVisibilityState {
  return useContext(CommentVisibilityContext);
}
