import type { ReactNode } from "react";
import { TabBar } from "../primitives/TabBar";

export interface ViewToggleSegment {
  value: string;
  label: ReactNode;
}

interface SettingsViewToggleProps {
  segments: ViewToggleSegment[];
  value: string;
  onChange: (value: string) => void;
}

export function SettingsViewToggle({
  segments,
  value,
  onChange,
}: SettingsViewToggleProps) {
  return (
    <TabBar
      tabs={segments.map((s) => ({ id: s.value, label: s.label }))}
      activeTab={value}
      onTabChange={onChange}
    />
  );
}
