# Mod Template

> This template documents how to create a new mod. For the full architecture, see [docs/mod-system.md](../../../docs/mod-system.md).

## Quick Start

1. Create the mod directory: `frontend/src/core-mods/<name>/`
2. Copy the directory structure below
3. Implement `index.ts` with `register*()` calls
4. Add `meta` export with `id`, `displayName`, `dependsOn`
5. Implement components, hooks, api, types
6. Add tests in `__tests__/`
7. That's it — the ModLoader globs `core-mods/*/index.ts`, discovers the mod automatically, and wires it into the app

## Directory Structure

```
core-mods/<name>/
├── index.ts              # REQUIRED — All register*() calls + meta export
├── types.ts              # REQUIRED — Mod's TypeScript interfaces
├── api.ts                # Optional — Backend API calls
│
├── console/              # If the mod has a console
│   ├── <Name>Console.tsx
│   ├── <Name>Table.tsx
│   └── <Name>DetailCard.tsx
│
├── workspace/            # If the mod has a workspace
│   ├── <Name>Workspace.tsx
│   └── <Name>WorkspacePage.tsx
│
├── settings/             # If the mod contributes settings
│   └── <Name>Settings.tsx
│
├── editor/               # If the mod owns an editor
│   ├── <Name>Editor.tsx
│   └── extensions/
│
├── components/           # Mod-specific shared components
├── hooks/                # Mod-specific hooks
└── __tests__/            # REQUIRED — Tests
```

## Example: `index.ts`

```ts
// core-mods/<name>/index.ts
import {
  registerConsole,
  registerWorkspace,
  registerSettingsSection,
  registerSlashCommand,
  registerRoute,
  registerSidebarAction,
  registerService,
} from '@/core/mod-system';

// Metadata — read by ModLoader for dependency resolution
export const meta = {
  id: '<name>',
  displayName: '<Display Name>',
  dependsOn: ['lims'],              // List mod IDs that must load first
};

// ── Console ──────────────────────────────────────
registerConsole({
  id: '<name>',
  label: '<Sidebar Label>',
  icon: Beaker,                     // Lucide icon
  route: '/<route>',
  component: () => import('./console/<Name>Console'),
  order: 30,
  defaults: {
    row: () => import('./console/<Name>Table').then(m => m.<Name>Row),
    detailCard: () => import('./console/<Name>DetailCard').then(m => m.<Name>DetailCard),
    workspace: () => import('./workspace/<Name>Workspace').then(m => m.<Name>Workspace),
  },
  accepts: {
    only: ['<name>.<itemtype>'],    // Whitelist — only these workspace IDs
  },
});

// ── Workspace ────────────────────────────────────
registerWorkspace({
  id: '<name>.<itemtype>',
  consoleIds: ['<name>'],
  label: '<Item Type Label>',
  icon: Flask,
  route: '/<route>/:displayId',
  // row, detailCard, workspace are optional —
  // falls back to console defaults if omitted
  workspace: () => import('./workspace/<Name>Workspace').then(m => m.<Name>Workspace),
});

// ── Settings Section ─────────────────────────────
registerSettingsSection({
  id: '<name>.settings',
  modId: '<name>',
  label: '<Settings Label>',
  icon: Settings,
  component: () => import('./settings/<Name>Settings'),
  order: 10,
});

// ── Service (for other mods to call) ──────────────
registerService({
  id: '<name>.doThing',
  handler: async (...args) => {
    // ... 
  },
});
```

## Component Contracts

### Console Component
```tsx
interface ConsoleProps {
  // The console page manages its own data fetching, state, and wiring
  // It composes ConsolePage from core/console/ with table, detail, and workspace slots
}
```

### DetailCard Component
```tsx
interface DetailCardProps {
  item: ItemType;              // The selected item data
  viewState: 'detail' | 'expanded';
  onClose: () => void;         // Return to List state
  onCollapse: () => void;      // Collapse from Expanded to Detail
  isDetailExiting: boolean;    // Exit animation in progress
}
```

### Workspace Component
```tsx
interface WorkspaceProps {
  item: ItemType;              // The selected item data
  isExiting: boolean;          // Exit animation in progress
}
```

### Standalone Workspace Page Component
```tsx
// The workspace page component receives displayId from the URL
// and fetches its own data — WorkspacePage provides Suspense + ErrorBoundary
interface WorkspacePageProps {
  displayId: string;           // From URL params
}
```

## Dependencies

- **Depends on:** `core/mod-system` (registration functions, ModRegistry)
- **Depends on:** `core/console` (panel shell components, if registering a console)
- **May depend on:** Other core mods (declare in `meta.dependsOn`)
- **Shared utilities:** `shared/` for cross-mod components

## Key Rules

1. **No direct imports from other mods.** Use `registry.call()` for mod-to-mod communication.
2. **Every mod must have `__tests__/`.**
3. **Workspace IDs are globally unique** — prefix with mod ID (`<modId>.<itemtype>`).
4. **`meta.dependsOn` must be correct** — the topological sort depends on it. Circular deps halt boot.
5. **The workspace component fetches its own data.** WorkspacePage passes `displayId` — the workspace owns loading/error/data states.
6. **Consoles use `accepts` to control which workspaces appear.** Workspaces declare `consoleIds` as intent; the console has final say.
