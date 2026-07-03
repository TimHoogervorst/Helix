import { Component, Suspense, type ComponentType } from "react";
import { useParams, useLocation } from "react-router-dom";
import { ModRegistry } from "../mod-system/ModRegistry";

// ── ErrorBoundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="console-page">
          <p className="error">
            Workspace crashed: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Fallback components ──────────────────────────────────────────────────

function WorkspaceLoader() {
  return (
    <div className="console-page">
      <p className="empty">Loading workspace…</p>
    </div>
  );
}

function WorkspaceError({ message }: { message: string }) {
  return (
    <div className="console-page">
      <p className="error">Failed to load workspace: {message}</p>
    </div>
  );
}

// ── WorkspacePage ────────────────────────────────────────────────────────

/**
 * Thin shell for standalone workspace routes.
 *
 * Reads the route from the URL, resolves the workspace from the registry,
 * and lazy-renders the workspace component. The workspace component
 * receives `displayId` as a prop and fetches its own data.
 *
 * Note: Not yet wired into the route tree. Will be used when Router.tsx
 * dynamically generates routes from the registry in a future issue.
 */
export function WorkspacePage() {
  const { displayId } = useParams<{ displayId: string }>();
  const location = useLocation();
  const registry = ModRegistry.getInstance();

  if (displayId === undefined || displayId === null) {
    return (
      <WorkspaceError message="Missing displayId in route parameters." />
    );
  }

  const workspace = registry.getWorkspaceForRoute(location.pathname);

  if (!workspace) {
    return (
      <WorkspaceError
        message={`No workspace registered for route: ${location.pathname}`}
      />
    );
  }

  if (!workspace.workspace) {
    return (
      <WorkspaceError
        message={`Workspace '${workspace.id}' has no workspace component.`}
      />
    );
  }

  const WorkspaceComponent = workspace.workspace as ComponentType<{
    displayId: string;
  }>;

  return (
    <ErrorBoundary>
      <Suspense fallback={<WorkspaceLoader />}>
        <WorkspaceComponent displayId={displayId} />
      </Suspense>
    </ErrorBoundary>
  );
}
