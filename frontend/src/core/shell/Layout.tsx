import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Dna, Search, House, Star } from "lucide-react";
import { get } from "../api/client";
import { ReferenceProvider } from "../references/ReferenceProvider";
import { ModRegistry } from "../mod-system/ModRegistry";
import { UserMenu } from "../user/UserMenu";

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
            {[...ModRegistry.getInstance().getConsoles().values()]
              .sort((a, b) => a.order - b.order)
              .map((c) => {
                const Icon = c.icon;
                return (
                  <Link
                    key={c.id}
                    to={c.route}
                    className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]${currentPath.startsWith(c.route) ? " bg-muted font-medium text-foreground" : ""}`}
                    title={c.label}
                    aria-label={c.label}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {c.label}
                  </Link>
                );
              })}
          </nav>

          {/* Sidebar actions (registered by mods, e.g. pinned workspaces) */}
          {[...ModRegistry.getInstance().getSidebarActions().values()]
            .filter((a) => a.position === "inline")
            .map((a) => {
              const Comp = a.component;
              return <Comp key={a.id} />;
            })}

          {/* User section — live avatar + UserMenu popover */}
          <UserMenu />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </ReferenceProvider>
  );
}

export default Layout;
