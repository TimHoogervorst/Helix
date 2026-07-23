import { describe, it, expect } from "vitest";
import {
  applyLockCascade,
  isColumnLocked,
  getLockedCount,
} from "../hub/columnLock";
import type { LockedState } from "../hub/columnLock";

// ── Helpers ────────────────────────────────────────────────────────────

/** Create a LockedState from a list of indices. */
function locked(...indices: number[]): LockedState {
  return new Set(indices);
}

/** Convert LockedState to sorted array for easier assertions. */
function sorted(state: LockedState): number[] {
  return Array.from(state).sort((a, b) => a - b);
}

// ── applyLockCascade ────────────────────────────────────────────────────

describe("applyLockCascade", () => {
  describe("locking (adding a lock)", () => {
    it("locking column 0 when nothing is locked → locks [0]", () => {
      const result = applyLockCascade(locked(), 0);
      expect(sorted(result)).toEqual([0]);
    });

    it("locking column 2 when nothing is locked → locks [0, 1, 2]", () => {
      const result = applyLockCascade(locked(), 2);
      expect(sorted(result)).toEqual([0, 1, 2]);
    });

    it("locking column at index N locks all columns 0..N (contiguous-left cascade)", () => {
      const result = applyLockCascade(locked(), 4);
      expect(sorted(result)).toEqual([0, 1, 2, 3, 4]);
    });

    it("locking column 3 when 0 is already locked → locks [0, 1, 2, 3]", () => {
      const result = applyLockCascade(locked(0), 3);
      expect(sorted(result)).toEqual([0, 1, 2, 3]);
    });

    it("locking column 5 when [0, 1] are already locked → locks [0, 1, 2, 3, 4, 5]", () => {
      const result = applyLockCascade(locked(0, 1), 5);
      expect(sorted(result)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("toggling an already locked column unlocks it (toggle behavior)", () => {
      // Since it's a toggle: clicking locked column 1 unlocks it and all
      // columns to its right (cascade), keeping 0 locked.
      const initial = locked(0, 1, 2);
      const result = applyLockCascade(initial, 1);
      expect(sorted(result)).toEqual([0]);
    });

    it("locking the last column locks everything", () => {
      const result = applyLockCascade(locked(), 6);
      expect(sorted(result)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe("unlocking (removing a lock)", () => {
    it("unlocking column 0 when only [0] is locked → unlocks everything", () => {
      const result = applyLockCascade(locked(0), 0);
      expect(sorted(result)).toEqual([]);
    });

    it("unlocking column 2 when [0, 1, 2] are locked → unlocks [2] and keeps [0, 1]", () => {
      const result = applyLockCascade(locked(0, 1, 2), 2);
      // Wait — unlocking N unlocks N and all to its right.
      // So unlocking index 2 deletes 2, 3, 4, 5, 6 — but only 2 was locked.
      // Result: [0, 1] stay locked.
      expect(sorted(result)).toEqual([0, 1]);
    });

    it("unlocking column 0 when all columns are locked → unlocks everything", () => {
      const result = applyLockCascade(
        locked(0, 1, 2, 3, 4, 5, 6),
        0,
      );
      expect(sorted(result)).toEqual([]);
    });

    it("unlocking column N unlocks N and all to its right, preserving independent locks to the left", () => {
      // [0, 1, 2] all locked. Unlock column 1 → should remove 1,2,3,4,5,6
      // but only 1 and 2 were in the set. Result: [0]
      const result = applyLockCascade(locked(0, 1, 2), 1);
      expect(sorted(result)).toEqual([0]);
    });

    it("unlocking column N when left columns were independently locked preserves them", () => {
      // Scenario: 0, 1 were locked. Then user locked 3 → cascade locks 0,1,2,3.
      // (Actually: locking 3 when 0,1 locked adds 2,3 to the set.)
      // Then user unlocks 2 → unlocks 2,3,4,5,6. 0,1 stay.
      const afterLock = applyLockCascade(locked(0, 1), 3);
      expect(sorted(afterLock)).toEqual([0, 1, 2, 3]);

      const afterUnlock = applyLockCascade(afterLock, 2);
      expect(sorted(afterUnlock)).toEqual([0, 1]);
    });

    it("toggling an unlocked column locks it with cascade (toggle behavior)", () => {
      // Since it's a toggle: clicking unlocked column 3 locks 0..3.
      // 0 and 1 were already locked, so 2 and 3 get added.
      const initial = locked(0, 1);
      const result = applyLockCascade(initial, 3);
      expect(sorted(result)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("contiguous-from-left invariant", () => {
    it("locked columns always form a contiguous block starting from index 0", () => {
      const states = [
        applyLockCascade(locked(), 0),
        applyLockCascade(locked(), 2),
        applyLockCascade(locked(0, 1, 2), 1), // unlock mid
        applyLockCascade(locked(0, 1, 2, 3), 3), // unlock rightmost
        applyLockCascade(locked(0, 1), 4),
        applyLockCascade(locked(0, 1, 2, 3, 4, 5, 6), 2),
      ];

      for (const state of states) {
        const sorted_indices = sorted(state);
        if (sorted_indices.length === 0) {
          // Empty is valid
          continue;
        }
        // Must start at 0
        expect(sorted_indices[0]).toBe(0);
        // Must be contiguous
        for (let i = 1; i < sorted_indices.length; i++) {
          expect(sorted_indices[i]).toBe(sorted_indices[i - 1] + 1);
        }
      }
    });
  });
});

// ── isColumnLocked ──────────────────────────────────────────────────────

describe("isColumnLocked", () => {
  it("returns true when the index is in the locked set", () => {
    expect(isColumnLocked(locked(0, 1, 2), 1)).toBe(true);
  });

  it("returns false when the index is not in the locked set", () => {
    expect(isColumnLocked(locked(0, 1), 3)).toBe(false);
  });
});

// ── getLockedCount ──────────────────────────────────────────────────────

describe("getLockedCount", () => {
  it("returns 0 when nothing is locked", () => {
    expect(getLockedCount(locked())).toBe(0);
  });

  it("returns the count of contiguous locked columns from index 0", () => {
    expect(getLockedCount(locked(0, 1, 2))).toBe(3);
  });

  it("only counts from index 0 contiguously", () => {
    // This shouldn't happen with the cascade rule, but the function
    // checks contiguously from 0
    expect(getLockedCount(locked(0, 1, 3))).toBe(2); // gap at 2
  });
});
