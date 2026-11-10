// PROTOTYPE, throwaway. Small pieces every variant may use (header widgets, bulk toolbar). No shared layout on purpose.
import { useState } from 'react';
import { Button, ToggleButton, Toolbar, ToolbarDivider, Input, Tooltip } from '@fluentui/react-components';
import { Add16Regular, Copy16Regular, Delete16Regular, EyeOff16Regular, Eye16Regular, ArrowSort16Regular, Search16Regular, ShieldKeyhole20Filled } from '@fluentui/react-icons';
import { useT } from './i18n';
import { useStore } from './store';

export const Brand = () => <span className="brand"><ShieldKeyhole20Filled /> nsgfw</span>;
export function LangSwitch() {
  const { lang, setLang } = useT();
  return <span className="lang">{(['en', 'de'] as const).map(l => <ToggleButton key={l} size="small" appearance="subtle" checked={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</ToggleButton>)}</span>;
}
export const Me = () => <span className="me" title="Signed in with Entra ID">you · editor, approver</span>;

export function BulkBar({ sel, onMoveTo, quick, setQuick, children }: { sel: string[]; onMoveTo: (ids: string[]) => void; quick: string; setQuick: (q: string) => void; children?: React.ReactNode }) {
  const s = useStore(); const { t } = useT();
  return (
    <Toolbar size="small" className="toolbar">
      <Button size="small" appearance="primary" icon={<Add16Regular />} onClick={() => s.addRule(sel[0])}>{t('New Rule')}</Button>
      <ToolbarDivider />
      <Tooltip content={t('Clone')} relationship="label"><Button size="small" icon={<Copy16Regular />} disabled={!sel.length} onClick={() => s.clone(sel)} /></Tooltip>
      <Tooltip content={t('Enable')} relationship="label"><Button size="small" icon={<Eye16Regular />} disabled={!sel.length} onClick={() => s.setEnabled(sel, true)} /></Tooltip>
      <Tooltip content={t('Disable')} relationship="label"><Button size="small" icon={<EyeOff16Regular />} disabled={!sel.length} onClick={() => s.setEnabled(sel, false)} /></Tooltip>
      <Tooltip content={t('Move to…')} relationship="label"><Button size="small" icon={<ArrowSort16Regular />} disabled={!sel.length} onClick={() => onMoveTo(sel)} /></Tooltip>
      <Tooltip content={t('Delete')} relationship="label"><Button size="small" icon={<Delete16Regular />} disabled={!sel.length} onClick={() => s.remove(sel)} /></Tooltip>
      {sel.length > 0 && <span className="muted">{sel.length} {t('selected')}</span>}
      <ToolbarDivider />
      <Input size="small" style={{ width: 320 }} contentBefore={<Search16Regular />} placeholder={t('Search Rules, objects, Rule IDs, tickets…')} value={quick} onChange={(_, d) => setQuick(d.value)} />
      {children}
    </Toolbar>
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
