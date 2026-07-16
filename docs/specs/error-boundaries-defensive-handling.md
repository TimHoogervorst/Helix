## Problem Statement

A developer building the ELN editor misses a `useCallback` import in `ElnEditor.tsx`. The resulting `ReferenceError` does not just break the editor — it unmounts the entire React component tree, leaving the user staring at a white page. The root cause is minor; the blast radius is the entire application. Three systemic gaps make this possible:

1. **No React Error Boundaries** — any uncaught render error anywhere in the tree propagates to root and unmounts everything. The app has no safety net.
2. **No error handling around TipTap `setContent`** — a ProseMirror schema mismatch or malformed JSON document crashes inside a `queueMicrotask`, producing an unhandled rejection that React cannot catch.
3. **No Suspense boundaries** — seven routes across three mods use `lazy()` imports. During chunk download, the user sees nothing — and if a chunk fails to load, the page whitescreens rather than surfacing an error.

## Solution

A single seam at the React component boundary: **defensive error resilience across the render tree**. When any part of the app fails to render, users see a branded fallback with a recovery action instead of a white page. The fix has three parts that work together:

1. A reusable `ErrorBoundary` class component in the Shell wraps the main content outlet and hub routes, catching uncaught render errors and rendering a branded fallback with a "Try again" button.
2. `<Suspense>` boundaries with a branded loading fallback wrap every lazy-loaded route component so chunk downloads show a spinner and chunk-load failures surface as Error Boundary catches.
3. A `try/catch` around `editor.commands.setContent()` in `ElnEditor` prevents ProseMirror content-load failures from crashing through the microtask boundary, instead routing the error to the existing `crud.error` pathway.

## User Stories

1. As a researcher editing an ELN entry, when the editor encounters a content-loading error (corrupt document, schema mismatch), I want to see a clear error message with a way to navigate away, so that I am not stuck on a white page with no information.
2. As a user browsing the library hub, when a rendering error occurs in a library card or filter component, I want the rest of the application (sidebar, navigation) to remain functional, so that I can navigate elsewhere instead of losing my entire session.
3. As a user on a slow or unreliable network, when navigating to a workspace page whose code chunk is still downloading, I want to see a loading indicator, so that I know the app is working rather than broken.
4. As a user viewing the settings hub, when a settings section component throws during render, I want to see a recovery option instead of a white page, so that I can retry or navigate back to the library.
5. As a developer iterating on a mod component, when I introduce a render bug, I want the blast radius confined to that mod's section of the page, so that I can see my error in context rather than losing the entire application state.
6. As a user who just encountered a render crash, when I click "Try again," I want the error boundary to remount the subtree and attempt a fresh render, so that transient errors (network race, stale cache) resolve without a full page reload.
7. As a user viewing the home hub, when a dashboard widget component fails to render, I want the remaining widgets and the sidebar to stay interactive, so that I can still navigate to other parts of the app.
8. As a user navigating between hubs, when a lazy-loaded code chunk fails to download (network error, CDN issue), I want to see an error state with a retry action rather than a white page, so that I can recover without knowing the URL to navigate to manually.
9. As a developer looking at browser DevTools after an error, I want the Error Boundary to log the caught error to the console with the component stack trace preserved, so that I can debug without reproducing the crash.
10. As a researcher whose ELN entry has an unusually shaped ProseMirror document (from an older version or manual edit), when `setContent` fails to parse it, I want the editor to show the error banner with a back-to-library link, so that I can exit the broken entry and report the issue.

## Implementation Decisions

### Error Boundary component

A single `ErrorBoundary` class component lives in the Shell at the shared components layer. It implements `componentDidCatch` to capture the error and `errorInfo` (component stack trace), logs the error to `console.error` for DevTools visibility, and renders a branded fallback card when its children throw.

The fallback UI reuses the visual pattern established by `AppErrorScreen`: a centered card with the Helix brand mark, an error icon (AlertTriangle), the error message, a "Try again" button, and a "Back to library" link. The "Try again" button resets the boundary's error state, causing a remount of the children.

The boundary exposes an optional `fallback` prop so callers can customize the recovery UI (e.g. a workspace page might add a "Go to entry list" link), but defaults to the standard card.

### Placement of Error Boundaries

The Error Boundary wraps two points in the tree:

- **`Layout.tsx`**: the `<Outlet />` inside `<main>`. This catches all render errors from layout-routed pages (library hub, workspace pages, settings hub) while keeping the sidebar, navigation, and user menu interactive.
- **`Router.tsx`**: each hub route `element`. Hubs render inside `<Layout>` and would be caught by the Layout boundary, but wrapping at the route level provides finer-grained recovery — an error in the home hub doesn't require resetting the entire outlet.

### Suspense boundaries for lazy routes

Each route component in `Router.tsx` (hubs, layout routes, public routes) is wrapped in `<Suspense fallback={<LoadingFallback />}>`. The `LoadingFallback` is a lightweight inline spinner — the branded full-page `LoadingScreen` is too heavy for inline route transitions. The Suspense boundary also converts chunk-load failures into render errors that the Error Boundary catches, preventing the white-page gap.

### Defensive `setContent` in ElnEditor

The `queueMicrotask` callback in the content-sync effect wraps the `editor.commands.setContent(body)` call in a `try/catch`. On failure, it sets the `crud.error` state to a user-facing message like `"Failed to load entry content. The document may be in an unexpected format."` and resets `isProgrammaticChange` so the editor doesn't stay locked. The existing error banner and "Back to entries" button handle the rest — no new UI needed.

The catch block also emits a `bus.emit("eln.editor.content-loading", false)` event so downstream subscribers (e.g. `useBlockActionLogging`) don't stay in a suppressed state.

### No changes to ModLoader

The `ModLoader` wraps the entire `Router` and already handles mod-loading failures (missing manifests, registration errors). These failures happen at boot, not during render, so they are outside the scope of React error boundaries. The Error Boundary sits inside `ModLoader`, not around it.

### Component tree after changes

```
App
└── CurrentUserProvider
    └── ModLoader
        └── Router
            └── Routes
                ├── publicRoutes (each wrapped in <Suspense>)
                │   ├── <Suspense><LoginPage /></Suspense>
                │   └── <Suspense><RegisterPage /></Suspense>
                └── <Layout>
                    ├── <aside> (sidebar — outside ErrorBoundary, stays alive)
                    └── <main>
                        <ErrorBoundary>
                            <Outlet />
                            ├── <Suspense><LibraryHub /></Suspense>
                            ├── <Suspense><ElnWorkspacePage /></Suspense>
                            └── <Suspense><SettingsSection /></Suspense>
                        </ErrorBoundary>
                    </main>
```

## Testing Decisions

### What makes a good test

Tests verify external behavior, not implementation details. They assert what the user sees: the fallback UI appears instead of a white page, the "Try again" button remounts children, the sidebar is still present, and the `setContent` failure shows an error banner. Tests should not assert on internal state (e.g. `this.state.hasError`) or component method calls.

### Modules tested

- **Error Boundary component** — unit tests: renders children when no error, renders fallback when children throw, "Try again" resets state, logs to console.error, custom fallback prop works.
- **Router** — integration tests (extend existing Router.test.tsx): lazy routes render inside Suspense, navigation between hubs works.
- **ElnEditor** — integration tests (extend existing ElnEditor.test.tsx): `setContent` failure shows error banner, bus emits `content-loading: false` on failure, back-to-library link is present.

### Prior art for tests

- Router.test.tsx — renders Router in MemoryRouter, asserts on routed components via `data-testid`. The same pattern extends to Error Boundary and Suspense tests.
- ElnEditor.test.tsx — mocks TipTap `useEditor`, asserts on rendered DOM. The `setContent` try/catch tests will mock `stubEditor.commands.setContent` to throw.

### Boundary test technique

To trigger an Error Boundary in tests, render a child component that deliberately throws during render. This is a standard React testing pattern documented in the React docs.

## Out of Scope

- **Server-side rendering errors** — Django 500 pages, API timeouts, and backend crashes are handled by the existing API error flow (`crud.error`, `ApiError` class). This spec only addresses React render-time errors.
- **Global error logging service** — console.error is sufficient for DevTools debugging. A crash-reporting integration (Sentry, Datadog) would be its own PRD.
- **Per-mod error boundaries** — mods get error isolation via the Layout-level boundary. Individual mods wrapping themselves in additional boundaries is a pattern they can adopt independently; the shell does not prescribe it.
- **Retry with different parameters** — the "Try again" button remounts the same component tree. Dynamic error recovery strategies (e.g. "open without images," "skip corrupted block") are out of scope.
- **Error telemetry or analytics** — no metrics, no crash count dashboards, no error aggregation.

## Further Notes

- The `AppErrorScreen` component (used for `/me/` fetch failures) has the right visual pattern but solves a different problem (async data fetch, not render crash). The Error Boundary borrows its layout but is a separate component because the recovery mechanism differs: Error Boundaries remount subtrees; data-fetch errors retry promises.
- The Error Boundary is a class component because React error boundaries require `componentDidCatch` — there is no hook equivalent as of React 18.
- The `setContent` try/catch uses the existing `crud.error` / `crud.setError` pathway rather than introducing a separate error state, keeping the data flow paths minimal.
- Suspense fallbacks inside `Router.tsx` are colocated with the route definitions so the loading state is visible at the same granularity as the error state.
