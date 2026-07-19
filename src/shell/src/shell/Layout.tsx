import { Outlet, Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ArrowLeft, ChevronLeft, Dna } from "lucide-react";
import { get } from "../api/client";
import { MentionProvider } from "../mentions/MentionProvider";
import { ModRegistry } from "../mod-system/ModRegistry";
import { UserMenu } from "../user/UserMenu";
import { SidebarProvider, useSidebar } from "../workspace/SidebarContext";
import { CollapsibleSidebar } from "../shared/components/Sidebar/CollapsibleSidebar";
import { SidebarSection } from "../shared/components/Sidebar/SidebarSection";
import type { IconStripGroup } from "../shared/components/Sidebar/IconStrip";

/**
 * Brand header with logo, "Helix Alpha" text, and a collapse toggle.
 * Rendered inside the left sidebar's expanded content — uses
 * `useSidebar()` to access collapse state and toggle.
 */
function BrandHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="flex items-center gap-2 border-b border-hairline px-4 py-3.5">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Dna className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col leading-tight">
        <span className="font-serif text-[15px] font-semibold tracking-tight">
          Helix
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Alpha
        </span>
      </div>
      <button
        className="btn-icon sidebar-toggle"
        onClick={toggleSidebar}
        title="Collapse sidebar"
        aria-label="Collapse sidebar"
      >
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}

/**
 * Renders the UserMenu, adapting to the sidebar collapse state.
 * When collapsed, shows only the avatar (compact mode) so the user
 * can still access the popover menu from the icon strip.
 */
function SidebarUserFooter() {
  const { isCollapsed } = useSidebar();
  return <UserMenu compact={isCollapsed} />;
}

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [searchParams] = useSearchParams();

  const isSettings = currentPath.startsWith("/settings");

  // Prime the CSRF cookie so unsafe API requests (POST/PUT/DELETE) work
  useEffect(() => {
    get("/core/csrf/").catch(() => {});
  }, []);

  const settingsSections = ModRegistry.getInstance().getSettingsSections();
  const activeSectionId =
    searchParams.get("section") ?? settingsSections[0]?.id ?? null;

  // ── Derived data shared between icon strip and nav rendering ──────────
  const sortedHubs = useMemo(
    () =>
      [...ModRegistry.getInstance().getHubs().values()].sort(
        (a, b) => a.order - b.order,
      ),
    [],
  );

  const inlineSidebarActions = useMemo(
    () =>
      [...ModRegistry.getInstance().getSidebarActions().values()].filter(
        (a) => a.position === "inline",
      ),
    [],
  );

  // ── Icon-strip groups for collapsed state ──────────────────────────────
  const iconStripGroups = useMemo((): IconStripGroup[] => {
    const groups: IconStripGroup[] = [];

    // Group 1: Helix brand logo (decorative — no onClick)
    groups.push({
      icons: [
        {
          icon: <Dna className="h-4 w-4" aria-hidden="true" />,
          label: "Helix",
        },
      ],
    });

    if (isSettings) {
      // Group 2: Settings navigation — Back to Home + settings sections
      const settingsIcons: IconStripGroup["icons"] = [
        {
          icon: <ArrowLeft className="h-4 w-4" aria-hidden="true" />,
          label: "Back to Home",
          onClick: () => navigate("/library"),
        },
      ];

      for (const s of settingsSections) {
        const Icon = s.icon;
        settingsIcons.push({
          icon: Icon ? (
            <Icon className="h-4 w-4" aria-hidden="true" />
          ) : null,
          label: s.label,
          onClick: () => navigate(`/settings?section=${s.id}`),
        });
      }

      groups.push({ icons: settingsIcons });
    } else if (sortedHubs.length > 0) {
      // Group 2: Hub icons from the registry
      groups.push({
        icons: sortedHubs.map((h) => ({
          icon: <h.icon className="h-4 w-4" aria-hidden="true" />,
          label: h.label,
          onClick: () => navigate(h.route),
        })),
      });
    }

    return groups;
  }, [isSettings, navigate, settingsSections, sortedHubs]);

  // ── Collapsed content: inline sidebar actions rendered as icon buttons ──
  const collapsedContent = useMemo(() => {
    if (isSettings) return null;
    if (inlineSidebarActions.length === 0) return null;
    return inlineSidebarActions.map((a) => {
      const Comp = a.component;
      return <Comp key={a.id} />;
    });
  }, [isSettings, inlineSidebarActions]);

  return (
    <MentionProvider>
      <div className="flex h-screen overflow-hidden">
        <SidebarProvider>
          <CollapsibleSidebar
            side="left"
            variant="icon-strip"
            iconStripGroups={iconStripGroups}
            hideToggle
            footer={<SidebarUserFooter />}
            collapsedContent={collapsedContent}
          >
            {/* Brand — visible only when expanded (logo renders in IconStrip when collapsed) */}
            <div className="flex flex-1 w-64 flex-col bg-background">
              <BrandHeader />


              {/* Navigation + sidebar actions — fills remaining space to push UserMenu to bottom */}
              <div className="flex flex-1 flex-col overflow-y-auto">
                {isSettings ? (
                  /* ── Settings layout: Navigation + Settings as sibling sections ── */
                  <>
                    <SidebarSection id="navigation" label="Navigation">
                      <nav className="nav-sidebar flex flex-col gap-0.5 px-2 pb-2">
                        <Link
                          to="/library"
                          className="btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px] text-muted-foreground"
                          aria-label="Back to Home"
                        >
                          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Back to Home
                        </Link>
                      </nav>
                    </SidebarSection>

                    <SidebarSection id="settings" label="Settings">
                      <nav className="nav-sidebar flex flex-col gap-0.5 px-2 pb-2">
                        {settingsSections.map((s) => {
                          const Icon = s.icon;
                          const isActive = s.id === activeSectionId;
                          return (
                            <Link
                              key={s.id}
                              to={`/settings?section=${s.id}`}
                              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]${isActive ? " bg-muted font-medium text-foreground" : ""}`}
                              title={s.label}
                              aria-label={s.label}
                            >
                              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                              {s.label}
                            </Link>
                          );
                        })}
                      </nav>
                    </SidebarSection>
                  </>
                ) : (
                  /* ── Normal layout: Navigation + Workspace sections ── */
                  <>
                    <SidebarSection id="navigation" label="Navigation">
                      <nav className="nav-sidebar flex flex-col gap-0.5 px-2 pb-2">
                        {sortedHubs.map((h) => {
                          const Icon = h.icon;
                          return (
                            <Link
                              key={h.id}
                              to={h.route}
                              className={`btn-ghost flex w-full items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px]${currentPath.startsWith(h.route) ? " bg-muted font-medium text-foreground" : ""}`}
                              title={h.label}
                              aria-label={h.label}
                            >
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {h.label}
                            </Link>
                          );
                        })}
                      </nav>
                    </SidebarSection>

                    {inlineSidebarActions.length > 0 && (
                      <SidebarSection id="workspace" label="Workspace">
                        {inlineSidebarActions.map((a) => {
                          const Comp = a.component;
                          return <Comp key={a.id} />;
                        })}
                      </SidebarSection>
                    )}
                  </>
                )}
              </div>

            </div>
          </CollapsibleSidebar>
        </SidebarProvider>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </MentionProvider>
  );
}

export default Layout;
