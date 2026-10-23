import { type ReactNode, useEffect, useState } from "react";
import { LoadingScreen } from "../user/LoadingScreen";
import { startFrontendBoot } from "./boot";

export type { ModModule } from "./boot";
export { manifestForModule, parseJsonManifest, topologicalSort } from "./boot";

interface ModLoaderProps {
  children: ReactNode;
}

/** Shell presentation for the page-lifetime frontend boot state. */
export function ModLoader({ children }: ModLoaderProps) {
  const [outcome, setOutcome] = useState<
    { state: "ready" } | { state: "failed"; cause: unknown }
  >();

  useEffect(() => {
    let mounted = true;
    void startFrontendBoot().then(
      () => { if (mounted) setOutcome({ state: "ready" }); },
      (cause: unknown) => { if (mounted) setOutcome({ state: "failed", cause }); },
    );
    return () => { mounted = false; };
  }, []);

  if (outcome?.state === "ready") return <>{children}</>;
  if (outcome?.state === "failed") {
    return (
      <div role="alert">
        Helix could not start. {outcome.cause instanceof Error ? outcome.cause.message : "Unknown boot failure."}
      </div>
    );
  }
  return <LoadingScreen />;
}
