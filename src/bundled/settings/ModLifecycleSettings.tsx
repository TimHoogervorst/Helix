import { useEffect, useState } from "react";
import { Power, RefreshCw } from "lucide-react";
import { get, post } from "../../shell/src/api/client";
import { Button } from "../../shell/src/shared/primitives/Button";
import { SettingsPageLayout } from "../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../shell/src/shared/components/SettingsSectionCard";

interface InstalledMod {
  id: string;
  displayName: string;
  version: string;
  requiresHelix: string;
  artifacts: string[];
  dependsOn: { id: string; version: string }[];
  state: string;
  desiredState: string;
  restartRequired: boolean;
  available: boolean;
}

function ModLifecycleSettings() {
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await get<{ mods: InstalledMod[] }>("/mod-lifecycle/");
      setMods(result.mods);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Mod lifecycle state.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeState = async (mod: InstalledMod) => {
    const activating = mod.desiredState !== "active";
    try {
      await post("/mod-lifecycle/", {
        modId: mod.id,
        operation: activating ? "activate" : "deactivate",
        activateDependencies: true,
        cascade: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change Mod state.");
    }
  };

  return (
    <SettingsPageLayout
      hero={
        <SettingsHeroHeader
          eyebrow="platform administration"
          title="External Mods"
          description="Review installed Mod contracts and choose which valid registrations should be enabled after the next restart."
        />
      }
    >
      {error && <p className="mb-4 text-sm text-[var(--color-destructive)]">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading installed Mods…</p>
      ) : mods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No External Mods are installed.</p>
      ) : (
        <div className="space-y-4">
          {mods.map((mod) => (
            <SettingsSectionCard key={mod.id} title={mod.displayName} subtitle={mod.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Version {mod.version} · Helix {mod.requiresHelix}</p>
                  <p>Artifacts: {mod.artifacts.join(", ")}</p>
                  <p>Dependencies: {mod.dependsOn.map((dependency) => dependency.id).join(", ") || "none"}</p>
                  <p>Current: {mod.state} · Desired: {mod.desiredState}</p>
                  {mod.restartRequired && <p className="text-[var(--color-warning)]">Restart required</p>}
                </div>
                <Button
                  variant={mod.desiredState === "active" ? "ghost" : "primary"}
                  size="sm"
                  disabled={!mod.available}
                  onClick={() => void changeState(mod)}
                >
                  <Power size={14} />
                  {mod.desiredState === "active" ? "Disable" : "Enable"}
                </Button>
              </div>
            </SettingsSectionCard>
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={() => void load()} className="mt-4">
        <RefreshCw size={14} /> Refresh
      </Button>
    </SettingsPageLayout>
  );
}

export default ModLifecycleSettings;
