import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import {
  createAffiliation,
  updateAffiliation,
  deleteAffiliation,
} from "../api";
import { ApiError } from "../../../shell/src/api/client";
import type { Affiliation } from "../../../shell/src/user/types";

/**
 * Affiliations section with:
 *  - View mode: list of affiliations with per-row edit/delete on hover
 *  - Inline edit mode per row
 *  - "Add" button to create a new affiliation row
 *  - Edit button in the section header
 */

interface FormData {
  institution: string;
  role: string;
  department: string;
  start_date: string;
  end_date: string;
}

function emptyForm(): FormData {
  return { institution: "", role: "", department: "", start_date: "", end_date: "" };
}

function affiliationToForm(a: Affiliation): FormData {
  return {
    institution: a.institution,
    role: a.role,
    department: a.department,
    start_date: a.start_date ?? "",
    end_date: a.end_date ?? "",
  };
}

type Mode =
  | { type: "view" }
  | { type: "adding" }
  | { type: "editing"; id: number };

export function AffiliationsSection() {
  const { user, refresh } = useCurrentUser();
  const [mode, setMode] = useState<Mode>({ type: "view" });
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const items = user.affiliations;

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

  const handleEdit = (item: Affiliation) => {
    setForm(affiliationToForm(item));
    setError(null);
    setMode({ type: "editing", id: item.id });
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteAffiliation(id);
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
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        order: mode.type === "editing"
          ? items.find((a) => a.id === (mode as { type: "editing"; id: number }).id)?.order ?? 0
          : items.length,
      };
      if (mode.type === "adding") {
        await createAffiliation(payload);
      } else if (mode.type === "editing") {
        await updateAffiliation(mode.id, payload);
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
          Affiliations
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
          No affiliations yet.
        </p>
      ) : (
        <div className="divide-y divide-hairline">
          {items.map((item) =>
            mode.type === "editing" && mode.id === item.id ? (
              /* ── Editing row ─────────────────────────────── */
              <AffiliationEditRow
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
                  <p className="text-[13px] font-medium text-foreground">
                    {item.institution}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {item.role}
                    {item.department ? `, ${item.department}` : ""}
                  </p>
                  {(item.start_date || item.end_date) && (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {[item.start_date, item.end_date]
                        .filter(Boolean)
                        .join(" – ")}
                    </p>
                  )}
                </div>
                {mode.type === "view" && (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="btn-icon rounded text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(item)}
                      aria-label="Edit affiliation"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete affiliation"
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
            <AffiliationEditRow
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

/** Inline edit/creation form for a single affiliation. */
function AffiliationEditRow({
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
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Institution
          </span>
          <input
            className="input rounded-md text-[13px]"
            value={form.institution}
            onChange={(e) => onChange({ ...form, institution: e.target.value })}
            placeholder="e.g. Stanford University"
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
            placeholder="e.g. Postdoc"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Department
          </span>
          <input
            className="input rounded-md text-[13px]"
            value={form.department}
            onChange={(e) => onChange({ ...form, department: e.target.value })}
            placeholder="e.g. Chemistry"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Start
            </span>
            <input
              type="date"
              className="input rounded-md text-[13px]"
              value={form.start_date}
              onChange={(e) =>
                onChange({ ...form, start_date: e.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              End
            </span>
            <input
              type="date"
              className="input rounded-md text-[13px]"
              value={form.end_date}
              onChange={(e) =>
                onChange({ ...form, end_date: e.target.value })
              }
            />
          </label>
        </div>
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
