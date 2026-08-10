import { Component } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../primitives/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. When omitted, a default error card is shown. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React Error Boundary that catches render-time errors in its subtree.
 *
 * Displays a fallback UI with the error message and a "Try again" button
 * that resets the boundary and re-renders children. Prevents a single
 * component crash from unmounting the entire React tree (white-page crash).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex min-h-[40vh] items-center justify-center p-6"
          data-testid="error-boundary-fallback"
        >
          <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10">
                <AlertTriangle
                  className="h-5 w-5 text-destructive"
                  aria-hidden="true"
                />
              </div>
            </div>

            <h2 className="mb-2 font-[var(--font-label)] text-md font-semibold tracking-tight text-foreground">
              Something went wrong
            </h2>

            <p className="mb-4 text-base text-muted-foreground">
              An unexpected error occurred while rendering this section.
            </p>

            <details
              className="mb-4 text-left"
              data-testid="error-boundary-details"
            >
              <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground">
                Error details
              </summary>
              <pre className="mt-2 overflow-auto rounded-md bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            </details>

            <Button
              variant="primary"
              className="rounded-md px-4 py-1.5 text-base font-medium"
              onClick={this.handleRetry}
              data-testid="error-boundary-retry"
            >
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
