// ESM shim replacing the CJS use-sync-external-store/shim/with-selector.js.
// Reimplements useSyncExternalStoreWithSelector using React 19's built-in
// useSyncExternalStore.  Direct port of the upstream implementation at
// facebook/react/packages/use-sync-external-store.
//
// @tiptap/react imports this for React 16-18 compat; aliasing to this ESM
// module avoids Vite's CJS interop failure when node_modules is outside
// the project root.
import {
  useRef,
  useEffect,
  useMemo,
  useDebugValue,
  useSyncExternalStore,
} from "react";

function is(x, y) {
  return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
}

const objectIs = typeof Object.is === "function" ? Object.is : is;

export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual,
) {
  const instRef = useRef(null);
  let inst;
  if (instRef.current === null) {
    inst = { hasValue: false, value: null };
    instRef.current = inst;
  } else {
    inst = instRef.current;
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;

    function memoizedSelector(nextSnapshot) {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value;
          if (isEqual(currentSelection, nextSelection)) {
            memoizedSelection = currentSelection;
            return currentSelection;
          }
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }
      const currentSelection = memoizedSelection;
      if (objectIs(memoizedSnapshot, nextSnapshot)) {
        return currentSelection;
      }
      const nextSelection = selector(nextSnapshot);
      if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return currentSelection;
      }
      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    }

    const maybeGetServerSnapshot =
      getServerSnapshot === undefined ? null : getServerSnapshot;

    return [
      () => memoizedSelector(getSnapshot()),
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot()),
    ];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);

  useEffect(
    () => {
      inst.hasValue = true;
      inst.value = value;
    },
    [value],
  );

  useDebugValue(value);
  return value;
}
