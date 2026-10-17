import { useSyncExternalStore } from 'react';

/** Mini-store observable (equivalente a BehaviorSubject / signal del original). */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(next) {
      const v = typeof next === 'function' ? next(state) : next;
      if (Object.is(v, state)) return;
      state = v;
      subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
export const useStore = (store) => useSyncExternalStore(store.subscribe, store.get);
