// PROTOTYPE, throwaway. Issue 37: onboarding on one wide screen, like Review. Left: the subnets with their status and the choices that hold for all.
// Middle: the choices of one subnet, Import among them. Right: what lands in the Change set, with its Import notes, merge proposals and the Preview.
import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Switch } from '@fluentui/react-components';
import { Dismiss20Regular, CheckmarkCircle16Filled, ErrorCircle16Filled, Warning16Filled, Circle16Regular, Checkmark12Filled } from '@fluentui/react-icons';
import { Egress, Zone, Rule, zones, zoneById, envs, svcName } from './data';
import type { Store } from './store';
import { dnsOf, onboarded, asgWriterMissing } from './zonedata';
import { dnsRuleInit } from './ZoneDetail';
import { Glyph } from './Glyph';
import { CUR_NAME } from './flow';
import { useT } from './i18n';
import { NoteRow, Code, levelOrder, topLevel } from './ImportNote';
import { candOf, planOf, Plan, Imp, Note, LegacyRule, InhPart, inhParts, newObjects, makeObject, makeService, asgObjId, addZone, addProv, setImport, getImport, useSteps } from './importdata';
import './zone.css';
import './import.css';

type Choice = { imp: boolean; preserve: boolean; egress: Egress };
interface Out { key: string; name: string; imp: Imp; lr: LegacyRule; members: Plan[]; notes: Note[] }
interface Res { rules: Out[]; notes: { cid: string; where: string; note: Note }[]; groups: { key: string; name: string; members: Plan[] }[] }
const partLabel: Record<InhPart, string> = { 'inbound from VirtualNetwork': 'Inbound from VirtualNetwork', 'outbound to VirtualNetwork': 'Outbound to VirtualNetwork', 'outbound to Internet': 'Outbound to Internet' };
const port = (r: LegacyRule) => (r.proto === '*' && r.ports === '*' ? 'any' : `${r.proto === '*' ? 'any protocol' : r.proto.toUpperCase()} ${r.ports === '*' ? '' : r.ports}`.trim());

// What Import makes of the subnets that import: one Rule per NSG rule, merged where accepted, renamed on a name collision.
function compute(todo: Plan[], eff: (cid: string) => Choice, merged: Set<string>): Res {
  const active = todo.filter(p => p.legacy && eff(p.c.id).imp);
  const gm = new Map<string, Plan[]>();
  active.forEach(p => p.legacy!.imports.forEach(i => { if (i.merge) gm.set(i.merge, [...(gm.get(i.merge) ?? []), p]); }));
  const groups = [...gm].filter(([, m]) => m.length > 1).map(([key, members]) => ({ key, name: members[0].legacy!.imports.find(i => i.merge === key)!.from, members }));
  const rules: Out[] = []; const notes: Res['notes'] = []; const taken = new Map<string, string>();
  for (const p of active) {
    const lg = p.legacy!;
    for (const imp of lg.imports) {
      const g = imp.merge && merged.has(imp.merge) ? groups.find(x => x.key === imp.merge) : undefined;
      if (g && g.members[0] !== p) continue;
      let name = imp.from; const ns = [...imp.notes];
      if (taken.has(name)) { let k = 2; while (taken.has(`${imp.from}-${k}`)) k++; name = `${imp.from}-${k}`; ns.push({ level: 'info', text: `Renamed to ${name} on a name collision: ${imp.from} is the Rule from ${taken.get(imp.from)}.` }); }
      taken.set(name, lg.nsg);
      rules.push({ key: `${p.c.id}:${imp.from}`, name, imp, lr: lg.rules.find(r => r.name === imp.from)!, members: g ? g.members : [p], notes: ns });
      ns.forEach(note => notes.push({ cid: p.c.id, where: name, note }));
    }
    lg.dropped.forEach(d => notes.push({ cid: p.c.id, where: d.from, note: d.note }));
    lg.zoneNotes.forEach(note => notes.push({ cid: p.c.id, where: '', note }));
  }
  notes.sort((a, b) => levelOrder[a.note.level] - levelOrder[b.note.level]);
  return { rules, notes, groups };
}

export function OnboardingScreen({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: (zoneIds: string[]) => void }) {
  const { t } = useT(); const steps = useSteps();
  const plans = useMemo(() => ids.map(candOf).filter(c => c && !c.reason).map(c => planOf(c!)), [ids]);
  // Fixed at opening: the names and NSGs that exist, and what is already in the Change set. Adding changes all three.
  const [fixed] = useState(() => ({ names: new Set(zones.map(z => z.name)), nsgs: new Set(zones.map(z => z.nsg)), done: new Set(plans.filter(p => onboarded.has(p.c.id)).map(p => p.c.id)) }));
  const todo = plans.filter(p => !fixed.done.has(p.c.id));
  const [cur, setCur] = useState(todo[0]?.c.id ?? plans[0]?.c.id ?? '');
  const [all, setAll] = useState<Choice>({ imp: true, preserve: true, egress: 'dest' });
  const [own, setOwn] = useState<Record<string, Partial<Choice>>>({});
  const [names, setNames] = useState<Record<string, string>>({}); const [nsgNames, setNsgNames] = useState<Record<string, string>>({});
  const [asgMode, setAsgMode] = useState<Record<string, 'ext' | 'adopt'>>({}); const [noDns, setNoDns] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set()); const [scope, setScope] = useState<'all' | 'one'>('all'); const [allRules, setAllRules] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const eff = (cid: string): Choice => ({ ...all, ...own[cid] });
  const setMine = <K extends keyof Choice>(cid: string, k: K, v: Choice[K]) => setOwn(o => { const n = { ...o[cid] }; if (v === all[k]) delete n[k]; else n[k] = v; return { ...o, [cid]: n }; });
  const res = compute(todo, eff, merged);
  // The default Zone name is the subnet name, or {vnet}-{subnet} when that name is taken.
  const zn = new Map<string, { name: string; def: string; clash: string }>(); const used = new Map<string, string>();
  for (const p of todo) { const c = p.c; const clash = fixed.names.has(c.subnet) ? 'an existing Zone' : used.has(c.subnet) ? `${c.subnet} in ${used.get(c.subnet)}` : '';
    const def = clash ? `${c.vnet}-${c.subnet}` : c.subnet; const name = names[c.id] ?? def; used.set(name, c.vnet); zn.set(c.id, { name, def, clash }); }
  const adopted = (p: Plan) => !!p.legacy && !p.legacy.shared.length;
  const nsgOf = (p: Plan) => (adopted(p) ? p.legacy!.nsg : nsgNames[p.c.id] ?? `nsg-${p.c.vnet.slice(5)}-${zn.get(p.c.id)?.name.trim() ?? p.c.subnet}`);
  const nameErr = (p: Plan) => { const n = zn.get(p.c.id)!.name.trim(); if (!n) return 'Name the Zone.'; if (fixed.names.has(n)) return `A Zone named ${n} exists already.`; if ([...zn].some(([k, v]) => k !== p.c.id && v.name.trim() === n)) return `Another subnet here is named ${n} too.`; return null; };
  const nsgErr = (p: Plan) => { if (adopted(p)) return null; const n = nsgOf(p); if (n.length > 80) return `${n.length} characters: Azure allows 80.`; if (fixed.nsgs.has(n)) return 'An NSG with this name exists already.'; return null; };
  const blocking = (cid: string) => res.notes.filter(n => n.cid === cid && n.note.level === 'blocking').length;
  const bad = todo.filter(p => nameErr(p) || nsgErr(p));
  const rulesOf = (p: Plan) => res.rules.filter(o => o.members.includes(p));

  const add = () => {
    if (bad.length || !todo.length || steps.busy) return;
    const zids: string[] = []; const zOf = new Map<string, string>(); const q: ((s: Store) => void)[] = [];
    for (const p of todo) {
      const c = p.c; const ch = eff(c.id); const zid = `z-${c.id}`; const name = zn.get(c.id)!.name.trim(); const nsg = nsgOf(p); const lg = p.legacy; const imp = !!lg && ch.imp;
      const inh = ch.preserve ? inhParts.filter(x => p.inherited[x].set).length : 0; const n = imp ? rulesOf(p).length : 0;
      const z: Zone = { id: zid, name, env: c.env, vnet: c.vnet, sub: p.sub, region: p.region, prefix: c.prefix, egress: ch.egress, nsg, rules: n + inh + 2, addrSrc: 0, addrDst: 0,
        asgs: imp ? lg!.asgs.length : 0, flags: imp && res.notes.some(x => x.cid === c.id) ? ['import'] : [], inherited: inh > 0 };
      addZone(z, c.id); zids.push(zid); zOf.set(c.id, zid);
      const how = !lg ? `new Managed NSG ${nsg}` : lg.shared.length ? `new Managed NSG ${nsg} swapped in for the shared ${lg.nsg}` : `${lg.nsg} adopted in place`;
      q.push(s => s.note({ kind: 'zone', ruleId: `zone:${zid}`, field: 'Onboarding', before: 'candidate', covers: [zid],
        after: `${c.subnet} becomes the Zone ${name}: ${how}, Egress posture ${ch.egress === 'dest' ? 'destination decides' : 'strict'}${lg ? (imp ? `, ${n} Rules imported` : ', start empty') : ''}${ch.preserve ? '' : ', Preserve behaviour off'}`,
        write: { name: !lg ? 'new Managed NSG' : lg.shared.length ? 'new Managed NSG, then the subnet swap' : `${lg.nsg} adopted in place`, dir: 'in', priority: 0 } }));
    }
    const resolve = (id: string, o: Out) => (id === 'self' ? o.members.map(m => `zone:${zOf.get(m.c.id)}`) : id.startsWith('asg:') ? [asgObjId(id.slice(4))] : [id]);
    for (const o of res.rules) {
      for (const id of [...o.imp.src, ...o.imp.dst]) {
        if (newObjects[id]) makeObject(newObjects[id]);
        if (id.startsWith('asg:')) { const a = o.members[0].legacy!.asgs.find(x => x.name === id.slice(4))!; const mode = asgMode[a.name] ?? 'ext';
          makeObject({ id: asgObjId(a.name), name: a.name, kind: !a.unmappable && mode === 'adopt' ? 'asg' : 'extasg', value: a.unmappable ? 'cannot be mapped' : `${a.members} members${mode === 'ext' ? ' (read)' : ''}`, cov: a.unmappable ? [] : o.members.map(m => zOf.get(m.c.id)!) }); }
      }
      if (o.imp.svc.includes('svc-imp-udp8443')) makeService('svc-imp-udp8443');
      const init: Partial<Rule> = { name: o.name, src: o.imp.src.flatMap(x => resolve(x, o)), dst: o.imp.dst.flatMap(x => resolve(x, o)), svc: o.imp.svc, action: o.lr.access === 'Allow' ? 'allow' : 'deny',
        enabled: true, comment: o.lr.desc, ticket: '', owner: '', hits: null, importNote: topLevel(o.notes) };
      const block = o.notes.some(n => n.level === 'blocking') ? o.imp.src.find(x => x.startsWith('asg:')) : undefined;
      q.push(s => {
        // Imported Rules go as low as their constraints allow: after the last Rule, or after the last Rule of the Folder the constraint merge forces.
        const f = o.imp.folder ? s.folders.find(x => x.name === o.imp.folder) : undefined; const inF = f ? [...s.rules].reverse().find(r => r.folder === f.id) : undefined;
        const id = s.addRule((inF ?? s.rules[s.rules.length - 1]).id, undefined, init);
        addProv(id, { items: o.members.map(m => ({ cid: m.c.id, zid: zOf.get(m.c.id)!, nsg: m.legacy!.nsg, rule: o.lr.name, priority: m.legacy!.rules.find(r => r.name === o.lr.name)!.priority, dir: o.lr.dir, adopted: adopted(m) })),
          notes: o.notes, folder: inF?.folder, init, block: block ? asgObjId(block.slice(4)) : undefined });
      });
    }
    for (const p of todo) if (dnsOf(p.c.vnet) && !noDns.has(p.c.id)) { const z = zoneById.get(zOf.get(p.c.id)!)!; q.push(s => { const init = dnsRuleInit(z); if (init) s.addRule(s.rules[s.rules.length - 1].id, undefined, init); }); }
    const st = getImport(); const ho = todo.filter(p => p.legacy?.evidence).map(p => ({ cid: p.c.id, nsg: p.legacy!.nsg, subnet: p.c.subnet, vnet: p.c.vnet, ev: p.legacy!.evidence! }));
    const sp = todo.find(p => p.c.id === 'c903' && eff(p.c.id).imp) ?? todo.find(p => p.legacy && eff(p.c.id).imp);
    setImport({ handover: ho.length ? { items: [...st.handover.items, ...ho] } : st.handover, snap: st.snap ?? (sp ? { nsg: sp.legacy!.nsg, cid: sp.c.id, zid: zOf.get(sp.c.id)! } : null) });
    steps.run(q, () => onDone(zids));
  };

  const p = plans.find(x => x.c.id === cur); const c = p?.c; const env = c ? envs.find(e => e.id === c.env)! : undefined; const lg = p?.legacy; const ch = c ? eff(c.id) : all;
  const nVnets = [...new Set(todo.map(x => x.c.vnet))]; const nEnvs = [...new Set(todo.map(x => x.c.env))].map(e => envs.find(x => x.id === e)!.name);
  const allBlocking = res.notes.filter(n => n.note.level === 'blocking').length;
  const inScope = scope === 'one' && p ? [p] : todo;
  const shownRules = res.rules.filter(o => o.members.some(m => inScope.includes(m))); const shownNotes = res.notes.filter(n => inScope.some(x => x.c.id === n.cid));
  const cnt = (l: Note['level']) => shownNotes.filter(n => n.note.level === l).length;
  const inFolder = shownRules.filter(o => o.imp.folder); const opens = shownRules.filter(o => o.imp.opens);
  const affected = [...todo.map(x => ({ id: `new:${x.c.id}`, name: zn.get(x.c.id)!.name, env: x.c.env, isNew: true })),
    ...[...new Set(res.rules.flatMap(o => (o.imp.opens ? [o.imp.opens] : [])))].map(zid => { const z = zoneById.get(zid)!; return { id: zid, name: z.name, env: z.env, isNew: false }; })];
  const mark = (k: keyof Choice) => (c && own[c.id]?.[k] !== undefined ? <span className="ob-own">{t('Changed here')} · <a className="link" onClick={() => setOwn(o => { const n = { ...o[c.id] }; delete n[k]; return { ...o, [c.id]: n }; })}>{t('Back to same for all')}</a></span>
    : <span className="ob-own muted">{t('Same for all')}</span>);
  const dns = c ? dnsOf(c.vnet) : null; const zname = c ? zn.get(c.id)?.name ?? c.subnet : '';
  const lands = !dns ? '' : [dns.zone ? `inbound on the Managed NSG of ${zoneById.get(dns.zone)?.name}` : '', ch.egress === 'strict' ? 'outbound on the new Zone, because it is strict' : ''].filter(Boolean).join(', and ');
  const becomes = (r: LegacyRule) => { if (!lg || !ch.imp) return t('nothing: start empty'); const d = lg.dropped.find(x => x.from === r.name); if (d) return t('not imported'); const o = res.rules.find(x => x.lr.name === r.name && x.members.includes(p!)); return o ? (o.members.length > 1 ? `${o.name}, ${t('merged')}` : o.name) : '—'; };

  return (
    <div className="review ob" role="dialog" aria-label={t('Onboard')}>
      <header className="rv-h">
        <div><h1>{t('Onboard')} {todo.length === 1 ? todo[0].c.subnet : `${todo.length} ${t('subnets')}`}</h1>
          <p>{nVnets.join(', ')} · {nEnvs.map(e => t(e)).join(', ')}. {res.rules.length} {t(res.rules.length === 1 ? 'Rule imported' : 'Rules imported')}{allBlocking ? `, ${allBlocking} ${t('blocking')}` : ''}. {t('Lands in your current Change set')} {CUR_NAME}.</p></div>
        <span className="sp" />
        {bad.length > 0 ? <span className="ob-why b-red">{t('Fix the names first')}: {bad.map(x => x.c.subnet).join(', ')}</span> : allBlocking > 0 && <span className="ob-why muted">{t('Blocking notes do not stop adding. They stop Submit.')}</span>}
        <Button appearance="primary" disabled={!todo.length || bad.length > 0 || steps.busy} onClick={add}>{steps.busy ? t('Adding…') : t('Add to Change set')}</Button>
        <button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button>
      </header>
      <div className="rv-b">
        <section className="rv-c rv-l"><h3>{t('Subnets')}</h3>
          {plans.map(x => { const done = fixed.done.has(x.c.id); const b = blocking(x.c.id); const sts: [string, string, number?][] = [];
            if (done) sts.push(['muted', 'In your Change set']);
            else { if (nameErr(x) || nsgErr(x)) sts.push(['red', 'Name to fix']); if (b) sts.push(['red', 'blocking', b]); if (x.legacy?.evidence) sts.push(['amber', 'Evidence to confirm in the Review']); if (!sts.length) sts.push(['ok', 'Ready']); }
            const tone = sts[0][0]; const shown = done ? x.c.subnet : zn.get(x.c.id)!.name;
            return <button key={x.c.id} className={`ob-sub s-${tone} ${cur === x.c.id ? 'on' : ''}`} onClick={() => setCur(x.c.id)}>
              {tone === 'ok' ? <CheckmarkCircle16Filled /> : tone === 'red' ? <ErrorCircle16Filled /> : tone === 'amber' ? <Warning16Filled /> : <Circle16Regular />}
              <span><b>{shown}</b><span className="muted">{x.c.subnet !== shown ? `${x.c.subnet} · ` : ''}{x.c.vnet} · {t(envs.find(v => v.id === x.c.env)!.name)}</span>
                {sts.map(([k, label, n]) => <span key={label} className={`ob-st ${k}`}>{n ? `${n} ` : ''}{t(label)}</span>)}
                {!done && Object.keys(own[x.c.id] ?? {}).length > 0 && <span className="muted">{t('Own choices')}</span>}</span></button>; })}
          <h3>{t('Same for all')}</h3>
          <p className="muted ob-lead">{t('Every subnet follows these unless you change it there.')}</p>
          <div className="ob-def">
            <div><span>{t('Existing NSG rules')}</span><div className="seg2"><button className={all.imp ? 'on' : ''} onClick={() => setAll({ ...all, imp: true })}>{t('Import')}</button><button className={!all.imp ? 'on' : ''} onClick={() => setAll({ ...all, imp: false })}>{t('Start empty')}</button></div></div>
            <div><Switch checked={all.preserve} onChange={(_, d) => setAll({ ...all, preserve: d.checked })} label={t('Preserve behaviour')} /></div>
            <div><span>{t('Egress posture')}</span><div className="seg2">{(['dest', 'strict'] as Egress[]).map(e => <button key={e} className={all.egress === e ? 'on' : ''} onClick={() => setAll({ ...all, egress: e })}>{t(e === 'dest' ? 'Destination decides' : 'Strict')}</button>)}</div></div>
          </div>
          <p className="muted ob-foot">{t('Blocking Import notes do not stop adding; they stop Submit. Warning and info notes stay on the Rules after the Commit until a Zone admin acknowledges them.')}</p>
        </section>

        <section className="rv-c rv-m ob-m">
          {!p || !c || !env ? <div className="empty"><b>{t('No subnet to onboard')}</b><p>{t('Pick candidates on the Zones page.')}</p></div>
            : fixed.done.has(c.id) ? <><div className="rv-rule"><h2>{c.subnet}</h2></div><p className="ok"><Checkmark12Filled /> {t('In your Change set as the Zone')} <b>{zoneById.get(onboarded.get(c.id)!)?.name}</b>.</p></> : <>
            <div className="rv-rule"><Glyph kind="subnet" /><h2>{c.subnet}</h2><span className="mono muted">{c.prefix}</span><span className="sp" /><span className="muted">{c.vnet} · {t(env.name)} ({env.mode})</span></div>

            <h3>{t('Zone name')}</h3>
            <div className="ob-name"><Input value={zname} onChange={(_, d) => setNames(n => ({ ...n, [c.id]: d.value }))} aria-label={t('Zone name')} />
              {names[c.id] !== undefined && names[c.id] !== zn.get(c.id)!.def && <a className="link" onClick={() => setNames(n => { const x = { ...n }; delete x[c.id]; return x; })}>{t('Use the default')}</a>}</div>
            <p className="muted">{zn.get(c.id)!.clash ? <>{t('Default')}: <span className="mono">{zn.get(c.id)!.def}</span>, {t('because the subnet name is taken by')} {zn.get(c.id)!.clash}.</> : t('Default: the subnet name.')}</p>
            {nameErr(p) && <p className="owarn red"><ErrorCircle16Filled /><span>{t(nameErr(p)!)}</span></p>}

            <h3>{t('Existing NSG')}</h3>
            {lg ? <div className="ob-box">
              <div className="ob-box-h"><b className="mono">{lg.nsg}</b><span className="muted">{lg.rules.length} {t('NSG rules and the 6 Azure default rules')} · {t('resource group')} <span className="mono">{lg.rg}</span></span></div>
              {lg.shared.length ? <p>{t('Shared with')} {lg.shared.join(', ')}. {t('A new Managed NSG is swapped in with one subnet write:')} <b className="mono">{nsgOf(p)}</b>. {t('Import still converts the rules of the shared NSG that apply to this subnet; the shared NSG stays as it is for the others.')}</p>
                : <p>{t('Used only by this subnet and by no network interface: adopted in place. It keeps its name and resource group and gets the marker tag.')}</p>}
              <details className="ob-leg"><summary>{t('Its NSG rules and what Import makes of them')}</summary>
                <table className="mini"><thead><tr><th>{t('Priority')}</th><th>{t('NSG rule')}</th><th>{t('Access')}</th><th>{t('Source → destination')}</th><th>{t('Port')}</th><th>{t('Becomes')}</th></tr></thead>
                  <tbody>{lg.rules.map(r => <tr key={r.name}><td>{r.priority}<div className="muted">{t(r.dir === 'in' ? 'inbound' : 'outbound')}</div></td><td><span className="mono">{r.name}</span><div className="muted">{r.desc}</div></td>
                    <td className={r.access === 'Allow' ? 'ok' : 'b-red'}>{t(r.access)}</td><td className="mono">{r.src} → {r.dst}</td><td>{port(r)}</td><td className="mono">{becomes(r)}</td></tr>)}</tbody></table></details>
            </div> : <p>{t('None. The tool creates the Managed NSG')} <b className="mono">{nsgOf(p)}</b> {t('and associates it with one subnet write.')}</p>}
            {nsgErr(p) && <div className="owarn red"><ErrorCircle16Filled /><span><b>{t('The NSG name needs an explicit value')}: {t(nsgErr(p)!)}</b>
              <Input size="small" className="ob-nsgin" value={nsgOf(p)} onChange={(_, d) => setNsgNames(n => ({ ...n, [c.id]: d.value }))} aria-label={t('NSG name')} /></span></div>}

            {lg?.evidence && <><h3>{t('Foreign IaC')}</h3>
              <div className="owarn amber"><Warning16Filled /><span><b>{t(lg.evidence.tool)} {t('writes this NSG outside nsgfw.')}</b>
                <ul className="cd-l">{lg.evidence.lines.map(l => <li key={l}><Code s={t(l)} /></li>)}</ul>
                <b>{t('The handover checklist')}</b><ul className="cd-l">{lg.evidence.checklist.map(l => <li key={l}><Code s={t(l)} /></li>)}</ul>
                {t('You confirm the handover in the Review before Submit.')}</span></div></>}

            {lg && <><h3 className="ob-h">{t('Import')}<span className="sp" />{mark('imp')}</h3>
              <div className="seg2"><button className={ch.imp ? 'on' : ''} onClick={() => setMine(c.id, 'imp', true)}>{t('Import')}</button><button className={!ch.imp ? 'on' : ''} onClick={() => setMine(c.id, 'imp', false)}>{t('Start empty')}</button></div>
              <p className="muted">{ch.imp ? t('The default. One NSG rule becomes one Rule: the NSG rule name (with a suffix on a collision), its description as the comment, no owner. Provenance records the NSG, the NSG rule, its priority and direction. Imported Rules are ordinary edits in this Change set.')
                : t('Nothing is imported from this NSG. The Zone starts with its Inherited defaults and the Deny-all rules.')}</p></>}

            <h3 className="ob-h">{t('Preserve behaviour')}<span className="sp" />{mark('preserve')}</h3>
            <Switch checked={ch.preserve} onChange={(_, d) => setMine(c.id, 'preserve', d.checked)} label={t(ch.preserve ? 'On: the Zone keeps what the Azure default rules allowed' : 'Off: no Inherited defaults')} />
            <p className="muted">{t('Prototype assumption: off sets no Inherited defaults, so traffic that only the Azure default rules allowed stops at onboarding. The imported Rules are still placed by the constraint merge.')}</p>

            {lg && ch.imp && lg.asgs.length > 0 && <><h3>{t('ASGs')}</h3>
              {lg.asgs.map(a => { const mode = asgMode[a.name] ?? 'ext'; const noWriter = asgWriterMissing.has(c.env); return (
                <div key={a.name} className="ob-asg"><div className="ob-asg-h"><Glyph kind={mode === 'adopt' && !a.unmappable ? 'asg' : 'extasg'} /><b className="mono">{a.name}</b><span className="muted">{a.unmappable ? t('members unknown') : `${a.members} ${t('members')}`} · {a.rg}</span></div>
                  {a.unmappable ? <p className="owarn red"><ErrorCircle16Filled /><span><b>{t('Cannot be mapped: a blocking Import note.')}</b> <Code s={t(a.unmappable.why)} /> {t('What to do')}: <Code s={t(a.unmappable.resolve)} /></span></p> : <>
                    <div className="seg2"><button className={mode === 'ext' ? 'on' : ''} onClick={() => setAsgMode(m => ({ ...m, [a.name]: 'ext' }))}>{t('External ASG object')}</button>
                      <button className={mode === 'adopt' ? 'on' : ''} disabled={noWriter} onClick={() => setAsgMode(m => ({ ...m, [a.name]: 'adopt' }))}>{t('Adopt in place')}</button></div>
                    <p className="muted">{t(mode === 'ext' ? 'The default. The tool reads its members and never writes them.' : 'The Unmanaged ASG becomes the Managed ASG of an ASG object: from now on the tool writes its members.')}
                      {noWriter && <> {t('Adopt in place is not available: the Environment lacks the optional role nsgfw ASG Writer.')}</>}</p></>}
                </div>); })}</>}

            <h3 className="ob-h">{t('Egress posture')}<span className="sp" />{mark('egress')}</h3>
            <div className="egopt">{(['dest', 'strict'] as Egress[]).map(e => <button key={e} className={`eg ${ch.egress === e ? 'on' : ''}`} onClick={() => setMine(c.id, 'egress', e)}><b>{t(e === 'dest' ? 'Destination decides' : 'Strict')}</b>
              <span>{t(e === 'dest' ? 'The default. Outbound to internal addresses stays open, so onboarding breaks nothing outbound.' : 'Only what a Rule allows leaves the Zone. Check the Flow view first.')}</span></button>)}</div>

            <h3>{t('Inherited defaults')}</h3>
            {inhParts.map(part => { const x = ch.preserve ? p.inherited[part] : { set: false, why: 'Not set: Preserve behaviour is off.' }; return (
              <div key={part} className="inh"><div className="inh-h"><b>{t(partLabel[part])}</b><span className="sp" /><span className={`ob-flag ${x.set ? 'on' : ''}`}>{t(x.set ? 'set' : 'not set')}</span></div><p className="muted ob-inh"><Code s={t(x.why)} /></p></div>); })}
            <p className="muted">{t('NSG rules in the band 4090 to 4095 on the Zone’s own NSG. Import sets only those whose Azure default rule took effect in the old NSG; they go away only through a Change set.')}</p>

            <h3>{t('Proposed Rules')}</h3>
            {dns ? <div className={`prop ${!noDns.has(c.id) ? 'on' : ''}`}><Checkbox checked={!noDns.has(c.id)} onChange={(_, d) => setNoDns(n => { const x = new Set(n); if (d.checked) x.delete(c.id); else x.add(c.id); return x; })} label={<b>{t('DNS from')} {zname}</b>} />
              <p className="mono small">{zname} → {dns.servers.join(', ')} · UDP 53, TCP 53 · {t('allow')}</p>
              <p className="muted small">{t('The VNet uses custom DNS servers')} ({t(dns.where)}). {lands ? `${t('Lands')} ${t(lands)}.` : t('Writes nothing today: the posture lets it out and the servers are in no Zone. It keeps name resolution working when the Zone turns strict.')}</p></div>
              : <p className="muted">{t('The VNet uses Azure-provided DNS, which NSGs do not filter. No Rule needed.')}</p>}

            {p.warnings.length > 0 && <><h3>{t('Warnings')}</h3>{p.warnings.map(w => <p key={w} className="owarn amber"><Warning16Filled /><span><Code s={t(w)} /></span></p>)}</>}
          </>}
        </section>

        <section className="rv-c rv-r">
          <h3 className="ob-h">{t('Result')}<span className="sp" />{todo.length > 1 && p && !fixed.done.has(p.c.id) && <div className="seg2 ob-scope"><button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>{t('All')} {todo.length}</button><button className={scope === 'one' ? 'on' : ''} onClick={() => setScope('one')}>{t('This subnet')}</button></div>}</h3>
          <div className="counts"><span><b>{shownRules.length}</b>{t(shownRules.length === 1 ? 'Rule imported' : 'Rules imported')}</span><span className={cnt('blocking') ? 'c-blocking' : 'nil'}><b>{cnt('blocking')}</b>{t('blocking')}</span>
            <span className={cnt('warning') ? 'c-warning' : 'nil'}><b>{cnt('warning')}</b>{t(cnt('warning') === 1 ? 'warning' : 'warnings')}</span><span className={cnt('info') ? '' : 'nil'}><b>{cnt('info')}</b>{t('info')}</span></div>

          {shownRules.length > 0 && <><h3>{t('Rules imported')}</h3>
            {(allRules ? shownRules : shownRules.slice(0, 4)).map(o => <div key={o.key} className="ob-r"><span className={`bact ${o.lr.access === 'Allow' ? 'allow' : 'deny'}`}>{t(o.lr.access === 'Allow' ? 'allow' : 'deny')}</span><b>{o.name}</b>
              <span className="muted">{o.members.length > 1 ? `${t('merged')}: ${o.members.map(m => zn.get(m.c.id)!.name).join(', ')}` : <><span className="mono">{o.members[0].legacy!.nsg}</span> · {o.lr.priority} · {t(o.lr.dir === 'in' ? 'inbound' : 'outbound')}{o.imp.svc.length ? ` · ${o.imp.svc.map(svcName).join(', ')}` : ''}</>}</span></div>)}
            {shownRules.length > 4 && <a className="link ob-more" onClick={() => setAllRules(!allRules)}>{allRules ? t('Show fewer') : `${t('Show all')} ${shownRules.length}`}</a>}</>}

          {shownNotes.length > 0 && <><h3>{t('Import notes')}</h3>
            {shownNotes.map((n, k) => <NoteRow key={k} n={n.note} zone={inScope.length > 1 ? zn.get(n.cid)?.name : undefined} rule={n.where || undefined} />)}</>}

          {res.groups.length > 0 && <><h3>{t('Merge proposals')}</h3>
            <p className="cd-p">{res.groups.reduce((a, g) => a + g.members.length, 0)} {t('imported Rules differ only in their own Zone: merge into')} {res.groups.length} {t(res.groups.length === 1 ? 'Rule' : 'Rules')}.</p>
            {res.groups.map(g => { const on = merged.has(g.key); return <div key={g.key} className="ob-merge"><div><b className="mono">{g.name}</b><span className="muted">{g.members.map(m => zn.get(m.c.id)!.name).join(', ')}</span>
              {on && <span className="ok"><Checkmark12Filled /> {t('Merged into one Rule with')} {g.members.length} {t('Zones; it keeps all provenance.')}</span>}</div>
              {on ? <Button size="small" appearance="subtle" onClick={() => setMerged(m => { const x = new Set(m); x.delete(g.key); return x; })}>{t('Undo')}</Button> : <Button size="small" onClick={() => setMerged(m => new Set(m).add(g.key))}>{t('Accept')}</Button>}</div>; })}</>}

          {shownRules.length > 0 && <><h3>{t('Where the Rules land')}</h3>
            <p className="cd-p">{t('Outside every Folder, as low as their constraints allow.')}{inFolder.length > 0 && <> {inFolder.length} {t('inside the Folder')} “{inFolder[0].imp.folder}” {t('because a deny Rule there overlaps it (info note).')}</>}</p>
            <p className="muted">{t('The constraint merge keeps the order of every imported NSG and direction and puts the deny first where Rules overlap. It runs again at every Rebase until someone moves an imported Rule by hand or puts it into a Folder. Import creates no Folders.')}</p></>}

          {opens.length > 0 && <><h3>{t('Opens on already-managed Zones')}</h3>
            <ul className="cd-l">{opens.map(o => <li key={o.key}><b>{zoneById.get(o.imp.opens!)?.name}</b> <span className="muted">← {o.members.map(m => zn.get(m.c.id)!.name).join(', ')}, {port(o.lr)} ({o.name})</span></li>)}</ul></>}

          <h3>{t('Preview')}</h3>
          <ul className="cd-l">
            {inScope.map(x => <li key={x.c.id}>{adopted(x) ? <><span className="mono">{x.legacy!.nsg}</span> {t('adopted in place: marker tag added,')} {x.legacy!.rules.length} {t('NSG rules replaced in one write.')}</>
              : x.legacy ? <>{t('New Managed NSG')} <span className="mono">{nsgOf(x)}</span>, {t('swapped in for the shared')} <span className="mono">{x.legacy.nsg}</span>.</>
              : <>{t('New Managed NSG')} <span className="mono">{nsgOf(x)}</span>, {t('associated with one subnet write.')}</>}</li>)}
            <li>{t('Deny-all rules at the end of every new or adopted NSG, inbound and outbound.')}</li>
            {inScope.filter(x => x.tf).map(x => <li key={`tf-${x.c.id}`}>{adopted(x) ? <>{t('Import entries for')} <span className="mono">{x.legacy!.nsg}</span> {t('and its subnet association in the Data contract of root module')} <span className="mono">{x.tf!.module}</span> ({x.tf!.file}).</>
              : <>{t('The new Managed NSG goes into the Data contract of root module')} <span className="mono">{x.tf!.module}</span>.</>}</li>)}
          </ul>
          <p className="warnline"><Warning16Filled /> {t('The subnet loses all traffic that no Rule allows.')}</p>
          {inScope.some(adopted) && <p className="cd-p">{t('First Commit: the legacy NSG rules are replaced in one write; no interim content. Its Crossing flows may still order the writes.')}</p>}

          <h3>{t('Approval')}</h3>
          <table className="mini"><tbody>{affected.map(a => { const lv = envs.find(e => e.id === a.env)!.level; return <tr key={a.id}><td><b>{a.name}</b> <span className="muted">{t(a.isNew ? 'new' : 'managed')}</span></td><td>{t(envs.find(e => e.id === a.env)!.name)}</td><td><span className={`lvl l-${lv}`}>{t(lv)}</span></td></tr>; })}</tbody></table>
          <p className="muted">{t('Affected Zones: the new Zones, and the managed Zones that imported Rules open.')}</p>
        </section>
      </div>
    </div>
  );
}
