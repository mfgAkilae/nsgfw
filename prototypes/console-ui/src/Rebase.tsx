// PROTOTYPE, throwaway. Issue 36: resolving the conflicts of a Rebase on one wide screen, like Review.
// Left: the conflicts and what rebased cleanly. Middle: base, the newer Version and yours side by side. Right: what happens to the Approvals.
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Radio, RadioGroup } from '@fluentui/react-components';
import { Dismiss20Regular, CheckmarkCircle16Filled, Circle16Regular, Info16Regular, ArrowRight16Regular, Checkmark12Filled, Dismiss12Filled, Folder16Regular } from '@fluentui/react-icons';
import { useStore, Edit } from './store';
import { Entry, Rule, isFolder, ref, svcName, zoneById, rules as baseRules, me } from './data';
import { useFlow, KIM_DENY, THEIRS } from './flow';
import { useT } from './i18n';

type Res = { rule?: 'theirs' | 'mine' | 'merge'; pos?: 'above' | 'below'; folder?: 'theirs' | 'mine' | 'new'; folderName?: string };
const R6 = baseRules[6].id;
const names = (ids: string[]) => ids.map(x => (x.startsWith('svc') ? svcName(x) : ref(x).name)).join(', ');

// kim's deny Rule lands next to "Admins to jump hosts", above or below it, in the same Folder.
function withKimDeny(es: Entry[], pos: 'above' | 'below'): Entry[] {
  const out = es.filter(e => e.id !== KIM_DENY.id); const i = out.findIndex(e => e.id === 'R90005');
  // 'above': your Rule stays above kim's deny Rule.
  const at = i < 0 ? 1 : pos === 'above' ? i + 1 : i; const folder = i < 0 ? undefined : (out[i] as Rule).folder;
  return [...out.slice(0, at), { ...KIM_DENY, folder } as Rule, ...out.slice(at)];
}

export function RebaseScreen({ onClose, onRule }: { onClose: () => void; onRule: (id: string) => void }) {
  const s = useStore(); const f = useFlow(); const { t } = useT(); const p = f.pending!; const full = p.mode === 'full';
  const [res, setRes] = useState<Res>({}); const [sel, setSel] = useState(full ? 'rule' : 'folder');
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const base = s.base.get('R90003')!.rule; const mine = s.rules.find(r => r.id === 'R90003') ?? base;
  const mineFolder = s.folders.find(x => x.id === 'F01')?.name ?? 'App0042 release'; const baseFolder = 'App0042 release';
  const r6 = s.rules.find(r => r.id === R6);
  const items = [
    ...(full ? [{ id: 'rule', kind: 'Rule', title: 'API from web', sub: t('kim turned it off, you changed its service'), done: !!res.rule },
      { id: 'pos', kind: 'Position', title: 'Admins to jump hosts', sub: t('kim put an overlapping deny Rule above it'), done: !!res.pos }] : []),
    { id: 'folder', kind: 'Folder', title: baseFolder, sub: t('both of you renamed this Folder'), done: !!res.folder && (res.folder !== 'new' || !!res.folderName?.trim()) },
  ];
  const left = items.filter(i => !i.done).length;
  const result: Rule = res.rule === 'theirs' ? THEIRS.rule : res.rule === 'merge' ? { ...THEIRS.rule, svc: mine.svc } : mine;
  const slice = (pos: 'above' | 'below') => { const rs = withKimDeny(s.entries, pos).filter((e): e is Rule => !isFolder(e)); const i = rs.findIndex(r => r.id === 'R90005'); return rs.slice(Math.max(0, i - 2), i + 3).map(r => ({ r, n: rs.indexOf(r) + 1 })); };
  const folderName = res.folder === 'theirs' ? THEIRS.folderName : res.folder === 'new' ? (res.folderName ?? '').trim() : mineFolder;
  const keep = !full; const hadApproval = Object.keys(s.approvedBy).length > 0 || s.state !== 'Open';

  const finish = () => {
    const fixEntries = (es: Entry[]) => {
      let out: Entry[] = es.filter(e => e.id !== THEIRS.removedFolder).map(e => (!isFolder(e) && e.folder === THEIRS.removedFolder ? { ...e, folder: undefined } : e));
      if (full) {
        out = out.map(e => (e.id === 'R90003' ? { ...result, folder: (e as Rule).folder } : e));
        out = withKimDeny(out, res.pos!);
      }
      return out.map(e => (isFolder(e) && e.id === 'F01' ? { ...e, name: folderName } : e.id === 'R90004' ? { ...e, comment: 'Reviewed in the Q4 cleanup' } : e));
    };
    const fixEdits = (es: Edit[], next: () => number) => {
      let out = es.filter(e => e.ruleId !== `${R6}:f`);
      if (full) {
        if (res.rule === 'theirs') out = out.filter(e => e.ruleId !== 'R90003');
        if (res.rule === 'mine') out = [...out, { seq: next(), by: me, kind: 'enable', ruleId: 'R90003', field: 'enabled', before: 'false', after: 'true' }];
        out = out.map(e => (e.ruleId === 'R90005' && e.kind === 'move' ? { ...e, after: res.pos === 'below' ? `${e.after}, below “${KIM_DENY.name}”` : `${e.after}, above “${KIM_DENY.name}”` } : e));
      }
      if (res.folder === 'theirs') out = out.filter(e => !(e.ruleId === 'F01' && e.kind === 'folder'));
      else out = out.map(e => (e.ruleId === 'F01' && e.kind === 'folder' ? { ...e, after: `Folder renamed from “${THEIRS.folderName}” to “${folderName}”` } : e));
      return out;
    };
    const newBase = [{ ...s.base.get('R90004')!.rule, comment: 'Reviewed in the Q4 cleanup' }, ...(full ? [THEIRS.rule, KIM_DENY as Rule] : [])];
    s.rebaseOnto(p.version, fixEntries, fixEdits, keep, newBase);
    const api = zoneById.get('z0042-api')!.nsg; const db = zoneById.get('z0042-db')!.nsg;
    f.finishRebase({ version: p.version, kept: keep && hadApproval,
      notices: [`Rebased onto Version ${p.version} (${p.by}, “${p.set}”).`, `${p.by} removed the Folder “${THEIRS.removedFolderName}”. “${r6?.name ?? R6}”, which this Change set put into it, stays where it is, outside every Folder.`],
      since: [`${db}: 2 NSG rules get a new priority, because Version ${p.version} turned off Rules above them. What they allow stays the same.`, `${api}: 3 NSG rules get a new priority. What they allow stays the same.`] });
    onClose();
  };

  const col = (label: string, who: string, cls = '') => <th className={cls}>{t(label)}<div className="muted">{who}</div></th>;
  const ruleRows: [string, (r: Rule) => string][] = [['Name', r => r.name], ['Source', r => names(r.src)], ['Destination', r => names(r.dst)], ['Service', r => names(r.svc)], ['Action', r => r.action], ['Enabled', r => (r.enabled ? 'on' : 'off')], ['Expiry', r => r.expiry ?? '—'], ['Comment', r => r.comment || '—']];
  return (
    <div className="review rebase" role="dialog" aria-label={t('Rebase')}>
      <header className="rv-h">
        <div><h1>{t('Rebase onto Version')} {p.version}</h1>
          <p>{p.by} {t('committed')} “{p.set}”. {t('38 of its edits rebase cleanly.')} {left ? `${left} ${t(left === 1 ? 'conflict waits for you' : 'conflicts wait for you')}.` : t('Every conflict is resolved.')}</p></div>
        <span className="sp" /><button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button>
      </header>
      <div className="rv-b">
        <section className="rv-c rv-l"><h3>{t('Conflicts')}</h3>
          {items.map(i => <button key={i.id} className={`cf ${sel === i.id ? 'on' : ''} ${i.done ? 'done' : ''}`} onClick={() => setSel(i.id)}>
            {i.done ? <CheckmarkCircle16Filled className="ok" /> : <Circle16Regular />}<span><span className="ek move">{t(i.kind)}</span> <b>{i.title}</b><span className="muted">{i.sub}</span></span></button>)}
          <h3>{t('Rebases cleanly')}</h3>
          <div className="cf-n"><Info16Regular /><span>{p.by} {t('removed the Folder')} “{THEIRS.removedFolderName}”. “{r6?.name}” {t('which you put into it, stays where it is, outside every Folder.')}</span></div>
          <div className="cf-n"><Info16Regular /><span>“DB from API”: {p.by} {t('changed its comment. Your Change set does not change this Rule.')}</span></div>
          <div className="cf-n"><Info16Regular /><span>{t('37 more edits of Version')} {p.version} {t('touch nothing you changed.')}</span></div>
        </section>

        <section className="rv-c rv-m">
          {sel === 'rule' && full && <>
            <h3>{t('The same Rule changed on both sides')}</h3>
            <p className="cd-p">{t('A conflict counts per Rule, not per field: merging single fields would make a Rule nobody reviewed. One side wins as a whole, or you redo your change on top of theirs.')}</p>
            <table className="mini cmp"><thead><tr><th />{col('Base', 'Version 1290')}{col('Theirs', `Version ${p.version}, ${p.by}`)}{col('Yours', 'CHG-5120')}{res.rule && col('Result', '', 'res')}</tr></thead>
              <tbody>{ruleRows.map(([k, g]) => <tr key={k}><td>{t(k)}</td><td>{g(base)}</td><td className={g(THEIRS.rule) !== g(base) ? 'chg' : ''}>{g(THEIRS.rule)}</td><td className={g(mine) !== g(base) ? 'chg' : ''}>{g(mine)}</td>{res.rule && <td className="res">{g(result)}</td>}</tr>)}</tbody></table>
            <RadioGroup value={res.rule ?? ''} onChange={(_, d) => setRes({ ...res, rule: d.value as Res['rule'] })}>
              <Radio value="theirs" label={<span><b>{t('Take theirs')}</b> <span className="muted">{t('Drops your service change. The Rule stays off.')}</span></span>} />
              <Radio value="mine" label={<span><b>{t('Keep yours')}</b> <span className="muted">{t('Your Rule as a whole: it turns the Rule back on, which kim turned off.')}</span></span>} />
              <Radio value="merge" label={<span><b>{t('Theirs, then your change')}</b> <span className="muted">{t('Starts from kim’s Rule and applies your service change again.')}</span></span>} />
            </RadioGroup>
            <p className="muted"><a className="link" onClick={() => { onClose(); onRule('R90003'); }}>{t('Open the Rule in the Rule base')}</a></p>
          </>}
          {sel === 'pos' && full && <>
            <h3>{t('Confirm the position of your Rule')}</h3>
            <p className="cd-p">{t('You moved “Admins to jump hosts” up. Version')} {p.version} {t('put “Block RDP to jump hosts” there. The two overlap with the other action: both match')} {ref('g7').name} {t('to app0001-jump on RDP, so their order decides.')}</p>
            <div className="slices">{(['above', 'below'] as const).map(pos => (
              <label key={pos} className={`slice ${res.pos === pos ? 'on' : ''}`}><input type="radio" name="pos" checked={res.pos === pos} onChange={() => setRes({ ...res, pos })} />
                <b>{t(pos === 'above' ? 'Yours above theirs' : 'Yours below theirs')}</b>
                <span className="muted">{t(pos === 'above' ? 'Admins keep RDP to the jump hosts. Everyone else is blocked.' : 'kim’s deny Rule blocks RDP for everyone, admins too. SSH stays open for admins.')}</span>
                <div className="sl">{slice(pos).map(({ r, n }) => <div key={r.id} className={`sl-r ${r.action} ${r.id === 'R90005' ? 'me' : r.id === KIM_DENY.id ? 'them' : ''}`}>
                  <span className="muted">{n}</span><span className={`act ${r.action}`}>{r.action === 'allow' ? <Checkmark12Filled /> : <Dismiss12Filled />}</span><b>{r.name}</b>
                  <span className="muted">{names(r.src)} <ArrowRight16Regular /> {names(r.dst)} · {names(r.svc)}</span></div>)}</div>
              </label>))}</div>
          </>}
          {sel === 'folder' && <>
            <h3><Folder16Regular /> {t('The same Folder renamed on both sides')}</h3>
            <table className="mini cmp"><thead><tr><th />{col('Base', `Version ${p.version - 1}`)}{col('Theirs', `Version ${p.version}, ${p.by}`)}{col('Yours', 'CHG-5120')}</tr></thead>
              <tbody><tr><td>{t('Name')}</td><td>{baseFolder}</td><td className="chg">{THEIRS.folderName}</td><td className="chg">{mineFolder}</td></tr></tbody></table>
            <RadioGroup value={res.folder ?? ''} onChange={(_, d) => setRes({ ...res, folder: d.value as Res['folder'] })}>
              <Radio value="theirs" label={<span><b>{t('Take theirs')}</b> “{THEIRS.folderName}”</span>} />
              <Radio value="mine" label={<span><b>{t('Keep yours')}</b> “{mineFolder}”</span>} />
              <Radio value="new" label={<span><b>{t('Another name')}</b> <Input size="small" value={res.folderName ?? ''} onFocus={() => setRes(r => ({ ...r, folder: 'new' }))} onChange={(_, d) => setRes({ ...res, folder: 'new', folderName: d.value })} /></span>} />
            </RadioGroup>
            <p className="cd-p ok">{t('Resolving this moves no Rule, so it keeps the Approvals.')}</p>
          </>}
        </section>

        <section className="rv-c rv-r"><h3>{t('Approvals')}</h3>
          {!hadApproval ? <p className="cd-p">{t('This Change set has no Approvals yet. After the Rebase it is validated again, and its Affected Zones are computed again.')}</p>
            : keep ? <p className="cd-p ok">{t('No resolution here moves a Rule: the Approvals stay. The Commit dialog lists what changed since the Approval.')}</p>
            : <p className="cd-p pending">{t('Resolving a Rule or a position conflict resets the Approvals: the Change set returns to Open and needs Submit again.')}</p>}
          {full && <><h3>{t('Affected Zones')}</h3><p className="cd-p">{t('Computed again after the Rebase. Zones that are new need their own Approval:')} <b>app0001-jump</b>.</p></>}
          <h3>{t('Then')}</h3>
          <p className="cd-p">{t('Your Change set is based on Version')} {p.version}. {t('A Change set commits only when it is rebased onto the latest Version without conflicts.')}</p>
          <div className="rv-act"><Button appearance="primary" disabled={left > 0} onClick={finish}>{left ? `${left} ${t('left')}` : t('Finish the Rebase')}</Button> <Button appearance="subtle" onClick={onClose}>{t('Later')}</Button></div>
        </section>
      </div>
    </div>
  );
}
