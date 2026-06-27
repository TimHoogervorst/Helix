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
      >
        &gt;
      </button>
    </div>
  );
}

export default ConsoleCollapsedStrip;
