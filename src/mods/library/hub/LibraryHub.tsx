import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  AlignJustify,
  Folder,
  FolderSymlink,
  ArrowUp,
} from "lucide-react";
import type { LibraryItem, LibraryEntryItem, LibraryProjectItem, LibraryFolderPath } from "../types";
import type { Project } from "../../access/types";
import { usePaginatedData } from "../../../shell/src/shared/hooks/usePaginatedData";
import { getLibraryContents, getAccessibleProjects, getFolders, deleteFolder, deleteEntry } from "../api";
import type { BreadcrumbSegment } from "../../../shell/src/shared/components/Breadcrumbs";
import LibraryNewDropdown from "./LibraryNewDropdown";
import { BaseCard } from "../../../shell/src/shared/components/BaseCard";
import type { PropertyField } from "../../../shell/src/shared/components/BaseCard";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { SlotContext, SchemaColumnDef } from "../../../shell/src/mod-system/types";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import RowMenu from "./RowMenu";
import { EntryPropertiesModal } from "./EntryPropertiesModal";
import { FolderPropertiesModal } from "./FolderPropertiesModal";
import NotFound from "../../../shell/src/shared/components/NotFound";
import {
  appendPath,
  parentPath,
  pathSegments as getPathSegments,
  segmentPath,
} from "../path";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "list" | "grid" | "compact";

const VIEW_MODE_STORAGE_KEY = "helix-library-view-mode";

function getInitialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "list" || stored === "grid" || stored === "compact") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return "list";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function folderToEntryShape(folder: {
  type: "folder";
  id: number;
  name: string;
  parent: number | null;
  created_at: string;
  is_shared?: boolean;
  source_project_id?: number;
  source_project_name?: string;
  source_project_icon?: string;
  source_project_color?: string;
}): LibraryEntryItem {
  return {
    type: "entry",
    id: folder.id,
    workspace_id: "",
    display_id: "",
    title: folder.name,
    folder: folder.parent,
    folder_name: null,
    author_username: folder.source_project_name ?? null,
    author_info: folder.is_shared
      ? {
          id: folder.source_project_id ?? 0,
          username: folder.source_project_name ?? "Unknown Project",
          first_name: "",
          last_name: "",
          color: folder.source_project_color ?? "#666",
        }
      : null,
    status: "",
    description: "",
    tags: [],
    editors: [],
    icon: folder.is_shared ? "" : "folder",
    color: "warn",
    samples_count: null,
    attachments_count: null,
    property_fields: {},
    created_at: folder.created_at,
    updated_at: folder.created_at,
  };
}

function columnsToPropertyFields(
  columns: SchemaColumnDef[] | undefined,
): PropertyField[] {
  if (!columns || columns.length === 0) return [];
  return columns.map((col) => ({
    key: col.name.toLowerCase().replace(/\s+/g, "_"),
    label: col.name,
  }));
}

// ── Project-aware breadcrumbs ──────────────────────────────────────────────

interface ProjectBreadcrumbProps {
  projectName: string;
  projectIsArchived: boolean;
  pathSegments: string[];
  onNavigateToRoot: () => void;
  onNavigateToSegment: (path: string) => void;
  onUp: () => void;
}

function ProjectBreadcrumbs({
  projectName,
  projectIsArchived,
  pathSegments,
  onNavigateToRoot,
  onNavigateToSegment,
  onUp,
}: ProjectBreadcrumbProps) {
  const atRoot = pathSegments.length === 0;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb path">
      <IconButton
        onClick={onUp}
        disabled={atRoot}
        aria-label="Go up"
        title="Go up"
      >
        <ArrowUp size={14} />
      </IconButton>
      <Folder
        size={13}
        className="breadcrumb-folder-icon"
        aria-hidden="true"
      />
      <span
        className="breadcrumb-seg"
        onClick={onNavigateToRoot}
      >
        {projectName}
        {projectIsArchived && (
          <span className="archived-pill">Archived</span>
        )}
      </span>
      {pathSegments.map((seg, i) => {
        const isLast = i === pathSegments.length - 1;
        return (
          <span key={i} className="breadcrumb-seg-wrap">
            <span className="breadcrumb-sep">/</span>
            {isLast ? (
              <span className="breadcrumb-seg is-current">{seg}</span>
            ) : (
              <span
                className="breadcrumb-seg"
                onClick={() =>
                  onNavigateToSegment(
                    segmentPath(pathSegments, i),
                  )
                }
              >
                {seg}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ── Role badge for project cards ───────────────────────────────────────────

function RoleBadge({ role }: { role: "read" | "edit" | null }) {
  if (!role) return null;
  return (
    <span className={`role-badge role-badge-${role}`}>
      {role === "edit" ? "Edit" : "Read"}
    </span>
  );
}

// ── Project card ───────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project;
  viewMode: ViewMode;
  onClick: () => void;
}

function ProjectCard({ project, viewMode, onClick }: ProjectCardProps) {
  if (viewMode === "compact") {
    return (
      <div
        className="base-library-card view-compact is-project-card"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <span className="card-icon">
          {project.icon_key ? (
            <IconBadge iconKey={project.icon_key} colorKey={project.color_key || "muted"} size="md" />
          ) : (
            <Folder />
          )}
        </span>
        <div className="card-body">
          <div className="card-header">
            <span className="card-title">{project.name}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`base-library-card is-project-card view-${viewMode}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="card-icon">
        {project.icon_key ? (
          <IconBadge iconKey={project.icon_key} colorKey={project.color_key || "muted"} size="lg" />
        ) : (
          <Folder />
        )}
      </span>
      <div className="card-body">
        <div className="card-header">
          <span className="card-title">{project.name}</span>
          <RoleBadge role={project.current_user_role ?? null} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function LibraryHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectUid = searchParams.get("project");
  const currentPath = searchParams.get("path") || "";

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const contentsRequestVersion = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Project metadata from contents response
  const [projectMeta, setProjectMeta] = useState<{
    name: string;
    isArchived: boolean;
    icon: string;
    color: string;
  } | null>(null);

  // Projects listing state
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [projectRoleMap, setProjectRoleMap] = useState<Record<string, "read" | "edit" | null>>({});

  // Track whether user is an org admin
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  // Track current project role
  const [currentRole, setCurrentRole] = useState<"read" | "edit" | null>(null);

  // Folder paths for move picker
  const [folderPaths, setFolderPaths] = useState<LibraryFolderPath[]>([]);

  // Properties modal state
  const [propertiesItem, setPropertiesItem] = useState<LibraryItem | null>(null);

  const isInProject = !!projectUid;

  // ── View mode state ──────────────────────────────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // ── Fetch accessible projects ─────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const data = await getAccessibleProjects();
      setProjects(data);
      const roleMap: Record<string, "read" | "edit" | null> = {};
      for (const p of data) {
        roleMap[p.uid] = p.current_user_role ?? null;
      }
      setProjectRoleMap(roleMap);
      const hasNullRole = data.some((p) => p.current_user_role === null);
      setIsOrgAdmin(hasNullRole);
    } catch (err: unknown) {
      setProjectsError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const [projectsFetched, setProjectsFetched] = useState(false);

  useEffect(() => {
    if (!isInProject) {
      fetchProjects();
    } else if (!projectsFetched) {
      fetchProjects().then(() => setProjectsFetched(true));
    }
  }, [isInProject, fetchProjects, projectsFetched]);

  useEffect(() => {
    if (projectUid) {
      getFolders(projectUid)
        .then(setFolderPaths)
        .catch(() => setFolderPaths([]));
      setCurrentRole(projectRoleMap[projectUid] ?? null);
    }
  }, [projectUid, projectRoleMap]);

  // ── Contents fetch (inside a project) ─────────────────────────────────

  const fetchFn = useCallback(
    async (url?: string) => {
      const requestVersion = ++contentsRequestVersion.current;
      void refreshKey;
      if (!projectUid) {
        return {
          count: 0,
          next: null,
          previous: null,
          results: [],
          current_folder_id: null,
          current_project_id: null,
        };
      }
      let response;
      if (url) {
        const urlObj = new URL(url, window.location.origin);
        const page = Number(urlObj.searchParams.get("page") || 2);
        response = await getLibraryContents(projectUid, currentPath || undefined, page);
      } else {
        response = await getLibraryContents(projectUid, currentPath || undefined, undefined);
      }
      if (requestVersion !== contentsRequestVersion.current) return response;
      setCurrentFolderId(response.current_folder_id);
      setCurrentProjectId(response.current_project_id ?? null);
      if (response.project_name) {
        setProjectMeta({
          name: response.project_name,
          isArchived: response.project_is_archived ?? false,
          icon: response.project_icon ?? "",
          color: response.project_color ?? "",
        });
      }
      return response;
    },
    [projectUid, currentPath, refreshKey],
  );

  const data = usePaginatedData({
    fetchFn,
    filterKey: "path",
    getId: (item) => item.id,
    getDisplayId: (item) =>
      item.type === "entry" ? item.display_id : `folder-${item.id}`,
  });

  useEffect(() => {
    setCurrentFolderId(null);
    setCurrentProjectId(null);
    setProjectMeta(null);
    data.clearSelection();
  }, [projectUid, currentPath, data.clearSelection]);

  // ── Sidebar bus and context ─────────────────────────────────────────

  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  const sidebarContext: SlotContext = useMemo(
    () => ({
      workspaceId: "library",
      user: null,
      viewMode,
    }),
    [viewMode],
  );

  // ── Registry-driven card config ──────────────────────────────────────

  const registry = useMemo(() => ModRegistry.getInstance(), []);
  const workspaces = useMemo(() => registry.getWorkspaces(), [registry]);

  const getPropertyFieldsForEntry = useCallback(
    (entry: LibraryEntryItem): PropertyField[] => {
      const ws = workspaces.get(entry.workspace_id);
      return columnsToPropertyFields(ws?.schemaType?.columns);
    },
    [workspaces],
  );

  // ── Navigation ───────────────────────────────────────────────────────

  const navigateToProjects = useCallback(() => {
    setSearchParams({});
    data.clearSelection();
    setProjectMeta(null);
  }, [setSearchParams, data]);

  useEffect(() => {
    if (data.errorStatus === 404 && !currentPath) {
      navigateToProjects();
    }
  }, [data.errorStatus, currentPath, navigateToProjects]);

  const navigateToProject = useCallback(
    (uid: string) => {
      setSearchParams({ project: uid });
      data.clearSelection();
      setCurrentRole(projectRoleMap[uid] ?? null);
    },
    [setSearchParams, data, projectRoleMap],
  );

  const navigateToPath = useCallback(
    (path: string) => {
      if (!projectUid) return;
      if (path) {
        setSearchParams({ project: projectUid, path });
      } else {
        setSearchParams({ project: projectUid });
      }
      data.clearSelection();
    },
    [projectUid, setSearchParams, data],
  );

  const navigateUp = useCallback(() => {
    navigateToPath(parentPath(currentPath));
  }, [currentPath, navigateToPath]);

  // ── Delete handler ─────────────────────────────────────────────────────

  const handleDelete = useCallback(
    (item: LibraryItem) => {
      if (item.type === "folder") {
        const shareCount = item.share_summary?.target_projects?.length ?? 0;
        let message = `Delete folder "${item.name}"? Everything inside it is permanently deleted.`;
        if (shareCount > 0) {
          message += ` It is shared with ${shareCount} project(s); deleting revokes all shares.`;
        }
        if (!window.confirm(message)) return;
        deleteFolder(item.id).then(() => setRefreshKey((k) => k + 1));
      } else {
        const message = `Delete entry "${item.title}"? This cannot be undone.`;
        if (!window.confirm(message)) return;
        deleteEntry(item.display_id).then(() => setRefreshKey((k) => k + 1));
      }
    },
    [],
  );

  const navigateToFolder = useCallback(
    (folderName: string) => {
      navigateToPath(appendPath(currentPath, folderName));
    },
    [currentPath, navigateToPath],
  );

  // ── Item click handler ──────────────────────────────────────────────

  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (item.type === "folder") {
        navigateToFolder(item.name);
        return;
      }
      const params = new URLSearchParams({ project: projectUid ?? "" });
      if (currentProjectId !== null) params.set("projectId", String(currentProjectId));
      navigate(`/${item.workspace_id}/${item.display_id}?${params.toString()}`);
    },
    [navigateToFolder, navigate, projectUid, currentProjectId],
  );

  // ── Selection tracking ──────────────────────────────────────────────

  const handleCardClick = useCallback(
    (item: LibraryItem) => {
      data.selectItem(item);
      handleItemClick(item);
    },
    [data, handleItemClick],
  );

  // ── Path segments from URL ──────────────────────────────────────────

  const pathSegments = useMemo(() => getPathSegments(currentPath), [currentPath]);

  // ── Render card (inside project) ─────────────────────────────────────

  const renderCard = (item: LibraryItem) => {
    if (item.type === "folder") {
      const adapted = folderToEntryShape(item);
      const isShared = !!item.is_shared;
      const isSharedOut = !!item.share_summary?.shared;

      const targetNames = isSharedOut
        ? item.share_summary!.target_projects.map((p) => p.name)
        : [];
      const tooltip = targetNames.length > 0
        ? `Shared with: ${targetNames.join(", ")}`
        : undefined;

      // Shared top-level folder at root never shows Delete
      const atRoot = !currentPath || currentPath === "";
      const canDelete = (isOrgAdmin || currentRole === "edit")
        && !(isShared && atRoot);

      return (
        <BaseCard
          key={`folder-${item.id}`}
          item={adapted}
          viewMode={viewMode}
          isSelected={data.selectedId === item.id}
          iconKey={isShared || isSharedOut ? "" : "folder"}
          colorKey="warn"
          showDescription={false}
          showTags={false}
          showUpdatedAt={false}
          icon={isShared || isSharedOut ? FolderSymlink : undefined}
          iconTitle={tooltip}
          onClick={() => handleCardClick(item)}
          endSlot={
            <RowMenu
              onProperties={() => setPropertiesItem(item)}
              canDelete={canDelete}
              onDelete={() => handleDelete(item)}
            />
          }
        />
      );
    }

    const isSelected = data.selectedId === item.id;
    const propertyFields = getPropertyFieldsForEntry(item);
    const canDelete = isOrgAdmin || currentRole === "edit";

    return (
      <BaseCard
        key={`entry-${item.id}`}
        item={item}
        viewMode={viewMode}
        isSelected={isSelected}
        iconKey={item.icon || "file-text"}
        colorKey={item.color === "muted" ? "flask" : item.color}
        propertyFields={propertyFields}
        showDescription={true}
        showTags={true}
        showUpdatedAt={true}
        onClick={() => handleCardClick(item)}
        endSlot={
          <RowMenu
            onProperties={() => setPropertiesItem(item)}
            canDelete={canDelete}
            onDelete={() => handleDelete(item)}
          />
        }
      />
    );
  };

  // ── Loading state ──────────────────────────────────────────────────

  if (isInProject && data.loading && data.items.length === 0) {
    return (
      <div className="library-hub">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  if (!isInProject && projectsLoading) {
    return (
      <div className="library-hub">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Projects listing mode ───────────────────────────────────────────

  if (!isInProject) {
    if (projectsError) {
      return (
        <div className="library-hub">
          <div className="error">{projectsError}</div>
        </div>
      );
    }

    if (!projects || projects.length === 0) {
      return (
        <div className="library-hub">
          <div className="library-main-column">
            <div className="library-empty-state">
              <h2>The null hypothesis stands: no projects found.</h2>
              {isOrgAdmin ? (
                <p>Create one in Settings → Projects.</p>
              ) : (
                <p>Ask an Organization Admin to create one.</p>
              )}
            </div>
          </div>
          <SlotSidebar
            slotId="library.sidebar"
            context={sidebarContext}
            bus={bus}
          />
        </div>
      );
    }

    return (
      <div className="library-hub">
        <div className="library-main-column">
          {/* ── Top Bar ────────────────────────────────────────────── */}
          <div className="library-top-bar">
            <div className="library-top-bar-actions">
              <div
                className="library-view-toggle-group"
                role="group"
                aria-label="View mode"
              >
                <IconButton
                  className={viewMode === "compact" ? "is-active" : ""}
                  aria-label="Compact view"
                  title="Compact view"
                  onClick={() => handleViewModeChange("compact")}
                >
                  <AlignJustify size={15} />
                </IconButton>
                <IconButton
                  className={viewMode === "list" ? "is-active" : ""}
                  aria-label="List view"
                  title="List view"
                  onClick={() => handleViewModeChange("list")}
                >
                  <LayoutList size={15} />
                </IconButton>
                <IconButton
                  className={viewMode === "grid" ? "is-active" : ""}
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => handleViewModeChange("grid")}
                >
                  <LayoutGrid size={15} />
                </IconButton>
              </div>
            </div>
          </div>

          {/* ── Card List ──────────────────────────────────────────── */}
          <div className={`library-card-list view-${viewMode}`}>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                viewMode={viewMode}
                onClick={() => navigateToProject(project.uid)}
              />
            ))}
          </div>
        </div>

        <SlotSidebar
          slotId="library.sidebar"
          context={sidebarContext}
          bus={bus}
        />
      </div>
    );
  }

  // ── Project contents mode ───────────────────────────────────────────

  if (data.errorStatus === 404) {
    if (!currentPath) {
      return null;
    }
    return <NotFound />;
  }

  return (
    <div className="library-hub">
      <div className="library-main-column">
        {/* ── Top Bar ──────────────────────────────────────────────── */}
        <div className="library-top-bar">
          <ProjectBreadcrumbs
            projectName={projectMeta?.name ?? "…"}
            projectIsArchived={projectMeta?.isArchived ?? false}
            pathSegments={pathSegments}
            onNavigateToRoot={() => navigateToPath("")}
            onNavigateToSegment={(path) => navigateToPath(path)}
            onUp={navigateUp}
          />

          <div className="library-top-bar-actions">
            <div
              className="library-view-toggle-group"
              role="group"
              aria-label="View mode"
            >
              <IconButton
                className={viewMode === "compact" ? "is-active" : ""}
                aria-label="Compact view"
                title="Compact view"
                onClick={() => handleViewModeChange("compact")}
              >
                <AlignJustify size={15} />
              </IconButton>
              <IconButton
                className={viewMode === "list" ? "is-active" : ""}
                aria-label="List view"
                title="List view"
                onClick={() => handleViewModeChange("list")}
              >
                <LayoutList size={15} />
              </IconButton>
              <IconButton
                className={viewMode === "grid" ? "is-active" : ""}
                aria-label="Grid view"
                title="Grid view"
                onClick={() => handleViewModeChange("grid")}
              >
                <LayoutGrid size={15} />
              </IconButton>
            </div>

            <Button
              variant="ghost"
              size="sm"
              title="Export"
              disabled
            >
              Export
            </Button>

            <LibraryNewDropdown
              currentPath={currentPath}
              projectUid={projectUid}
              currentFolderId={currentFolderId}
              currentProjectId={currentProjectId}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* ── Filter Bar ───────────────────────────────────────────── */}
        <div className="library-filter-bar">
          <div className="library-filter-search-wrap">
            <Search size={15} className="library-filter-search-icon" />
            <Input
              className="library-filter-search"
              placeholder="Search…"
              disabled
            />
          </div>
          <div className="library-filter-actions">
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <Select className="library-filter-select" disabled>
                <option>Type</option>
              </Select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <Select className="library-filter-select" disabled>
                <option>Status</option>
              </Select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <Select className="library-filter-select" disabled>
                <option>Owner</option>
              </Select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <Select className="library-filter-select" disabled>
                <option>Time</option>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled
            >
              <ArrowUpDown size={14} />
              Last updated
            </Button>
          </div>
        </div>

        {/* Card List */}
        <div className={`library-card-list view-${viewMode}`}>
          {data.error && <div className="error">{data.error}</div>}

          {!data.error &&
            !data.loading &&
            data.items.length === 0 && (
              <p className="empty">This folder is empty.</p>
            )}

          {!data.error && data.items.length > 0 && (
            <div className="library-table-header">
              <span className="library-table-header-col type-col">Type</span>
              <span className="library-table-header-col item-col">Item</span>
              <span className="library-table-header-col owners-col">Owners</span>
            </div>
          )}

          {data.items.map(renderCard)}

          {data.nextUrl && (
            <div className="hub-load-more">
              <Button
                variant="ghost"
                onClick={data.handleLoadMore}
                disabled={data.loading}
              >
                {data.loading ? "Loading…" : "Load More"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <SlotSidebar
        slotId="library.sidebar"
        context={sidebarContext}
        bus={bus}
      />

      {/* ── Properties Modals ─────────────────────────────────────────── */}
      {propertiesItem?.type === "entry" && (
        <EntryPropertiesModal
          open={true}
          onClose={() => setPropertiesItem(null)}
          entry={propertiesItem}
          projectMeta={projectMeta}
          canEdit={isOrgAdmin || currentRole === "edit"}
          folders={folderPaths}
          projectUid={projectUid}
          onMutated={() => {
            setPropertiesItem(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {propertiesItem?.type === "folder" && (
        <FolderPropertiesModal
          open={true}
          onClose={() => setPropertiesItem(null)}
          folder={propertiesItem}
          canEdit={isOrgAdmin || currentRole === "edit"}
          isOrgAdmin={isOrgAdmin}
          projectId={currentProjectId}
          onMutated={() => {
            setPropertiesItem(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

export default LibraryHub;
