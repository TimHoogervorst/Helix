import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import { Activity } from "../../../shell/src/shared/components/Activity";
import { useLimsActivity } from "../hooks/useActivity";

/** Fetch-only activity feed for the entity workspace. */
export function ActivityFeedBlock({ context }: BlockComponentProps) {
  const activity = useLimsActivity(context.entityId);

  return (
    <Activity
      actions={activity.items}
      isLoading={activity.isLoading}
      error={activity.error}
      onRetry={activity.refetch}
      hasMore={activity.hasMore}
      onLoadMore={activity.loadMore}
      isLoadingMore={activity.isLoadingMore}
    />
  );
}
