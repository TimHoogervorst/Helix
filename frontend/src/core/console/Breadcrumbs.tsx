import { ArrowUp } from "lucide-react";

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
  onUp: () => void;
}

function Breadcrumbs({ path, onNavigate, onUp }: BreadcrumbsProps) {
  const segments = path.split("/").filter(Boolean);

  return (
    <nav className="library-breadcrumbs" aria-label="Library path">
      <button
        className="library-breadcrumb-btn"
        onClick={onUp}
        disabled={segments.length === 0}
        title="Go up"
        aria-label="Go up"
      >
        <ArrowUp size={18} />
      </button>
      <span
        className={`library-breadcrumb-seg${segments.length === 0 ? " is-current" : ""}`}
        onClick={() => onNavigate("")}
      >
        root
      </span>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const segPath = `/${segments.slice(0, i + 1).join("/")}`;
        return (
          <span key={i} className="library-breadcrumb-seg-wrap">
            <span className="library-breadcrumb-sep">/</span>
            {isLast ? (
              <span className="library-breadcrumb-seg is-current">
                {seg}
              </span>
            ) : (
              <span
                className="library-breadcrumb-seg"
                onClick={() => onNavigate(segPath)}
              >
                {seg}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
