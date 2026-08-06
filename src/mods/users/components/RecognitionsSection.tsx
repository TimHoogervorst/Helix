import { useState } from "react";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import {
  createRecognition,
  updateRecognition,
  deleteRecognition,
} from "../api";
import { ApiError } from "../../../shell/src/api/client";
import type { Recognition } from "../../../shell/src/user/types";
import { Button, IconButton, Input } from "../../../shell/src/shared/primitives";

/**
 * Recognitions section with:
 *  - View mode: list with per-row edit/delete on hover
 *  - Inline edit mode per row
 *  - "Add" button to create a new recognition
 *  - Edit button in the section header
 */

interface FormData {
  title: string;
  issuer: string;
  date: string;
}

function emptyForm(): FormData {
  return { title: "", issuer: "", date: "" };
}

function recognitionToForm(r: Recognition): FormData {
  return {
    title: r.title,
    issuer: r.issuer,
    date: r.date,
  };
}

type Mode =
  | { type: "view" }
  | { type: "adding" }
  | { type: "editing"; id: number };

export function RecognitionsSection() {
  const { user, refresh } = useCurrentUser();
  const [mode, setMode] = useState<Mode>({ type: "view" });
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const items = user.recognitions;

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

  const handleEdit = (item: Recognition) => {
    setForm(recognitionToForm(item));
    setError(null);
    setMode({ type: "editing", id: item.id });
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteRecognition(id);
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
        order: mode.type === "editing"
          ? items.find((r) => r.id === (mode as { type: "editing"; id: number }).id)?.order ?? 0
          : items.length,
      };
      if (mode.type === "adding") {
        await createRecognition(payload);
      } else if (mode.type === "editing") {
        await updateRecognition(mode.id, payload);
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
    <section className="group/section rounded-lg border border-border bg-panel p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
            Recognitions
          </h2>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover/section:opacity-100 transition-opacity"
            onClick={() => setMode({ type: "adding" })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {items.length === 0 && mode.type !== "adding" ? (
        <p className="text-[13px] text-muted-foreground">
          No recognitions yet.
        </p>
      ) : (
        <div className="divide-y divide-hairline">
          {items.map((item) =>
            mode.type === "editing" && mode.id === item.id ? (
              /* ── Editing row ─────────────────────────────── */
              <RecognitionEditRow
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
                className="group/row flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {[item.issuer, item.date].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {mode.type === "view" && (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <IconButton
                      aria-label="Edit recognition"
                      onClick={() => handleEdit(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </IconButton>
                    <IconButton
                      aria-label="Delete recognition"
                      className="text-[--color-ink-muted-foreground] hover:bg-[--color-destructive]/10 hover:text-[--color-destructive]"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </IconButton>
                  </div>
                )}
              </div>
            ),
          )}
          {mode.type === "adding" && (
            /* ── Adding row ─────────────────────────────── */
            <RecognitionEditRow
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

/** Inline edit/creation form for a single recognition. */
function RecognitionEditRow({
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Title
          </span>
          <Input
            className="text-[13px]"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder="e.g. Best Poster Award"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Issuer
          </span>
          <Input
            className="text-[13px]"
            value={form.issuer}
            onChange={(e) => onChange({ ...form, issuer: e.target.value })}
            placeholder="e.g. ACS"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Date
          </span>
          <Input
            type="date"
            className="text-[13px]"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-[--color-ink-muted-foreground]"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
