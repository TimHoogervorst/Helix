/**
 * Pure function implementing the contiguous-left cascade rule for column locking.
 *
 * ## Rules
 *
 * - Locking a column at index N locks all columns at indices 0..N.
 * - Unlocking a column at index N unlocks N and all columns to its right.
 * - Columns to the left of N that were independently locked stay locked.
 * - The result is always a contiguous block of locked columns from the left edge.
 */

export type LockedState = Set<number>;

/**
 * Apply the lock cascade rule when toggling a column's locked state.
 *
 * @param lockedIndices - The current set of locked column indices.
 * @param index - The column index being toggled.
 * @returns A new Set of locked column indices after applying the cascade rule.
 */
export function applyLockCascade(
  lockedIndices: LockedState,
  index: number,
): LockedState {
  const isCurrentlyLocked = lockedIndices.has(index);
  const next = new Set(lockedIndices);

  if (isCurrentlyLocked) {
    // Unlocking: remove this column and ALL columns to its right.
    // Columns to the left that were independently locked stay locked.
    for (const i of next) {
      if (i >= index) next.delete(i);
    }
  } else {
    // Locking: lock this column and ALL columns to its left (0..N).
    for (let i = 0; i <= index; i++) {
      next.add(i);
    }
  }

  return next;
}

/**
 * Check if a column at the given index is locked.
 */
export function isColumnLocked(
  lockedIndices: LockedState,
  index: number,
): boolean {
  return lockedIndices.has(index);
}

/**
 * Get the count of locked columns (the contiguous block from index 0).
 */
export function getLockedCount(lockedIndices: LockedState): number {
  let count = 0;
  while (lockedIndices.has(count)) {
    count++;
  }
  return count;
}
