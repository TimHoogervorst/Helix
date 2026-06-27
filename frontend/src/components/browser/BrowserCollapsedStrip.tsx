interface BrowserCollapsedStripProps {
  onExpand: () => void;
  /** Accessible title for the expand button. */
  title: string;
}

function BrowserCollapsedStrip({ onExpand, title }: BrowserCollapsedStripProps) {
  return (
    <div className="browser-collapsed-strip">
      <button
        className="browser-collapsed-strip-btn"
        onClick={onExpand}
        title={title}
      >
        &gt;
      </button>
    </div>
  );
}

export default BrowserCollapsedStrip;
