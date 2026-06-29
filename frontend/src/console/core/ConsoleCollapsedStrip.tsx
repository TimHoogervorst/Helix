import { Maximize2 } from "lucide-react";

interface ConsoleCollapsedStripProps {
  onExpand: () => void;
  /** Accessible title for the expand button. */
  title: string;
}

function ConsoleCollapsedStrip({ onExpand, title }: ConsoleCollapsedStripProps) {
  return (
    <div className="console-collapsed-strip">
      <button
        className="console-collapsed-strip-btn"
        onClick={onExpand}
        title={title}
        aria-label={title}
      >
        <Maximize2 size={18} />
      </button>
    </div>
  );
}

export default ConsoleCollapsedStrip;
