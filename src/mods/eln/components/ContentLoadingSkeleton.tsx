/**
 * ContentLoadingSkeleton — placeholder rendered while a Notebook Entry loads.
 *
 * Displays pulsing lines with a left-to-right shimmer animation. Takes no props,
 * has no state, and has no access to the event bus — purely visual feedback.
 *
 * Rendered by ElnWorkspace when editorState.isReady is false. Once isReady
 * transitions to true, the skeleton unmounts and TipTapRenderer mounts once
 * with the complete entry content.
 *
 * #366 — Content-Sync Race Elimination spec
 * #368 — Implementation issue
 */

/**
 * A single pulsing skeleton line.
 *
 * The shimmer effect is driven by the parent container's
 * .content-loading-skeleton class, which isolates the animation scope
 * so the pseudo-element sweep doesn't bleed into unrelated elements.
 */
function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="skeleton-line rounded-sm"
      style={{ width, height: "14px" }}
    />
  );
}

function ContentLoadingSkeleton() {
  return (
    <div
      className="content-loading-skeleton max-w-3xl mx-auto"
      data-testid="content-loading-skeleton"
    >
      {/* Title placeholder */}
      <SkeletonLine width="55%" />
      <div style={{ height: "8px" }} />

      {/* Description placeholder */}
      <SkeletonLine width="80%" />
      <div style={{ height: "4px" }} />
      <SkeletonLine width="70%" />
      <div style={{ height: "24px" }} />

      {/* Hairline divider placeholder */}
      <div className="my-6 h-px bg-hairline" />

      {/* Body content placeholders */}
      <SkeletonLine width="95%" />
      <div style={{ height: "10px" }} />
      <SkeletonLine width="88%" />
      <div style={{ height: "10px" }} />
      <SkeletonLine width="92%" />
      <div style={{ height: "10px" }} />
      <SkeletonLine width="60%" />
      <div style={{ height: "10px" }} />
      <SkeletonLine width="75%" />
      <div style={{ height: "10px" }} />
      <SkeletonLine width="40%" />
    </div>
  );
}

export default ContentLoadingSkeleton;
