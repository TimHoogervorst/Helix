import type { ReactNode } from "react";

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
    <div className="library-view-toggle-group" role="group" aria-label="View toggle">
      {segments.map((segment) => (
        <button
          key={segment.value}
          className={`library-view-toggle${segment.value === value ? " is-active" : ""}`}
          type="button"
          onClick={() => onChange(segment.value)}
          aria-pressed={segment.value === value}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
