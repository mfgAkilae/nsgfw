// PROTOTYPE, throwaway. The Rule editor in the side panel: every field of one Rule in one place, with where it lands in Azure
// and what to fix before Submit. An edit lands in the current Change set at once; there is no Save.
import { useEffect, useRef, useState } from 'react';
import { Button, Switch } from '@fluentui/react-components';
import { Add12Regular, ArrowRight12Filled, Checkmark12Filled, Dismiss12Filled, Dismiss12Regular, Copy16Regular, Delete16Regular, ArrowSort16Regular, FolderArrowRight16Regular, Folder16Regular,
  Warning16Filled, ShieldError16Filled, PeopleSwap16Regular, LayerDiagonal16Regular, Info16Regular, ErrorCircle16Filled } from '@fluentui/react-icons';
import { useStore, placement, cost, alsoChanged } from './store';
import { zoneById, ref, svcById, Rule } from './data';
import { ObjectPicker } from './ObjectPicker';
import { Glyph } from './Glyph';
import { compact } from './RuleGrid';
import { layerWarn, hitsView } from './zonedata';
import { useT } from './i18n';
import { RulePolicy } from './Policy';
import { useFlow } from './flow';

// A field that looks like text until you touch it. Enter or leaving commits, Escape reverts.
function EditText({ value, onCommit, className, placeholder, multiline, select, type }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean; select?: boolean; type?: string }) {
  const [v, setV] = useState(value); const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null); const skip = useRef(false);
  useEffect(() => setV(value), [value]);
  useEffect(() => { if (select) setTimeout(() => { el.current?.focus(); el.current?.select(); }, 60); }, [select]);
  const props = { ref: el, className: `efield ${className ?? ''}`, placeholder, value: v, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => { if (skip.current) { skip.current = false; setV(value); return; } if (v !== value) onCommit(v); },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.key === 'Enter' && !multiline) e.currentTarget.blur(); if (e.key === 'Escape') { skip.current = true; e.currentTarget.blur(); } } };
  return multiline ? <textarea rows={2} {...props} /> : <input type={type ?? 'text'} {...props} />;
}

export function RuleEditor({ id, fresh, onMoveTo, onMoveToFolder, onZone, onObject }: { id: string | null; fresh?: string | null; onMoveTo: (ids: string[]) => void; onMoveToFolder: (ids: string[]) => void; onZone: (zid: string) => void; onObject?: (id: string) => void }) {
  const s = useStore(); const { t } = useT(); const [adding, setAdding] = useState<null | 'src' | 'dst' | 'svc'>(null); const small = useFlow().small;
  useEffect(() => setAdding(null), [id]);
  const r = id ? s.rules.find(x => x.id === id) : undefined;
  if (!r) return <div className="empty"><b>{t('No Rule selected')}</b><p>{t('Open a Rule to edit every field in one place and see what it becomes in Azure.')}</p></div>;
  const set = (f: keyof Rule, v: unknown) => s.editField(r.id, f, v);
  const pl = placement(r); const c = cost(r); const also = alsoChanged.get(r.id); const del = !!s.status.get(r.id)?.deleted; const folder = s.folders.find(f => f.id === r.folder);
  const srcCov = [...new Set(r.src.flatMap(x => ref(x).cov))];
  const whyOut = !pl.src.length ? null : r.action === 'deny' ? 'Deny Rules land on both sides.' : pl.dst.length ? 'These Zones have a strict Egress posture.' : 'The destination lies outside every Zone, so the source side decides.';

  const group = (field: 'src' | 'dst' | 'svc', label: string) => { const svc = field === 'svc'; const ids = r[field]; return (<>
    <div className="flowsep">{field === 'dst' && <ArrowRight12Filled />}{t(label)}<span className="sp" />
      <button className={`addb ${adding === field ? 'on' : ''}`} onClick={() => setAdding(adding === field ? null : field)}>{adding === field ? t('Done') : <><Add12Regular />{t('Add')}</>}</button></div>
    {ids.map(x => { const o = svc ? { name: svcById.get(x)?.name ?? x, kind: 'svc' as const, value: svcById.get(x)?.value ?? '', cov: [] as string[] } : ref(x); return (
      <div key={x} className={`orow t-${o.kind}`}><Glyph kind={o.kind} />{!svc && o.kind !== 'zone' && o.kind !== 'any' && onObject ? <b className="olink" title={t('Open in the object editor')} onClick={() => onObject(x)}>{o.name}</b> : <b>{o.name}</b>}<span className="mono">{o.kind === 'vnet' || o.kind === 'group' ? '' : o.value}</span>
        {!svc && (o.kind === 'zone' ? <a className="link" onClick={() => onZone(x.slice(5))}>{t('open Zone')}</a> : <span className="cov">{o.kind === 'any' ? t('every Zone and beyond') : o.cov.length ? `${o.cov.length.toLocaleString()} ${t(o.cov.length === 1 ? 'Zone' : 'Zones')}` : t('outside every Zone')}</span>)}
        <button className="rmb" title={t('Remove')} onClick={() => { const rest = ids.filter(y => y !== x); set(field, rest.length ? rest : [svc ? 'svc-any' : 'any']); }}><Dismiss12Regular /></button></div>); })}
    {adding === field && <div className="inl-pick"><ObjectPicker value={ids} onChange={v => set(field, v.length ? v : [svc ? 'svc-any' : 'any'])} mode={svc ? 'svc' : 'addr'} autoFocus /></div>}
  </>); };

  // What to look at before Submit. Plain checks on the Rule itself, not the Policy pre-check.
  const wide = (ids: string[]) => ids.some(x => x === 'any' || x === 'tag:Internet');
  const checks: [string, JSX.Element, string][] = [];
  if (r.action === 'allow' && r.src.includes('any') && r.dst.includes('any')) checks.push(['red', <ErrorCircle16Filled />, 'This Rule allows everything from everywhere.']);
  if (r.action === 'allow' && wide(r.src) && r.svc.some(x => x === 'svc-rdp' || x === 'svc-ssh' || x === 'svc-any') && !r.dst.includes('any')) checks.push(['red', <ShieldError16Filled />, 'A management port is open from the Internet. A deny Policy finding will block Submit.']);
  if (c.nsgs > 500) checks.push(['amber', <Warning16Filled />, 'This Rule lands on very many Managed NSGs. Each one spends a rule slot on it.']);
  if (!c.nsgRules) checks.push(['amber', <Warning16Filled />, 'Neither side covers a Zone, so this Rule writes nothing.']);
  if (!r.enabled) checks.push(['info', <Info16Regular />, 'Disabled: no NSG rule is written until you enable it.']);
  if (r.name === 'New Rule') checks.push(['info', <Info16Regular />, 'Give the Rule a name that says what it is for.']);
  if (r.policy) checks.push(['red', <ShieldError16Filled />, r.policy]);
  if (r.importNote) checks.push(['amber', <Warning16Filled />, `Import note (${r.importNote}): from nsg-legacy-017, rule “allow-sql”, priority 310, inbound.`]);
  const lw = layerWarn(r);
  if (lw) checks.push([lw.sev === 'high' ? 'red' : 'amber', <LayerDiagonal16Regular />, `${t(lw.sev === 'high' ? 'High' : 'Medium')}, ${t('Security layer')}: ${lw.text}. ${lw.detail}`]);
  if (also) checks.push(['red', <PeopleSwap16Regular />, `${t('also changed in')} “${also.set}” ${t('by')} ${also.by}.`]);

  return (
    <div className={`insp ${del ? 'gone' : ''}`}>
      <div className="insp-h"><span className="no">{s.numbers.get(r.id) ?? '—'}</span><EditText className="ename" value={r.name} onCommit={v => v.trim() && set('name', v.trim())} select={fresh === r.id} placeholder={t('Name')} /></div>
      <div className="insp-s">
        <div className="seg2 actseg" role="group"><button className={r.action === 'allow' ? 'on allow' : ''} onClick={() => set('action', 'allow')}><Checkmark12Filled />{t('Allow')}</button><button className={r.action === 'deny' ? 'on deny' : ''} onClick={() => set('action', 'deny')}><Dismiss12Filled />{t('Deny')}</button></div>
        <Switch checked={r.enabled} disabled={del} onChange={(_, d) => s.setEnabled([r.id], d.checked)} label={t(r.enabled ? 'Enabled' : 'disabled')} />
      </div>
      {!small && <button className="infolder" onClick={() => onMoveToFolder([r.id])}><Folder16Regular />{folder ? folder.name : t('Not in a Folder')}</button>}

      <div className="flowbox">{group('src', 'From')}{group('dst', 'to')}{group('svc', 'on')}</div>

      <h3>{t('In Azure')}</h3>
      <p className="lead">{c.nsgRules ? <><b>{c.nsgRules.toLocaleString()} {t(c.nsgRules === 1 ? 'NSG rule' : 'NSG rules')}</b> {t('on')} <b>{c.nsgs.toLocaleString()} {t(c.nsgs === 1 ? 'Managed NSG' : 'Managed NSGs')}</b></> : t('No NSG rule: neither side covers a Zone.')}</p>
      <div className="landing">
        <div className={`side ${pl.src.length ? 'writes' : ''}`}><span className="lbl">{t('Source side')}</span>
          <b>{!srcCov.length ? t('outside every Zone') : `${srcCov.length.toLocaleString()} ${t(srcCov.length === 1 ? 'Zone' : 'Zones')}`}</b>
          <span className="verdict">{!srcCov.length ? t('Nothing to write.') : !pl.src.length ? t('No NSG rule here. Outbound is open, the destination decides.') : `${t('Outbound NSG rule on')} ${pl.src.length.toLocaleString()} ${t('of')} ${srcCov.length.toLocaleString()}. ${t(whyOut ?? '')}`}</span>
          {pl.src.slice(0, 3).map(zid => <span key={zid} className="mono">{zoneById.get(zid)!.nsg}</span>)}{pl.src.length > 3 && <span className="muted">{(pl.src.length - 3).toLocaleString()} {t('more')}</span>}</div>
        <ArrowRight12Filled className="flow" />
        <div className={`side ${pl.dst.length ? 'writes' : ''}`}><span className="lbl">{t('Destination side')}</span>
          <b>{!pl.dst.length ? t('outside every Zone') : `${pl.dst.length.toLocaleString()} ${t(pl.dst.length === 1 ? 'Zone' : 'Zones')}`}</b>
          <span className="verdict">{pl.dst.length ? t('Inbound NSG rule on each. This side decides.') : t('Nothing to write.')}</span>
          {pl.dst.slice(0, 3).map(zid => <span key={zid} className="mono">{zoneById.get(zid)!.nsg}</span>)}{pl.dst.length > 3 && <span className="muted">{(pl.dst.length - 3).toLocaleString()} {t('more')}</span>}</div>
      </div>

      {checks.length > 0 && <><h3>{t('Before you submit')}</h3>{checks.map(([tone, icon, text]) => <div key={text} className={`note ${tone}`}>{icon}{t(text)}</div>)}</>}
      <RulePolicy id={r.id} />

      <h3>{t('Details')}</h3>
      <div className="form">
        <label>{t('Ticket')}</label><EditText value={r.ticket} onCommit={v => set('ticket', v)} placeholder="CHG-0000" />
        <label>{t('Owner')}</label><EditText value={r.owner} onCommit={v => set('owner', v)} placeholder={t('Entra user or group')} />
        <label>{t('Expiry')}</label><EditText type="date" value={r.expiry ?? ''} onCommit={v => set('expiry', v || undefined)} />
        <label>{t('Comment')}</label><EditText multiline value={r.comment} onCommit={v => set('comment', v)} placeholder={t('Why this Rule exists')} />
        <label>{t('Hits')}</label><span className="ro">{hitsView(r, pl.dst.length ? pl.dst : pl.src) === 'noaccess' ? t('No access to flow data: the hits are unknown, not 0') : r.hits == null ? t('No flow data for this Rule') : `${compact(r.hits)}, ${t('data about 70 minutes old')}`}</span>
        <label>Rule ID</label><span className="ro mono">{r.id}</span>
      </div>

      <div className="insp-a"><Button size="small" icon={<Copy16Regular />} onClick={() => s.clone([r.id])}>{t('Clone')}</Button><Button size="small" icon={<ArrowSort16Regular />} onClick={() => onMoveTo([r.id])}>{t('Move to…')}</Button>
        {!small && <Button size="small" icon={<FolderArrowRight16Regular />} onClick={() => onMoveToFolder([r.id])}>{t('Folder')}</Button>}<Button size="small" icon={<Delete16Regular />} onClick={() => s.remove([r.id])}>{t('Delete')}</Button></div>
    </div>
  );
}
