// PROTOTYPE, throwaway. Issue 37: Import notes on Rules, the Import snapshot check, and the foreign-IaC Handover.
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Radio, RadioGroup } from '@fluentui/react-components';
import { Checkmark12Filled } from '@fluentui/react-icons';
import type { Item37 } from './DeployView';
import { useStore } from './store';
import { Rule, zoneById, me, ref, svcName } from './data';
import { useSession, now, hhmm } from './session';
import { useOps, go37 } from './ops37';
import { useT } from './i18n';
import { useImport, setImport, getImport, legacyProv, addProv, ack, useSteps, candOf, planOf, Note, NoteLevel } from './importdata';
import './import.css';

export const levelOrder: Record<NoteLevel, number> = { blocking: 0, warning: 1, info: 2 };
export const topLevel = (ns: Note[]): NoteLevel | undefined => [...ns].sort((a, b) => levelOrder[a.level] - levelOrder[b.level])[0]?.level;
/** Mock texts mark names with backticks; they render in the Mono face. */
export const Code = ({ s }: { s: string }) => <>{s.split('`').map((x, i) => (i % 2 ? <span key={i} className="mono">{x}</span> : x))}</>;
/** One Import note: its level as a word, the text, and for a blocking note what resolves it. */
export function NoteRow({ n, zone, rule, done, children }: { n: Note; zone?: string; rule?: string; done?: boolean; children?: ReactNode }) {
  const { t } = useT();
  return <div className={`inote ${n.level} ${done ? 'done' : ''}`}><span className={`lv ${n.level}`}>{t(n.level)}</span><div>{(zone || rule) && <div className="inote-w">{zone}{zone && rule && ' · '}{rule && <span className="mono">{rule}</span>}</div>}
    <p><Code s={t(n.text)} /></p>{n.resolve && !children && <p className="muted">{t('Resolve')}: <Code s={t(n.resolve)} /></p>}{children}</div></div>;
}
const when = (at: string) => (at === hhmm(now()) ? 'now' : `at ${at}`);

/** Rule editor: provenance and Import note of an imported Rule, with Acknowledge. */
export function ImportSection({ ruleId }: { ruleId: string }): JSX.Element | null {
  const s = useStore(); const se = useSession(); const { t } = useT(); const st = useImport();
  const r = s.rules.find(x => x.id === ruleId);
  const p = r ? st.prov.get(r.id) ?? legacyProv(r) : undefined;
  const resolved = !!(r && p?.block && !r.src.includes(p.block) && !r.dst.includes(p.block));
  const mine = !!r && st.prov.has(r.id) && !!s.status.get(r.id)?.added;
  const level = p ? topLevel(p.notes.filter((n, k) => !(n.level === 'blocking' ? resolved : st.acks.has(`${ruleId}:${k}`)))) : undefined;
  // The Rule base flag of a Rule added by this onboarding follows its open notes. Its edits are part of adding it, so no Change set edit appears.
  useEffect(() => { if (r && mine && r.importNote !== level) s.editField(r.id, 'importNote', level); }, [level, ruleId]);
  if (!r || !p) return null;
  const z = zoneById.get(p.items[0].zid); const role = z ? se.zoneRole(z) : null; const admin = role === 'admin';
  const moved = !!s.status.get(r.id)?.moved; const own = st.prov.has(r.id);
  const folder = r.folder ? s.folders.find(f => f.id === r.folder)?.name : undefined;
  const placed = moved ? t('Pinned: you moved it by hand.') : folder && (!own || r.folder !== p.folder) ? `${t('Pinned: it is in the Folder')} “${folder}”.`
    : folder ? `${t('Placed by the constraint merge inside the Folder')} “${folder}”. ${t('Recomputed at every Rebase until you move it.')}` : t('Placed by the constraint merge; recomputed at every Rebase until you move it or put it into a Folder.');
  const doAck = (k: number, n: Note) => {
    ack(`${r.id}:${k}`, me, hhmm(now()));
    se.log({ cat: 'import', action: 'Acknowledged Import note', object: `${r.name}: ${n.text.slice(0, 80)}`, scopes: z ? [{ kind: 'zone', id: z.id }] : [], result: 'ok' });
    se.toast('Import note acknowledged. Recorded in the audit log; no Change set needed.');
  };
  const block = p.block ? p.block.replace(/^imp-asg-/, '') : '';
  return (<>
    <h3>{t('Import')}</h3>
    <div className="imp">
      {p.items.map((i, k) => <dl key={k} className="facts imp-f"><dt>{t('NSG')}</dt><dd className="mono">{i.nsg}</dd><dt>{t('NSG rule')}</dt><dd className="mono">{i.rule}</dd>
        <dt>{t('Priority')}</dt><dd>{i.priority} · {t(i.dir === 'in' ? 'inbound' : 'outbound')}</dd>
        {i.adopted && <><dt>{t('Replaces')}</dt><dd>{t('the legacy NSG rule')} <span className="mono">{i.rule}</span> {t('in the first Commit')}</dd></>}</dl>)}
      {p.items.length > 1 && <p className="muted">{t('Merged from')} {p.items.length} {t('imported Rules that differed only in their own Zone. It keeps all provenance.')}</p>}
    </div>
    {p.notes.map((n, k) => { const a = st.acks.get(`${r.id}:${k}`); return (
      <NoteRow key={k} n={n} done={n.level === 'blocking' ? resolved : !!a}>
        {n.level === 'blocking' ? (resolved ? <p className="ok"><Checkmark12Filled /> {t('Resolved: the Rule no longer names')} <span className="mono">{block}</span>.</p>
          : <p className="muted">{t('Resolve')}: <Code s={t(n.resolve ?? '')} /> {t('A blocking note is resolved, not acknowledged. Until then it stops Submit.')}</p>)
          : a ? <p className="ok"><Checkmark12Filled /> {t('Acknowledged by')} {a.by === me ? t('you') : a.by}, {t(when(a.at))}. {t('In the audit log.')}</p>
          : <div className="inote-a"><Button size="small" disabled={!admin} onClick={() => doAck(k, n)}>{t('Acknowledge')}</Button>
            <span className="muted">{admin ? t('An audit entry. Needs no Change set.') : `${t('Needs the admin Role in')} ${z?.name ?? t('the Zone')} ${t('or above. You are')} ${role ?? t('without a Role')} ${t('there.')}`}</span></div>}
      </NoteRow>); })}
    <p className="muted imp-pl">{placed}</p>
  </>);
}

/** True while a legacy NSG changed in Azure after its Import snapshot and imported Rules were edited: Commit blocks (#18.12). */
export function useSnapshot(): { stale: boolean; nsg: string } {
  const ops = useOps(); const st = useImport(); const s = useStore();
  return { stale: !!(ops.snapshotChanged && st.snap && !st.snap.choice && s.state !== 'Committed'), nsg: st.snap?.nsg ?? '' };
}
export const openSnapshot = () => setImport({ snapOpen: true });
/** Mount once in the console: opens the snapshot dialog from the inbox. */
export function SnapshotHost() { const st = useImport(); return st.snapOpen ? <SnapshotDialog onClose={() => setImport({ snapOpen: false })} /> : null; }

const fields: (keyof Rule)[] = ['name', 'src', 'dst', 'svc', 'action', 'enabled', 'comment'];
const fmt = (v: unknown) => (Array.isArray(v) ? v.map(x => (String(x).startsWith('svc') ? svcName(String(x)) : ref(String(x)).name)).join(', ') : String(v ?? ''));
const label: Partial<Record<keyof Rule, string>> = { name: 'Name', src: 'Source', dst: 'Destination', svc: 'Service', action: 'Action', enabled: 'Enabled', comment: 'Comment' };
export function SnapshotDialog({ onClose }: { onClose: () => void }) {
  const s = useStore(); const st = useImport(); const se = useSession(); const ops = useOps(); const { t } = useT(); const snap = useSnapshot(); const steps = useSteps();
  const [pick, setPick] = useState<'reimport' | 'keep' | ''>('');
  const sn = st.snap; const c = sn ? candOf(sn.cid) : undefined; const lg = c ? planOf(c).legacy : undefined; const changed = lg?.rules[0];
  const mine = sn ? [...st.prov].filter(([id, pr]) => pr.items.some(i => i.cid === sn.cid) && s.rules.some(r => r.id === id)) : [];
  const edits = mine.flatMap(([id, pr]) => { const r = s.rules.find(x => x.id === id)!; return fields.filter(f => f in pr.init && fmt(r[f]) !== fmt(pr.init[f])).map(f => ({ id, name: r.name, f, before: fmt(pr.init[f]), after: fmt(r[f]), to: pr.init[f] })); });
  const choose = () => {
    if (!sn || !pick) return;
    const at = hhmm(now());
    if (pick === 'keep') { setImport({ snap: { ...sn, choice: { kind: 'keep', at } } }); se.toast(`Kept the Import snapshot of ${sn.nsg}. The first Commit overwrites the Azure change.`); onClose(); return; }
    const hit = mine.find(([, pr]) => pr.items[0].rule === changed?.name)?.[0];
    steps.run([
      ...edits.map(e => (x: typeof s) => x.editField(e.id, e.f, e.to)),
      ...(hit ? [(x: typeof s) => x.editField(hit, 'src', ['any'])] : []),
      (x: typeof s) => { const init: Partial<Rule> = { name: 'allow-mon-5986', src: ['zone:z0001-mgmt'], dst: [`zone:${sn.zid}`], svc: ['svc-winrm'], action: 'allow', enabled: true, comment: 'Added in the Azure portal', ticket: '', owner: '', hits: null };
        const id = x.addRule(x.rules[x.rules.length - 1].id, undefined, init); addProv(id, { items: [{ cid: sn.cid, zid: sn.zid, nsg: sn.nsg, rule: 'allow-mon-5986', priority: 250, dir: 'in', adopted: !lg?.shared.length }], notes: [], init }); },
    ], () => { setImport({ snap: { ...getImport().snap!, choice: { kind: 'reimport', at } } }); se.toast(`Imported ${sn.nsg} again${edits.length ? `; ${edits.length} ${edits.length === 1 ? 'edit' : 'edits'} discarded` : ''}. The Approvals were reset.`); onClose(); });
  };
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 640 }}><DialogBody><DialogTitle>{sn ? <><span className="mono">{sn.nsg}</span> {t('changed in Azure since the Import')}</> : t('Import snapshot')}</DialogTitle>
        <DialogContent className="cd">
          {!sn || !ops.snapshotChanged ? <p className="cd-p">{sn ? t('No change since the Import snapshot. The Drift poll compares the live NSG with it every 5 minutes.') : t('No onboarding with Import in the current Change set.')}</p> : <>
            <section><h4>{t('What changed in Azure')}</h4>
              <ul className="cd-l"><li>{t('1 rule added')}: <span className="mono">allow-mon-5986</span>, {t('priority')} 250, {t('inbound')}, <span className="mono">10.0.85.0/26 → any</span>, TCP 5986</li>
                {changed && <li>{t('1 rule changed')}: <span className="mono">{changed.name}</span>, {t('source')} <span className="mono">{changed.src} → any</span></li>}</ul>
              <p className="cd-p muted">{t('By j.doe via Azure portal, 20 minutes ago. The Drift poll compares the live NSG with the Import snapshot of this Change set.')}</p></section>
            {sn.choice ? <section><h4>{t('Your choice')}</h4><p className="cd-p ok"><Checkmark12Filled /> {sn.choice.kind === 'keep' ? t('Keep snapshot') : t('Re-import')}, {t('by you at')} {sn.choice.at}. {t(sn.choice.kind === 'keep' ? 'The first Commit overwrites the Azure change.' : 'The imported Rules took the Azure change.')}</p></section> : <>
              <section><h4>{t('Re-import discards these edits')}</h4>
                {edits.length ? <ul className="cd-l diffl">{edits.map(e => <li key={`${e.id}-${e.f}`}><span className="mono">{e.name}</span>: {t(label[e.f] ?? e.f)} <s>{e.before || '∅'}</s> {t('to')} {e.after || '∅'}</li>)}</ul>
                  : <><p className="cd-p">{t('No imported Rule of this NSG differs from the Import yet.')}</p>
                    <p className="cd-p muted">{t('Prototype: without edits the tool imports again on its own and resets the Approvals, with the notice “Imported')} {sn.nsg} {t('again: it changed in Azure. The Approvals were reset.” The mock asks anyway.')}</p></>}</section>
              <section><h4>{t('Choose')}</h4>
                <RadioGroup value={pick} onChange={(_, d) => setPick(d.value as 'reimport' | 'keep')}>
                  <Radio value="reimport" label={<span><b>{t('Re-import')}</b> <span className="muted">{t('The imported Rules take the Azure change; the edits above are discarded. The Approvals reset.')}</span></span>} />
                  <Radio value="keep" label={<span><b>{t('Keep snapshot')}</b> <span className="muted">{t('The Rules stay as they are. The first Commit overwrites the Azure change: allow-mon-5986 goes away again.')}</span></span>} />
                </RadioGroup>
                <p className="cd-p pending">{t('The Commit stays blocked until you choose.')}</p></section>
            </>}
          </>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t(snap.stale ? 'Later' : 'Close')}</Button>
          {snap.stale && <Button appearance="primary" disabled={!pick || steps.busy} onClick={choose}>{steps.busy ? t('Importing…') : pick === 'keep' ? t('Keep snapshot') : pick === 'reimport' ? t('Re-import') : t('Choose')}</Button>}</DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

/** Foreign-IaC evidence in the current Change set: needed, confirmed, by whom. */
export function useHandover(): { needed: boolean; confirmed: boolean; by?: string; at?: string } {
  const h = useImport().handover; return { needed: h.items.length > 0, confirmed: !!h.confirmed, by: h.confirmed?.by, at: h.confirmed?.at };
}
/** Review screen: the evidence and the checklist the Author confirms before Submit. */
export function HandoverBlock(): JSX.Element | null {
  const h = useImport().handover; const s = useStore(); const se = useSession(); const { t } = useT();
  if (!h.items.length) return null;
  const author = s.state === 'Open' && se.canEdit;
  return (<>
    <h3>{t('Handover from foreign IaC')}</h3>
    <div className={`ho ${h.confirmed ? 'done' : ''}`}>
      {h.items.map(i => <div key={i.cid} className="ho-i">
        <p><b className="mono">{i.nsg}</b> · {i.subnet} {t('in')} {i.vnet}</p>
        <ul className="cd-l">{i.ev.lines.map(l => <li key={l}><Code s={t(l)} /></li>)}</ul>
        <p className="muted">{t('Before Submit, check:')}</p>
        <ul className="cd-l">{i.ev.checklist.map(l => <li key={l}><Code s={t(l)} /></li>)}</ul></div>)}
      {author ? <Checkbox checked={!!h.confirmed} onChange={(_, d) => setImport({ handover: { ...h, confirmed: d.checked ? { by: me, at: hhmm(now()) } : undefined } })}
          label={<span><b>{t('I confirm: the other tool no longer writes these resources')}</b>{h.confirmed && <span className="muted"> · {t('by you at')} {h.confirmed.at}</span>}</span>} />
        : h.confirmed ? <p className="ok"><Checkmark12Filled /> {t('Confirmed by')} {h.confirmed.by === me ? t('the Author') : h.confirmed.by} {t('at')} {h.confirmed.at}.</p>
        : <p className="pending">{t('Waits for the Author’s confirmation.')}</p>}
      <p className={h.confirmed ? 'muted' : 'b-red ho-w'}>{t(h.confirmed ? 'The approver sees the evidence and this confirmation. The Commit dialog shows it as one line and does not ask again.' : 'Submit stays blocked until the Author confirms.')}</p>
    </div>
  </>);
}
/** Commit dialog and approver's view: one line with the confirmation, no new prompt. */
export function HandoverLine(): JSX.Element | null {
  const h = useImport().handover; const { t } = useT();
  if (!h.items.length) return null;
  return <section><h4>{t('Handover')}</h4><p className="cd-p">{h.confirmed ? <>{t('Confirmed by')} {h.confirmed.by === me ? t('you') : h.confirmed.by} {t('at')} {h.confirmed.at} {t('in the Review')}: {h.items.map(i => <Code key={i.cid} s={t(i.ev.line)} />)}</>
    : <span className="b-red">{t('Not confirmed in the Review. Submit stays blocked until the Author confirms.')}</span>}</p></section>;
}

export function useImportInbox(): Item37[] {
  const s = useStore(); const st = useImport(); const snap = useSnapshot();
  const open = useMemo(() => {
    const out: { id: string; n: number; mine: boolean }[] = [];
    for (const r of s.rules) {
      if (!r.importNote && !st.prov.has(r.id)) continue;
      const p = st.prov.get(r.id) ?? legacyProv(r); if (!p) continue;
      const n = p.notes.filter((x, k) => x.level !== 'blocking' && !st.acks.has(`${r.id}:${k}`)).length; if (n) out.push({ id: r.id, n, mine: st.prov.has(r.id) });
    }
    return out;
  }, [s.rules, st]);
  const out: Item37[] = [];
  if (snap.stale) out.push({ id: 'imp-snap', kind: 'import', tone: 'red', text: `${snap.nsg} changed in Azure since the Import. Your Commit is blocked until you choose.`, when: '20 min ago', action: 'Choose', go: openSnapshot });
  const total = open.reduce((a, x) => a + x.n, 0); const mine = open.filter(x => x.mine); const first = mine[0] ?? open[0];
  const names = [...new Set(st.zones.map(z => zoneById.get(z)?.name).filter(Boolean))];
  if (first) out.push({ id: 'imp-notes', kind: 'import', tone: 'amber', when: mine.length ? 'just now' : 'today 06:00', action: 'Show Rules', go: () => go37({ to: 'rule', id: first.id }),
    text: `${total} Import notes wait for an acknowledgement by a Zone admin.${mine.length ? ` ${mine.reduce((a, x) => a + x.n, 0)} of them come from your onboarding of ${names.join(', ')}.` : ''}` });
  return out;
}
