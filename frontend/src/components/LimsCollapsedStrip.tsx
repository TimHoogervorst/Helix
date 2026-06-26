interface LimsCollapsedStripProps {
  onExpand: () => void;
}

function LimsCollapsedStrip({ onExpand }: LimsCollapsedStripProps) {
  return (
    <div className="lims-collapsed-strip">
      <button
        className="lims-collapsed-strip-btn"
        onClick={onExpand}
        title="Expand entity list"
      >
        &gt;
      </button>
    </div>
  );
}

export default LimsCollapsedStrip;
