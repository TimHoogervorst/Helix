import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import type { LimsViewItem } from "../types";
import { getPublicViews } from "../hub/api";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a full /entities?… URL from a filter state object. */
function buildViewURL(state: LimsViewItem["filter_state"]): string {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.schema_type) params.set("schema_type", state.schema_type);
  if (state.schema) params.set("schema", state.schema);
  if (state.status) params.set("status", state.status);
  if (state.sort) params.set("sort", state.sort);
  for (const f of state.fields ?? []) {
    params.append("f", f);
  }
  if ((state.columns ?? []).length > 0) {
    params.set("columns", state.columns.join(","));
  }
  try {
    localStorage.setItem("helix-entities-view-mode", state.viewMode);
  } catch {
    // localStorage unavailable
  }
  const qs = params.toString();
  return `/entities${qs ? `?${qs}` : ""}`;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Global Views sidebar block — read-only list of public Views.
 *
 * Fetches all public Views from other users. Clicking a View navigates
 * to the Entities Hub with those filters applied.
 * No edit or delete controls — global views are read-only.
 */
export function GlobalViewsBlock(_props: BlockComponentProps) {
  const navigate = useNavigate();

  const [views, setViews] = useState<LimsViewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchViews = useCallback(async () => {
    try {
      const data = await getPublicViews();
      setViews(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  // ── Click view → navigate ───────────────────────────────────────────
  const handleClickView = useCallback(
    (view: LimsViewItem) => {
      navigate(buildViewURL(view.filter_state));
    },
    [navigate],
  );

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ul className="entities-sidebar-views">
        <li className="entities-sidebar-view-item is-empty">Loading…</li>
      </ul>
    );
  }

  if (views.length === 0) {
    return (
      <ul className="entities-sidebar-views">
        <li className="entities-sidebar-view-item is-empty">
          No public views yet.
        </li>
      </ul>
    );
  }

  return (
    <ul className="entities-sidebar-views">
      {views.map((view) => (
        <li key={view.id} className="entities-sidebar-view-item">
          <button
            className="entities-views-item-name"
            type="button"
            onClick={() => handleClickView(view)}
            title={`Load view: ${view.name} (by ${view.owner_username})`}
          >
            {view.name}
            <span className="entities-views-owner">
              {view.owner_username}
            </span>
          </button>
          <Globe size={11} className="entities-views-public-icon" />
        </li>
      ))}
    </ul>
  );
}
