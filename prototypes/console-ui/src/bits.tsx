// PROTOTYPE, throwaway. Small pieces every variant may use (header widgets, bulk toolbar). No shared layout on purpose.
import { useState } from 'react';
import { Button, Input } from '@fluentui/react-components';
import { Add16Regular, Copy16Regular, Delete16Regular, EyeOff16Regular, Eye16Regular, ArrowSort16Regular, Search16Regular } from '@fluentui/react-icons';
import { useT } from './i18n';
import { useStore } from './store';

// The mark: a tile with an ordered stack of rules, two allow edges and one deny edge.
export const Brand = () => (
  <span className="brand">
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#2f4fd0" />
      <rect x="5" y="6" width="14" height="3" rx="1.5" fill="#fff" /><rect x="5" y="10.5" width="11" height="3" rx="1.5" fill="#fff" opacity=".85" /><rect x="5" y="15" width="8" height="3" rx="1.5" fill="#fff" opacity=".7" />
      <rect x="5" y="6" width="3" height="3" rx="1.5" fill="#3fdc8f" /><rect x="5" y="10.5" width="3" height="3" rx="1.5" fill="#3fdc8f" /><rect x="5" y="15" width="3" height="3" rx="1.5" fill="#ff7a7f" />
    </svg>nsgfw
  </span>
);
// Header navigation and pickers drawn for the dark bar (Fluent tabs and dropdowns assume a light surface).
export function HeaderNav({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <nav className="hnav">{items.map(([k, label]) => <button key={k} className={value === k ? 'on' : ''} aria-current={value === k} onClick={() => onChange(k)}>{label}</button>)}</nav>;
}
export function LangSwitch() {
  const { lang, setLang } = useT();
  return <span className="seg" role="group" aria-label="Language">{(['en', 'de'] as const).map(l => <button key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</span>;
}
export const Me = () => <span className="avatar" title="You, signed in with Entra ID: editor and approver">YO</span>;

export function BulkBar({ sel, onMoveTo, quick, setQuick, children }: { sel: string[]; onMoveTo: (ids: string[]) => void; quick: string; setQuick: (q: string) => void; children?: React.ReactNode }) {
  const s = useStore(); const { t } = useT(); const none = !sel.length;
  return (
    <div className="toolbar" role="toolbar">
      <Button size="small" appearance="primary" icon={<Add16Regular />} onClick={() => s.addRule(sel[0])}>{t('New Rule')}</Button>
      <Input size="small" className="search" contentBefore={<Search16Regular />} placeholder={t('Search Rules, objects, Rule IDs, tickets…')} value={quick} onChange={(_, d) => setQuick(d.value)} />
      <Button size="small" appearance="subtle" icon={<Copy16Regular />} disabled={none} onClick={() => s.clone(sel)}>{t('Clone')}</Button>
      <Button size="small" appearance="subtle" icon={<Eye16Regular />} disabled={none} onClick={() => s.setEnabled(sel, true)}>{t('Enable')}</Button>
      <Button size="small" appearance="subtle" icon={<EyeOff16Regular />} disabled={none} onClick={() => s.setEnabled(sel, false)}>{t('Disable')}</Button>
      <Button size="small" appearance="subtle" icon={<ArrowSort16Regular />} disabled={none} onClick={() => onMoveTo(sel)}>{t('Move to…')}</Button>
      <Button size="small" appearance="subtle" icon={<Delete16Regular />} disabled={none} onClick={() => s.remove(sel)}>{t('Delete')}</Button>
      {sel.length > 0 && <span className="selinfo">{sel.length} {t('selected')}</span>}
      <span className="spacer" />
      {children}
    </div>
  );
}

export function useDebounced(initial = '') {
  const [v, setV] = useState(initial); const [d, setD] = useState(initial);
  const set = (x: string) => { setV(x); clearTimeout((set as any).h); (set as any).h = setTimeout(() => setD(x), 200); };
  return [v, d, set] as const;
}

// Tiny bus so the prototype bar can show how long the grid took.
export const perfBus = new EventTarget();
export const reportReady = (what: string) => (ms: number) => perfBus.dispatchEvent(new CustomEvent('ready', { detail: `${what}: first render ${ms} ms` }));
