import { ArrowUp, Folder } from "lucide-react";
import { IconButton } from "../primitives/IconButton";

export interface BreadcrumbSegment {
  label: string;
  /** If set, the segment renders as a clickable link navigating to this path.
   *  If undefined, the segment is the current (last) item — bold, not clickable. */
  path?: string;
}

export interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
  onNavigate: (path: string) => void;
  onUp: () => void;
}

function Breadcrumbs({ segments, onNavigate, onUp }: BreadcrumbsProps) {
  const atRoot = segments.length === 0;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb path">
      <IconButton
        onClick={onUp}
        disabled={atRoot}
        aria-label="Go up"
        title="Go up"
      >
        <ArrowUp size={14} />
      </IconButton>
      {/* Folder icon preceding the path — matches prototype */}
      <Folder
        size={13}
        className="breadcrumb-folder-icon"
        aria-hidden="true"
      />
      <span
        className={`breadcrumb-seg${atRoot ? " is-current" : ""}`}
        onClick={() => !atRoot && onNavigate("")}
      >
        root
      </span>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="breadcrumb-seg-wrap">
            <span className="breadcrumb-sep">/</span>
            {isLast ? (
              <span className="breadcrumb-seg is-current">
                {seg.label}
              </span>
            ) : (
              <span
                className="breadcrumb-seg"
                onClick={() => seg.path && onNavigate(seg.path)}
              >
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
