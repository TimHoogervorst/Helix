import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  Dna,
  Search,
  House,
  Star,
  Book,
  Database,
  Pin,
  PinOff,
  FileText,
} from "lucide-react";
import { get } from "../api/client";
import { ReferenceProvider } from "../references/ReferenceProvider";
import { usePinnedWorkspaces } from "../../hooks/usePinnedWorkspaces";

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { pins, current, pin, unpin } = usePinnedWorkspaces();

  // Prime the CSRF cookie so unsafe API requests (POST/PUT/DELETE) work
  useEffect(() => {
    get("/core/csrf/").catch(() => {});
  }, []);

  // ── Derived: is the current workspace already pinned? ──────────────────
  const isCurrentPinned = current
    ? pins.some((p) => p.url === current.url)
    : false;

  // ── Icon resolver ──────────────────────────────────────────────────────
  function workspaceIcon(icon: "lims" | "eln") {
    switch (icon) {
      case "lims":
        return <Dna className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case "eln":
        return <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    }
  }

  function handleRowClick(url: string) {
    navigate(url);
  }

  return (
    <ReferenceProvider>
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col border-r border-hairline bg-background">
          {/* Brand */}
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3.5">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Dna className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-[15px] font-semibold tracking-tight">
                Helix
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Alpha
              </span>
            </div>
          </div>

          {/* Search placeholder */}
          <div className="px-3 py-2.5">
            <div
              className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-sm text-muted-foreground"
              title="Search coming soon"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-[13px]">Search entries…</span>
              <span className="ml-auto rounded border border-hairline px-1 font-mono text-[10px]">
                ⌘K
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="nav-sidebar flex flex-col gap-0.5 px-2 pb-2">
            <button
              className="btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]"
              title="Home — coming soon"
              aria-label="Home"
            >
              <House className="h-3.5 w-3.5" aria-hidden="true" /> Home
            </button>
            <button
              className="btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]"
              title="Starred — coming soon"
              aria-label="Starred"
            >
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Starred
            </button>
            <Link
              to="/library"
              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]${currentPath.startsWith("/library") ? " bg-muted font-medium text-foreground" : ""}`}
              title="Library"
              aria-label="Library"
            >
              <Book className="h-3.5 w-3.5" aria-hidden="true" /> Library
            </Link>
            <Link
              to="/lims"
              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]${currentPath.startsWith("/lims") ? " bg-muted font-medium text-foreground" : ""}`}
              title="Database"
              aria-label="Database"
            >
              <Database className="h-3.5 w-3.5" aria-hidden="true" /> Database
            </Link>
          </nav>

          {/* Workspace section header */}
          <div className="mt-1 px-3 pb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Workspace
          </div>

          {/* Workspace tree area */}
          <div className="flex-1 overflow-y-auto px-2 pb-6 text-[13px]">
            {/* Current workspace (temporary, not pinned) */}
            {current && !isCurrentPinned && (
              <div className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left">
                <button
                  className="btn-ghost flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-2 text-left"
                  title={current.displayId}
                  aria-label={`Current workspace: ${current.displayId}`}
                  onClick={() => handleRowClick(current.url)}
                >
                  {workspaceIcon(current.icon)}
                  <span className="truncate">{current.displayId}</span>
                  <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-[18px] text-muted-foreground">
                    Current
                  </span>
                </button>
                <button
                  className="btn-ghost grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
                  title="Pin this workspace"
                  aria-label="Pin current workspace"
                  onClick={(e) => {
                    e.stopPropagation();
                    pin();
                  }}
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Pinned workspaces */}
            {pins.map((p) => {
              const isActive = current?.url === p.url;
              return (
                <div
                  key={p.id}
                  className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left"
                >
                  <button
                    className={`btn-ghost flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-2 text-left${isActive ? " bg-muted font-medium text-foreground" : ""}`}
                    title={`${p.display_id} — ${p.label}`}
                    aria-label={`Open workspace: ${p.display_id}`}
                    onClick={() => handleRowClick(p.url)}
                  >
                    {workspaceIcon(
                      p.url.startsWith("/lims") ? "lims" : "eln",
                    )}
                    {p.label && p.label !== p.display_id ? (
                      <>
                        <span className="truncate">{p.label}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {p.display_id}
                        </span>
                      </>
                    ) : (
                      <span className="truncate">{p.display_id}</span>
                    )}
                    {isActive && (
                      <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-[18px] text-muted-foreground">
                        Current
                      </span>
                    )}
                  </button>
                  <button
                    className="btn-ghost grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
                    title="Unpin this workspace"
                    aria-label={`Unpin workspace: ${p.display_id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      unpin(p.id);
                    }}
                  >
                    <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* User avatar */}
          <div className="flex items-center gap-2 border-t border-hairline px-3 py-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-enzyme text-enzyme-foreground font-mono text-[11px]">
              MK
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium">Dr. Mira Kato</span>
              <span className="text-[10px] text-muted-foreground">
                Molecular Bio · Lab 3B
              </span>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </ReferenceProvider>
  );
}

export default Layout;
