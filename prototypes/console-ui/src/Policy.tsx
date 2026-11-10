// PROTOTYPE, throwaway. Issue 36: Policy findings in full (deny, audit, modify, "not enforced", "exempt"), the finding in the
// Rule editor, and the Pre-check waiver. The pre-check runs at Submit, on demand and in the Emergency Commit dialog, not on every edit.
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea } from '@fluentui/react-components';
import { ArrowSync16Regular, ShieldError16Filled, ShieldCheckmark16Regular, Info16Regular, ShieldDismiss16Regular } from '@fluentui/react-icons';
import { useStore, Preview } from './store';
import { envs } from './data';
import { useFlow, useCsId } from './flow';
import { usePreview } from './ChangeViews';
import { useT } from './i18n';

export interface Finding {
  key: string; assignment: string; scope: string; effect: 'deny' | 'audit' | 'modify'; status: 'enforced' | 'not-enforced' | 'exempt';
  why?: string; message: string; resource: string; zone?: string; env: string; rule?: string;
}

// Mock pre-check result, shaped like checkPolicyRestrictions plus the tool's own reads of assignments and exemptions.
export function buildFindings(pv: Preview, forceDeny: boolean, changed: string[]): Finding[] {
  const out: Finding[] = [];
  const deny = [...new Set(pv.policy.filter(p => p.effect === 'deny' && p.rule).map(p => p.rule))];
  if (forceDeny && !deny.length) { const id = changed.find(r => pv.nsgs.some(n => n.ops.some(o => o.rule === r))); if (id) deny.push(id); }
  for (const rid of deny) {
    pv.nsgs.filter(n => n.ops.some(o => o.rule === rid)).slice(0, 3).forEach((n, i) => out.push({
      key: `mgmt|${n.nsg}`, assignment: 'Deny management ports from the Internet', scope: 'management group “Landing zones”', effect: 'deny',
      status: i === 2 ? 'exempt' : 'enforced', why: i === 2 ? 'Exemption “jump-hosts-2026” covers this NSG until 2026-12-31, for this one policy of the initiative.' : undefined,
      message: 'RDP and SSH must not be reachable from the Internet. Use Azure Bastion or the jump hosts.', resource: n.nsg, zone: n.zone, env: n.env, rule: rid,
    }));
  }
  if (pv.nsgs.length) {
    const a = pv.nsgs[0]; const b = pv.nsgs.find(n => n.env !== a.env) ?? pv.nsgs[pv.nsgs.length - 1];
    out.push({ key: `pilot|${b.nsg}`, assignment: 'Deny inbound from the Internet to subnets (pilot)', scope: `subscription of ${b.zone}`, effect: 'deny', status: 'not-enforced',
      why: 'The assignment has the enforcement mode “Do not enforce”.', message: 'Inbound from the Internet must go through the application gateway.', resource: b.nsg, zone: b.zone, env: b.env });
    out.push({ key: `tag|${a.nsg}`, assignment: 'Inherit the costCenter tag from the resource group', scope: 'management group “Landing zones”', effect: 'modify', status: 'enforced',
      message: 'Azure adds the tag costCenter on write. The tool does not own this tag, so the write stands.', resource: a.nsg, zone: a.zone, env: a.env });
    out.push({ key: `flowlog|${a.env}`, assignment: 'Audit VNet flow logs', scope: 'management group “Landing zones”', effect: 'audit', status: 'enforced',
      message: 'The VNet of this Zone has no VNet flow log, so its Flow view stays empty.', resource: `VNet of ${a.zone}`, zone: a.zone, env: a.env });
  }
  return out;
}

export function useFindings(pv: Preview) {
  const s = useStore(); const f = useFlow(); const cs = useCsId();
  const all = useMemo(() => buildFindings(pv, f.forceDeny, [...s.status.keys()]), [pv, f.forceDeny, s.status]);
  const waivers = f.waivers[cs] ?? {}; const check = f.checks[cs];
  const blocking = all.filter(x => x.effect === 'deny' && x.status === 'enforced' && !waivers[x.key]);
  return { all, blocking, waivers, check, ran: !!check, stale: !!check && check.edits !== s.edits.length };
}
// The commit bar counts blocking findings only once the pre-check has run.
export const useBlocking = (pv: Preview) => { const x = useFindings(pv); return x.ran ? x.blocking.length : 0; };

const envName = (id: string) => envs.find(e => e.id === id)?.name ?? id;

function FindingRow({ f, compact, onWaive }: { f: Finding; compact?: boolean; onWaive: (f: Finding) => void }) {
  const { t } = useT(); const fl = useFlow(); const cs = useCsId(); const w = fl.waivers[cs]?.[f.key];
  const tone = f.status !== 'enforced' ? 'info' : f.effect === 'deny' ? (w ? 'waived' : 'deny') : 'info';
  const label = f.status === 'not-enforced' ? t('not enforced') : f.status === 'exempt' ? t('exempt') : f.effect;
  return (
    <div className={`pf ${tone}`}>
      <div className="pf-h">{tone === 'deny' ? <ShieldError16Filled /> : tone === 'waived' ? <ShieldDismiss16Regular /> : f.effect === 'deny' ? <Info16Regular /> : <ShieldCheckmark16Regular />}
        <b>{f.assignment}</b><span className={`pf-e e-${tone}`}>{label}</span></div>
      {!compact && <div className="pf-m">{f.message}</div>}
      <div className="pf-r">{f.rule ? <>{t('Rule')} <span className="mono">{f.rule}</span> {t('violates it on')} <b>{f.zone}</b></> : <>{t('On')} <b>{f.resource}</b></>}
        <span className="muted"> · <span className="mono">{f.resource}</span> · {envName(f.env)}{!compact && ` · ${t('assigned at')} ${f.scope}`}</span></div>
      {f.why && <div className="pf-why">{t(f.why)}</div>}
      {w && <div className="pf-why">{t('Waived by')} {w.by} {t('at')} {w.at}: “{w.reason}”. {t('The tool sends this write, and Azure decides.')} <a className="link" onClick={() => fl.unwaive(cs, f.key)}>{t('Withdraw')}</a></div>}
      {tone === 'deny' && <div className="pf-a"><Button size="small" onClick={() => onWaive(f)}>{t('Waive…')}</Button><span className="muted">{t('Admins only. Or change the Rule.')}</span></div>}
    </div>
  );
}

export function PolicyFull({ pv }: { pv: Preview }) {
  const s = useStore(); const fl = useFlow(); const cs = useCsId(); const { t } = useT(); const x = useFindings(pv); const [waive, setWaive] = useState<Finding | null>(null);
  const run = () => fl.runCheck(cs, 'on demand', s.edits.length);
  if (!pv.nsgs.length) return <p className="muted">{t('Nothing is written to Azure, so there is nothing to check.')}</p>;
  if (!x.ran) return (
    <div><p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>{t('The pre-check has not run for this Change set yet. It runs at Submit, before every Deployment, and when you start it here.')}</p>
      <Button size="small" icon={<ArrowSync16Regular />} onClick={run}>{t('Run check now')}</Button></div>
  );
  const waived = x.all.filter(f => f.effect === 'deny' && f.status === 'enforced' && x.waivers[f.key]);
  const info = x.all.filter(f => f.effect !== 'deny' && f.status === 'enforced');
  const off = x.all.filter(f => f.status !== 'enforced');
  return (
    <div>
      <div className="pf-run"><span>{t('Last run')} {x.check!.at}, {t(x.check!.why === 'Submit' ? 'at Submit' : x.check!.why === 'Emergency Commit' ? 'in the Emergency Commit dialog' : 'on demand')}.</span>
        {x.stale && <span className="pending">{t('You edited since then. Submit runs it again.')}</span>}<span className="sp" /><Button size="small" appearance="subtle" icon={<ArrowSync16Regular />} onClick={run}>{t('Run again')}</Button></div>
      {x.blocking.length > 0 && <><div className="pf-g red">{x.blocking.length} {t(x.blocking.length === 1 ? 'finding blocks Submit and Commit' : 'findings block Submit and Commit')}</div>{x.blocking.map(f => <FindingRow key={f.key} f={f} onWaive={setWaive} />)}</>}
      {waived.length > 0 && <><div className="pf-g">{t('Waived')}</div>{waived.map(f => <FindingRow key={f.key} f={f} onWaive={setWaive} />)}</>}
      {info.length > 0 && <><div className="pf-g">{t('Information: audit and modify never block')}</div>{info.map(f => <FindingRow key={f.key} f={f} onWaive={setWaive} />)}</>}
      {off.length > 0 && <details className="pf-off"><summary>{off.length} {t('deny findings that Azure does not enforce here: not enforced or exempt')}</summary>{off.map(f => <FindingRow key={f.key} f={f} onWaive={setWaive} />)}</details>}
      {!x.all.length && <p className="ok">{t('No Policy findings.')}</p>}
      <WaiverDialog finding={waive} onClose={() => setWaive(null)} />
    </div>
  );
}

// The finding where the author works: in the Rule editor, under "Before you submit".
export function RulePolicy({ id }: { id: string }) {
  const { t } = useT(); const pv = usePreview(); const x = useFindings(pv); const [waive, setWaive] = useState<Finding | null>(null);
  const mine = x.all.filter(f => f.rule === id);
  if (!x.ran || !mine.length) return null;
  return (<><h3>{t('Policy findings')} <span className="muted">· {t('last run')} {x.check!.at}</span></h3>{mine.map(f => <FindingRow key={f.key} f={f} compact onWaive={setWaive} />)}<WaiverDialog finding={waive} onClose={() => setWaive(null)} /></>);
}

export function WaiverDialog({ finding, onClose }: { finding: Finding | null; onClose: () => void }) {
  const fl = useFlow(); const cs = useCsId(); const { t } = useT(); const [reason, setReason] = useState('');
  const f = finding;
  return (
    <Dialog open={!!f} onOpenChange={(_, d) => { if (!d.open) { setReason(''); onClose(); } }}>
      <DialogSurface style={{ maxWidth: 560 }}><DialogBody><DialogTitle>{t('Pre-check waiver')}</DialogTitle>
        {f && <DialogContent>
          <table className="mini kv"><tbody>
            <tr><td>{t('Policy')}</td><td><b>{f.assignment}</b><div className="muted">{f.scope}</div></td></tr>
            <tr><td>{t('Effect')}</td><td><span className="pf-e e-deny">deny</span> {f.message}</td></tr>
            <tr><td>{t('Resource')}</td><td><span className="mono">{f.resource}</span>, {f.zone}, {envName(f.env)}</td></tr>
            {f.rule && <tr><td>{t('Rule')}</td><td className="mono">{f.rule}</td></tr>}
            <tr><td>{t('Change set')}</td><td>{cs}</td></tr>
          </tbody></table>
          <p className="cd-p">{t('The waiver lets this one write through the pre-check, for this resource and this Change set only. Azure still decides: a deny there fails the write. It survives a Rebase while the finding stays the same, does not reset Approvals, shows in the Preview for approvers and goes into the audit log.')}</p>
          <Field label={t('Reason (required)')} required><Textarea value={reason} onChange={(_, d) => setReason(d.value)} placeholder={t('For example: exemption requested in ticket SEC-1234, valid from tomorrow')} /></Field>
        </DialogContent>}
        <DialogActions><Button onClick={() => { setReason(''); onClose(); }}>{t('Cancel')}</Button>
          <Button appearance="primary" disabled={reason.trim().length < 5} onClick={() => { if (f) fl.waive(cs, f.key, reason.trim()); setReason(''); onClose(); }}>{t('Waive this finding')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}
