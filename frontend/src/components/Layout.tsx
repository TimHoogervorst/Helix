import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  Dna,
  Search,
  House,
  Star,
  Book,
  Database,
  ChevronRight,
} from "lucide-react";
import { get } from "../api/client";
import { ReferenceProvider } from "./ReferenceProvider";

function Layout() {
  const location = useLocation();
  const currentPath = location.pathname;

  // Prime the CSRF cookie so unsafe API requests (POST/PUT/DELETE) work
  useEffect(() => {
    get("/core/csrf/").catch(() => {});
  }, []);

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
              className="btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-[13px]"
              title="Home — coming soon"
              aria-label="Home"
            >
              <House className="h-3.5 w-3.5" aria-hidden="true" /> Home
            </button>
            <button
              className="btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-[13px]"
              title="Starred — coming soon"
              aria-label="Starred"
            >
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Starred
            </button>
            <Link
              to="/library"
              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-[13px]${currentPath.startsWith("/library") ? " bg-muted font-medium text-foreground" : ""}`}
              title="Library"
              aria-label="Library"
            >
              <Book className="h-3.5 w-3.5" aria-hidden="true" /> Library
            </Link>
            <Link
              to="/lims"
              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-[13px]${currentPath.startsWith("/lims") ? " bg-muted font-medium text-foreground" : ""}`}
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
            <button
              className="btn-ghost flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left"
              style={{ paddingLeft: "8px" }}
              title="Workspace tree — coming soon"
              aria-label="Workspace"
            >
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform rotate-90" aria-hidden="true" />
              <span className="truncate">Projects</span>
            </button>
            <div className="text-muted-foreground" style={{ paddingLeft: "20px" }}>
              <div className="flex items-center gap-1.5 rounded-md py-1 pr-2 text-left">
                <ChevronRight className="h-3 w-3 shrink-0 transition-transform opacity-0 rotate-90" aria-hidden="true" />
                <span className="truncate">CRISPR-Cas9 Optimization</span>
              </div>
            </div>
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
