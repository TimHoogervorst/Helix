import type { ComponentType } from "react";
import { Star } from "lucide-react";
import type { LibraryEntryItem } from "../../core-mods/library/types";
import type {
  PropertyField,
  LibraryCardProps,
} from "../../core/mod-system/types";
import { Avatar, getInitials } from "../Avatar";
import { StatusBadge } from "./StatusBadge";
import { TagPill } from "../../core-mods/tags/ui/TagPill";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BaseCardProps {
  /** The library entry data to render. */
  item: LibraryEntryItem;
  /** Current view mode controlling which fields are visible. */
  viewMode: "list" | "grid" | "compact";
  /** Whether this card is selected. */
  isSelected: boolean;
  /** Icon component from the library item registration. */
  icon: ComponentType<any>;
  /** Mod-provided card content component. */
  listCard: ComponentType<LibraryCardProps>;
  /** Which property fields to render as inline metadata. */
  propertyFields?: PropertyField[];
  /** Show the description field. Default false. */
  showDescription?: boolean;
  /** Show tag chips. Default false. */
  showTags?: boolean;
  /** Show relative updated time. Default false. */
  showUpdatedAt?: boolean;
  /** Called when the card body is clicked. */
  onClick?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return a human-readable relative time string.
 * E.g. "2h ago", "3d ago", "just now".
 */
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Format a property field value for display. */
function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined) return "—"; // em dash
  return String(value);
}

// ── Component ──────────────────────────────────────────────────────────────

export function BaseCard({
  item,
  viewMode,
  isSelected,
  icon: Icon,
  listCard: ListCard,
  propertyFields,
  showDescription = false,
  showTags = false,
  showUpdatedAt = false,
  onClick,
}: BaseCardProps) {
  const classNames = [
    "base-library-card",
    `view-${viewMode}`,
    isSelected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      data-testid="base-library-card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* ── Star button (placeholder) ──────────────────────────────── */}
      <button
        className="star-button"
        data-testid="star-button"
        aria-label="Star this entry"
        type="button"
        onClick={(e) => e.stopPropagation()}
      >
        <Star size={16} />
      </button>

      {/* ── Icon ──────────────────────────────────────────────────── */}
      <span className="card-icon">
        <Icon />
      </span>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="card-body">
        {/* Mandatory fields */}
        <div className="card-header">
          <span className="card-display-id">{item.display_id}</span>
          <StatusBadge status={item.status} />
          <span className="card-title">{item.title}</span>
        </div>

        {/* Optional: description */}
        {showDescription && (
          <p className="card-description">
            {item.description || "No description"}
          </p>
        )}

        {/* Property fields metadata row */}
        {propertyFields && propertyFields.length > 0 && (
          <div className="card-metadata" data-testid="property-fields">
            {propertyFields.map((field, i) => (
              <span key={field.key}>
                {i > 0 && <span className="metadata-sep"> · </span>}
                <span className="metadata-value">
                  {formatPropertyValue(
                    (item.property_fields as Record<string, unknown>)[
                      field.key
                    ],
                  )}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Optional: relative updated time */}
        {showUpdatedAt && (
          <span className="card-updated" data-testid="updated-at">
            Updated {relativeTime(item.updated_at)}
          </span>
        )}

        {/* Optional: tag pills */}
        {showTags && (
          <div className="card-tags">
            {item.tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        {/* Mod-specific content */}
        <ListCard item={item as unknown as Record<string, unknown>} viewMode={viewMode} isSelected={isSelected} />
      </div>

      {/* ── Owner ─────────────────────────────────────────────────── */}
      {item.author_info && (
        <div className="card-owner">
          <Avatar
            initials={getInitials(item.author_info)}
            color={item.author_info.color}
            size="sm"
          />
          {item.author_info.username}
        </div>
      )}
    </div>
  );
}
