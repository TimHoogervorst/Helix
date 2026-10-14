import { useState } from "react";
import { Button } from "../primitives/Button";

export interface JsonDisplayFieldProps {
  label?: string;
  value: unknown;
  className?: string;
}

/** A compact JSON value that can be expanded without losing structure. */
export function JsonDisplayField({ label, value, className = "" }: JsonDisplayFieldProps) {
  const [expanded, setExpanded] = useState(false);
  let formatted: string;
  try {
    formatted = JSON.stringify(value, null, expanded ? 2 : undefined) ?? "null";
  } catch {
    formatted = String(value);
  }
  const preview = formatted.replace(/\s+/g, " ");
  return (
    <div className={`json-display-field ${className}`} data-testid="json-display-field">
      {label && <span className="detail-label">{label}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 block max-w-full overflow-x-auto rounded border border-hairline bg-surface px-2 py-1 text-left font-[var(--font-label)] text-xs text-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <code className={expanded ? "whitespace-pre" : "whitespace-nowrap"}>
          {expanded ? formatted : preview}
        </code>
      </Button>
    </div>
  );
}

export default JsonDisplayField;
