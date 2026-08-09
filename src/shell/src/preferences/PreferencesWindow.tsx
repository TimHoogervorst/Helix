import { useState } from "react";
import { Palette, Pencil, Trash2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Modal } from "../shared/primitives/Modal";
import { IconButton } from "../shared/primitives/IconButton";
import { CustomizeTab } from "./CustomizeTab";

interface PreferencesWindowProps {
  open: boolean;
  onClose: () => void;
}

type TabId = "themes" | "customize";

const TABS: { id: TabId; label: string; Icon: typeof Palette }[] = [
  { id: "themes", label: "Themes", Icon: Palette },
  { id: "customize", label: "Customize", Icon: Pencil },
];

function ThemeCard({
  theme,
  isActive,
  onApply,
  onDelete,
}: {
  theme: { id: string; name: string; description: string; seeds: { background: string; surface: string; ink: string; primary: string; accent: string } };
  isActive: boolean;
  onApply: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        title={theme.description || theme.name}
        onClick={() => onApply(theme.id)}
        className={
          "flex flex-col gap-2 rounded-lg border p-3 text-left w-full transition-colors text-[var(--color-ink)] " +
          (isActive
            ? "border-[var(--color-ink-hairline)] bg-transparent hover:bg-[var(--color-surface-hover)]"
            : "border-transparent bg-transparent hover:bg-[var(--color-surface-hover)]")
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium flex-1 truncate">
            {theme.name}
          </span>
          {isActive && (
            <span className="font-[var(--font-label)] text-2xs text-[var(--color-ink-muted-foreground)] shrink-0">
              Active
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <span
            className="h-4 w-4 rounded-full border border-[var(--color-ink-hairline)] shrink-0"
            style={{ backgroundColor: theme.seeds.background }}
          />
          <span
            className="h-4 w-4 rounded-full border border-[var(--color-ink-hairline)] shrink-0"
            style={{ backgroundColor: theme.seeds.surface }}
          />
          <span
            className="h-4 w-4 rounded-full border border-[var(--color-ink-hairline)] shrink-0"
            style={{ backgroundColor: theme.seeds.ink }}
          />
          <span
            className="h-4 w-4 rounded-full border border-[var(--color-ink-hairline)] shrink-0"
            style={{ backgroundColor: theme.seeds.primary }}
          />
          <span
            className="h-4 w-4 rounded-full border border-[var(--color-ink-hairline)] shrink-0"
            style={{ backgroundColor: theme.seeds.accent }}
          />
        </div>
      </button>
      {onDelete && (
        <div className="absolute top-0.5 right-0.5">
          <IconButton
            aria-label={`Delete ${theme.name}`}
            title={`Delete ${theme.name}`}
            onClick={() => onDelete(theme.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

export function PreferencesWindow({ open, onClose }: PreferencesWindowProps) {
  const { activeThemeId, themes, applyTheme, deleteCustomTheme } = useTheme();
  const [tab, setTab] = useState<TabId>("themes");

  const builtinThemes = themes.filter((t) => !t.id.startsWith("custom-"));
  const customThemes = themes.filter((t) => t.id.startsWith("custom-"));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preferences"
      className="max-w-3xl"
    >
      <div className="flex gap-4 min-h-[300px]">
        <nav className="w-[150px] shrink-0 border-r border-[var(--color-ink-hairline)] pr-4 flex flex-col gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                "flex items-center gap-2 px-2 py-1.5 rounded-md font-[var(--font-label)] text-xs font-semibold transition-colors " +
                (tab === id
                  ? "bg-[var(--color-surface)]"
                  : "hover:bg-[var(--color-ink-subtle)]")
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {tab === "themes" ? (
            <>
              <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)] mb-3">
                Built-in themes
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {builtinThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isActive={theme.id === activeThemeId}
                    onApply={applyTheme}
                  />
                ))}
              </div>
              {customThemes.length > 0 && (
                <>
                  <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)] mb-3 mt-5">
                    Your themes
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {customThemes.map((theme) => (
                      <ThemeCard
                        key={theme.id}
                        theme={theme}
                        isActive={theme.id === activeThemeId}
                        onApply={applyTheme}
                        onDelete={deleteCustomTheme}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <CustomizeTab />
          )}
        </div>
      </div>
    </Modal>
  );
}
