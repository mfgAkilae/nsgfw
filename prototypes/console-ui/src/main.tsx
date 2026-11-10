// PROTOTYPE, throwaway. Three console variants of issue 25, switchable via ?variant=A|B|C (and ?lang=de).
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import { theme } from './theme';
import { LangProvider } from './i18n';
import { StoreProvider, useStore, Scenario } from './store';
import { perfBus } from './bits';
import VariantA, { name as nameA } from './variants/A';
import VariantB, { name as nameB } from './variants/B';
import VariantC, { name as nameC } from './variants/C';
import './app.css';

const variants = { A: [VariantA, nameA], B: [VariantB, nameB], C: [VariantC, nameC] } as const;
type Key = keyof typeof variants;
const keys = Object.keys(variants) as Key[];

function PrototypeSwitcher({ current, set }: { current: Key; set: (k: Key) => void }) {
  const s = useStore(); const [perf, setPerf] = useState('');
  useEffect(() => { const h = (e: Event) => setPerf((e as CustomEvent).detail); perfBus.addEventListener('ready', h); return () => perfBus.removeEventListener('ready', h); }, []);
  const step = (d: number) => set(keys[(keys.indexOf(current) + d + keys.length) % keys.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.ag-root'))) return;
      if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="proto-bar">
      <button onClick={() => step(-1)} aria-label="previous variant">←</button>
      <span><b>{current}</b> {variants[current][1]}</span>
      <button onClick={() => step(1)} aria-label="next variant">→</button>
      <span className="sep" />
      <label>scenario <select value={s.scenario} onChange={e => s.setScenario(e.target.value as Scenario)}>
        <option value="auto">write order from edits</option><option value="crossing">force Crossing flows</option><option value="unorderable">force cannot be ordered</option>
      </select></label>
      {perf && <><span className="sep" /><span>{perf}</span></>}
    </div>
  );
}

function App() {
  const [v, setV] = useState<Key>(() => { const p = new URLSearchParams(location.search).get('variant') as Key; return keys.includes(p) ? p : 'A'; });
  const set = (k: Key) => { const u = new URL(location.href); u.searchParams.set('variant', k); history.replaceState(null, '', u); setV(k); };
  const V = variants[v][0];
  return <><V key={v} />{(import.meta.env.DEV || import.meta.env.VITE_PROTOTYPE_BAR) && <PrototypeSwitcher current={v} set={set} />}</>;
}

createRoot(document.getElementById('root')!).render(
  <FluentProvider theme={theme} style={{ height: '100%' }}><LangProvider><StoreProvider><App /></StoreProvider></LangProvider></FluentProvider>,
);
