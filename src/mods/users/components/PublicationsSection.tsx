import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import {
  createPublication,
  updatePublication,
  deletePublication,
} from "../api";
import { ApiError } from "../../../shell/src/api/client";
import type { Publication } from "../../../shell/src/user/types";

/**
 * Publications section with:
 *  - View mode: list of publications with per-row edit/delete on hover
 *  - Link field renders as clickable icon in view mode, text input in edit mode
 *  - Inline edit mode per row
 *  - "Add" button to create a new publication row
 *  - Edit button in the section header
 */

interface FormData {
  title: string;
  journal: string;
  year: string;
  role: string;
  url: string;
}

function emptyForm(): FormData {
  return { title: "", journal: "", year: "", role: "", url: "" };
}

function publicationToForm(p: Publication): FormData {
  return {
    title: p.title,
    journal: p.journal,
    year: p.year != null ? String(p.year) : "",
    role: p.role,
    url: p.url,
  };
}

type Mode =
  | { type: "view" }
  | { type: "adding" }
  | { type: "editing"; id: number };

export function PublicationsSection() {
  const { user, refresh } = useCurrentUser();
  const [mode, setMode] = useState<Mode>({ type: "view" });
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const items = user.publications;

  const reset = () => {
    setMode({ type: "view" });
    setForm(emptyForm());
    setError(null);
  };

  const handleAdd = () => {
    setForm(emptyForm());
    setError(null);
    setMode({ type: "adding" });
  };

  const handleEdit = (item: Publication) => {
    setForm(publicationToForm(item));
    setError(null);
    setMode({ type: "editing", id: item.id });
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deletePublication(id);
      await refresh();
    } catch {
      setError("Failed to delete. Please try again.");
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        year: form.year ? Number(form.year) : null,
        order: mode.type === "editing"
          ? items.find((p) => p.id === (mode as { type: "editing"; id: number }).id)?.order ?? 0
          : items.length,
      };
      if (mode.type === "adding") {
        await createPublication(payload);
      } else if (mode.type === "editing") {
        await updatePublication(mode.id, payload);
      }
      await refresh();
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Invalid input. Please check your values.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const editing = mode.type !== "view";

  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold tracking-tight">
          Publications
        </h2>
        {!editing && (
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => setMode({ type: "adding" })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {items.length === 0 && mode.type !== "adding" ? (
        <p className="text-[13px] text-muted-foreground">
          No publications yet.
        </p>
      ) : (
        <div className="divide-y divide-hairline">
          {items.map((item) =>
            mode.type === "editing" && mode.id === item.id ? (
              /* ── Editing row ─────────────────────────────── */
              <PublicationEditRow
                key={item.id}
                form={form}
                onChange={setForm}
                onSave={handleSave}
                onCancel={reset}
                saving={saving}
              />
            ) : (
              /* ── View row ────────────────────────────────── */
              <div
                key={item.id}
                className="group flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {item.title}
                    </p>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-primary"
                        aria-label="Open publication link"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {[item.journal, item.role, item.year]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {mode.type === "view" && (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="btn-icon rounded text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(item)}
                      aria-label="Edit publication"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete publication"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
          {mode.type === "adding" && (
            /* ── Adding row ─────────────────────────────── */
            <PublicationEditRow
              form={form}
              onChange={setForm}
              onSave={handleSave}
              onCancel={reset}
              saving={saving}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** Inline edit/creation form for a single publication. */
function PublicationEditRow({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: FormData;
  onChange: (f: FormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2 py-2.5 first:pt-0 last:pb-0">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            Title
          </span>
          <input
            className="input rounded-md text-[13px]"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder="e.g. A novel approach to..."
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Journal
          </span>
          <input
            className="input rounded-md text-[13px]"
            value={form.journal}
            onChange={(e) => onChange({ ...form, journal: e.target.value })}
            placeholder="e.g. Nature"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Year
          </span>
          <input
            type="number"
            className="input rounded-md text-[13px]"
            value={form.year}
            onChange={(e) => onChange({ ...form, year: e.target.value })}
            placeholder="2026"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Role
          </span>
          <input
            className="input rounded-md text-[13px]"
            value={form.role}
            onChange={(e) => onChange({ ...form, role: e.target.value })}
            placeholder="e.g. First author"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            URL
          </span>
          <input
            type="url"
            className="input rounded-md text-[13px]"
            value={form.url}
            onChange={(e) => onChange({ ...form, url: e.target.value })}
            placeholder="https://doi.org/..."
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost rounded-md px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
