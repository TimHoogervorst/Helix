interface LibraryCollapsedStripProps {
  onExpand: () => void;
}

function LibraryCollapsedStrip({ onExpand }: LibraryCollapsedStripProps) {
  return (
    <div className="library-collapsed-strip">
      <button
        className="library-collapsed-strip-btn"
        onClick={onExpand}
        title="Back to detail"
      >
        &gt;
      </button>
    </div>
  );
}

export default LibraryCollapsedStrip;
