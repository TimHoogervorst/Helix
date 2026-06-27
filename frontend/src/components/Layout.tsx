import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { get } from "../api/client";
import type { EntityType } from "../types/lims";
import { useLimsView } from "../context/LimsViewContext";
import { useLibraryView } from "../context/LibraryViewContext";
import { ReferenceProvider } from "./ReferenceProvider";

function Layout() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLims = location.pathname.startsWith("/lims");
  const isLibrary = location.pathname.startsWith("/library");
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const { viewState } = useLimsView();
  const { viewState: libraryViewState } = useLibraryView();

  // Fetch entity types for LIMS search type dropdown
  useEffect(() => {
    if (isLims) {
      get<EntityType[]>("/lims/entity-types/")
        .then((types) => setEntityTypes(types.filter((t) => t.is_active)))
        .catch(() => {});
    }
  }, [isLims]);

  // Prime the CSRF cookie so unsafe API requests (POST/PUT/DELETE) work
  useEffect(() => {
    get("/core/csrf/").catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const s = (formData.get("search") as string) || "";
    const t = (formData.get("type") as string) || "";
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (t) params.set("type", t);
    setSearchParams(params);
  };

  const handleLibrarySearch = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const s = (formData.get("search") as string) || "";
    const params = new URLSearchParams(searchParams);
    if (s) params.set("search", s);
    else params.delete("search");
    setSearchParams(params);
  };

  const currentSearch = searchParams.get("search") || "";
  const currentType = searchParams.get("type") || "";

  return (
    <ReferenceProvider>
      <nav>
        <div className="nav-left">
          <Link to="/library">OpenScience</Link>
          <Link to="/library">Library</Link>
          <Link to="/lims">LIMS</Link>
        </div>

        {isLims && !isLibrary && viewState !== "expanded" && (
          <form className="nav-search-bar" onSubmit={handleSearch}>
            <div className="nav-search-input-wrap">
              <span className="nav-search-icon">🔍</span>
              <input
                type="text"
                name="search"
                defaultValue={currentSearch}
                placeholder="Search by ID or name…"
                className="nav-search-input"
              />
            </div>
            <select
              name="type"
              defaultValue={currentType}
              className="nav-type-select"
            >
              <option value="">All types</option>
              {entityTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name} ({et.prefix})
                </option>
              ))}
            </select>
            <button type="submit" className="nav-search-btn" title="Search">
              🔍
            </button>
          </form>
        )}

        {isLibrary && libraryViewState !== "expanded" && (
          <form className="nav-search-bar" onSubmit={handleLibrarySearch}>
            <div className="nav-search-input-wrap">
              <span className="nav-search-icon">🔍</span>
              <input
                type="text"
                name="search"
                defaultValue={currentSearch}
                placeholder="Search by name or ID…"
                className="nav-search-input"
              />
            </div>
            <button type="submit" className="nav-search-btn" title="Search">
              🔍
            </button>
          </form>
        )}

        <div className="nav-right">
          <Link to="/settings" className="nav-gear" title="Settings">
            ⚙️
          </Link>
        </div>
      </nav>
      <div className="page">
        <Outlet />
      </div>
    </ReferenceProvider>
  );
}

export default Layout;
