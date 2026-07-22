import { useState } from "react";
import { Pencil } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { updateMe } from "../../../shell/src/user/api";
import { ApiError } from "../../../shell/src/api/client";
import type { UserProfile } from "../../../shell/src/user/types";

/**
 * Section card for the user's bio.
 *
 * States:
 *  - view:  shows the bio paragraph only (other fields are shown in ProfileHeader)
 *  - edit:  renders inline text inputs for all fields + textarea for bio, Save/Cancel buttons
 *
 * Editable fields: title, username, position, pronouns, location, email, bio.
 */

interface ProfileFormData {
  title: string;
  username: string;
  position: string;
  pronouns: string;
  location: string;
  email: string;
  bio: string;
}

function buildFormData(profile: UserProfile, username: string, email: string): ProfileFormData {
  return {
    title: profile.title ?? "",
    username,
    position: profile.position ?? "",
    pronouns: profile.pronouns ?? "",
    location: profile.location ?? "",
    email: email ?? "",
    bio: profile.bio ?? "",
  };
}

interface FieldDef {
  key: keyof ProfileFormData;
  label: string;
  type?: "text" | "email";
}

const FIELDS: FieldDef[] = [
  { key: "title", label: "Title" },
  { key: "username", label: "Username" },
  { key: "position", label: "Position" },
  { key: "pronouns", label: "Pronouns" },
  { key: "location", label: "Location" },
  { key: "email", label: "Email", type: "email" },
];

export function AboutSection() {
  const { user, refresh } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>(
    buildFormData(user?.profile ?? {}, user?.username ?? "", user?.email ?? ""),
  );

  if (!user) return null;

  const handleEdit = () => {
    setForm(buildFormData(user.profile, user.username, user.email));
    setError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await updateMe({
        username: form.username,
        email: form.email,
        profile: {
          title: form.title || undefined,
          position: form.position || undefined,
          pronouns: form.pronouns || undefined,
          location: form.location || undefined,
          bio: form.bio || undefined,
          orcid: user.profile.orcid,
        },
      });
      // Update local form to match the server state
      setForm(buildFormData(updated.profile, updated.username, updated.email));
      await refresh();
      setEditing(false);
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

  const updateField = (key: keyof ProfileFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="group rounded-lg border border-border bg-panel p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold tracking-tight">
          About
        </h2>
        {!editing && (
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleEdit}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {editing ? (
        /* ── Edit mode ──────────────────────────────────────── */
        <div className="space-y-3">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted-foreground">
                {field.label}
              </span>
              <input
                type={field.type ?? "text"}
                className="input rounded-md text-[13px]"
                value={form[field.key]}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          ))}

          {/* Bio */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted-foreground">
              Bio
            </span>
            <textarea
              className="input rounded-md text-[13px]"
              rows={4}
              value={form.bio}
              onChange={(e) => updateField("bio", e.target.value)}
            />
          </label>

          {/* Save / Cancel */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="btn-ghost rounded-md px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn-ghost rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode — only bio text (fields shown in profile header) ── */
        <div>
          {user.profile.bio ? (
            <p className="text-[13px] leading-relaxed text-foreground">
              {user.profile.bio}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No bio yet. Click Edit to add one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
