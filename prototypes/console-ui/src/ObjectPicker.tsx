// PROTOTYPE, throwaway. Object picker: Zones, Address objects (incl. Azure service tags) or Service objects.
import { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Input, TabList, Tab } from '@fluentui/react-components';
import { Dismiss12Regular, Search16Regular } from '@fluentui/react-icons';
import { objects, zones, services, ref, svcById, ObjKind } from './data';
import { useT } from './i18n';
import type { CustomCellEditorProps } from 'ag-grid-react';
import { Glyph } from './Glyph';

export const kindLabel: Record<ObjKind | 'svc', string> = { any: 'Any', zone: 'Zone', ip: 'Host', cidr: 'Network', tag: 'Service tag', subnet: 'Subnet', vnet: 'VNet', asg: 'ASG object', extasg: 'External ASG', group: 'Group', svc: 'Service' };

type Item = { id: string; name: string; kind: ObjKind | 'svc'; value: string; cov: number };
const addrItems: Item[] = [
  ...objects.map(o => ({ id: o.id, name: o.name, kind: o.kind, value: o.value, cov: o.cov.length })),
  ...zones.map(z => ({ id: `zone:${z.id}`, name: z.name, kind: 'zone' as const, value: `${z.prefix} · ${z.vnet}`, cov: 1 })),
];
const svcItems: Item[] = services.map(s => ({ id: s.id, name: s.name, kind: 'svc', value: s.value, cov: 0 }));
const tabs: Record<string, (k: string) => boolean> = { All: () => true, Zones: k => k === 'zone', 'Hosts & networks': k => k === 'ip' || k === 'cidr' || k === 'subnet', 'Service tags': k => k === 'tag', VNets: k => k === 'vnet', ASGs: k => k === 'asg' || k === 'extasg', Groups: k => k === 'group' };

export function Chip({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const isSvc = id.startsWith('svc');
  const r = isSvc ? { name: svcById.get(id)?.name ?? id, kind: 'svc' as const, value: svcById.get(id)?.value ?? '' } : ref(id);
  return (
    <span className={`tok t-${r.kind}`} title={`${kindLabel[r.kind]}: ${r.value}`}>
      <Glyph kind={r.kind} />{r.name}
      {onRemove && <button className="tok-x" onClick={onRemove} aria-label={`remove ${r.name}`}><Dismiss12Regular /></button>}
    </span>
  );
}

export function ObjectPicker({ value, onChange, mode, autoFocus }: { value: string[]; onChange: (v: string[]) => void; mode: 'addr' | 'svc'; autoFocus?: boolean }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) setTimeout(() => input.current?.focus(), 30); }, [autoFocus]);
  const items = mode === 'svc' ? svcItems : addrItems;
  const hits = useMemo(() => {
    const ql = q.toLowerCase(); const f = tabs[tab] ?? tabs.All; const out: Item[] = [];
    for (const it of items) { if (out.length >= 120) break; if (f(it.kind) && (!ql || it.name.toLowerCase().includes(ql) || it.value.toLowerCase().includes(ql))) out.push(it); }
    return out;
  }, [q, tab, items]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value.filter(v => v !== 'any' && v !== 'svc-any'), id]);
  return (
    <div className="picker">
      <div className="picker-sel">{value.map(id => <Chip key={id} id={id} onRemove={() => toggle(id)} />)}</div>
      <Input ref={input} contentBefore={<Search16Regular />} value={q} onChange={(_, d) => setQ(d.value)} placeholder={mode === 'svc' ? 'https, TCP 8443, svcgrp…' : 'app0042, 10.10., Storage, asg-…'} size="small" style={{ width: '100%' }} />
      {mode === 'addr' && (
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))}>
          {Object.keys(tabs).map(k => <Tab key={k} value={k}>{t(k)}</Tab>)}
        </TabList>
      )}
      <div className="picker-list">
        {hits.map(it => (
          <div key={it.id} className={`picker-row ${value.includes(it.id) ? 'on' : ''}`} onMouseDown={e => { e.preventDefault(); toggle(it.id); }}>
            <span className={`pk-kind t-${it.kind}`}><Glyph kind={it.kind} />{kindLabel[it.kind]}</span>
            <b>{it.name}</b>
            <span className="addr">{it.value}</span>
            <span className="cov">{mode === 'svc' ? '' : it.kind === 'tag' || it.kind === 'any' || (it.kind === 'cidr' && !it.cov) || it.kind === 'subnet' ? <span className="cov-none">{t('covers no Zone')}</span> : `${t('covers')} ${it.cov} ${it.cov === 1 ? t('Zone') : t('Zones')}`}</span>
          </div>
        ))}
        {hits.length >= 120 && <div className="muted" style={{ padding: 6 }}>Showing the first 120 of {items.length.toLocaleString()}. Type to narrow down.</div>}
      </div>
    </div>
  );
}

// AG Grid popup cell editor around the picker. readOnlyEdit is on, so the grid only reports the new value.
export function RefsEditor(props: CustomCellEditorProps & { mode: 'addr' | 'svc' }) {
  const { t } = useT();
  return (
    <div className="picker-pop" onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); props.stopEditing(); } }}>
      <ObjectPicker value={props.value ?? []} onChange={v => props.onValueChange(v.length ? v : [props.mode === 'svc' ? 'svc-any' : 'any'])} mode={props.mode} autoFocus />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6 }}>
        <Button size="small" onClick={() => props.stopEditing(true)}>{t('Cancel')}</Button>
        <Button size="small" appearance="primary" onClick={() => props.stopEditing()}>{t('Apply')}</Button>
      </div>
    </div>
  );
}
