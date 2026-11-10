// PROTOTYPE, throwaway. Small shared pieces.
import { useState } from 'react';

// The mark: an ordered stack of rules, two allow edges and one deny edge.
export const Brand = () => (
  <span className="brand" title="nsgfw">
    <svg width="34" height="34" viewBox="0 0 34 34" aria-label="nsgfw">
      <rect width="34" height="34" rx="9" fill="var(--accent)" />
      <rect x="8" y="9" width="18" height="4" rx="2" fill="#fff" /><rect x="8" y="15" width="14" height="4" rx="2" fill="#fff" opacity=".8" /><rect x="8" y="21" width="10" height="4" rx="2" fill="#fff" opacity=".6" />
      <rect x="8" y="9" width="4" height="4" rx="2" fill="#56e3a0" /><rect x="8" y="15" width="4" height="4" rx="2" fill="#56e3a0" /><rect x="8" y="21" width="4" height="4" rx="2" fill="#ff8a8f" />
    </svg>
  </span>
);

export function useDebounced(initial = '') {
  const [v, setV] = useState(initial); const [d, setD] = useState(initial);
  const set = (x: string) => { setV(x); clearTimeout((set as any).h); (set as any).h = setTimeout(() => setD(x), 180); };
  return [v, d, set] as const;
}

// Tiny bus so the prototype bar can show how long the grid took.
export const perfBus = new EventTarget();
export const reportReady = (what: string) => (ms: number) => perfBus.dispatchEvent(new CustomEvent('ready', { detail: `${what}: first render ${ms} ms` }));
