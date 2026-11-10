// PROTOTYPE, throwaway (issue 35). One candidate subnet: why it is not onboardable, with the evidence, or the onboarding choices this ticket covers:
// the Egress posture and the proposed DNS Rule. Import and the rest of onboarding belong to "Prototype: Deployment, Drift and Import views".
import { useState } from 'react';
import { Button, Checkbox } from '@fluentui/react-components';
import { Dismiss20Regular, Warning16Filled, Info16Regular, Checkmark12Filled, ErrorCircle16Filled } from '@fluentui/react-icons';
import { Candidate, Zone, Egress, zones, zoneById, vnets, envs } from './data';
import { useStore, onDiscard } from './store';
import { evidence, dnsOf, onboarded } from './zonedata';
import { dnsRuleInit } from './ZoneDetail';
import { Glyph } from './Glyph';
import { useT } from './i18n';
import './zone.css';

const added: string[] = [];
onDiscard(() => { for (const id of added.splice(0)) { const i = zones.findIndex(z => z.id === id); if (i >= 0) zones.splice(i, 1); zoneById.delete(id); } onboarded.clear(); });
const reasonTitle: Record<string, string> = { reasonSpecial: 'Azure forbids an NSG on this subnet', reasonService: 'A service maintains its NSG rules', reasonForward: 'It forwards traffic for other subnets', reasonAks: 'AKS maintains its NSG', reasonTool: 'It holds nsgfw itself' };

export function OnboardPanel({ c, onClose, onDone }: { c: Candidate; onClose: () => void; onDone: (zid: string) => void }) {
  const s = useStore(); const { t } = useT();
  const v = vnets.find(x => x.name === c.vnet)!; const env = envs.find(e => e.id === c.env)!;
  const [egress, setEgress] = useState<Egress>('dest'); const [dnsOn, setDnsOn] = useState(true);
  const dns = dnsOf(c.vnet); const name = `${c.vnet.slice(5, 12)}-${c.subnet.replace(/^snet-(new-)?/, '')}`; const done = onboarded.get(c.id);
  const lands = !dns ? '' : [dns.zone ? `inbound on the Managed NSG of ${zoneById.get(dns.zone)?.name}` : '', egress === 'strict' ? 'outbound on the new Zone, because it is strict' : ''].filter(Boolean).join(', and ');
  const onboard = () => {
    const id = `z-${c.id}`;
    const z: Zone = { id, name, env: c.env, vnet: c.vnet, sub: v.sub, region: v.region, prefix: c.prefix, egress, nsg: c.nsg ?? `nsg-${name}`, rules: c.nsg ? 14 : 0, addrSrc: 0, addrDst: 0, asgs: 0, flags: c.nsg ? ['import'] : [], inherited: !!c.nsg };
    zones.push(z); zoneById.set(id, z); added.push(id); onboarded.set(c.id, id);
    s.note({ kind: 'zone', ruleId: `zone:${id}`, field: 'Onboarding', before: 'candidate', covers: [id],
      after: `${c.subnet} becomes the Zone ${name}: ${c.nsg ? (c.shared ? `new Managed NSG swapped in for the shared ${c.nsg}` : `${c.nsg} adopted in place`) : 'new Managed NSG'}, Egress posture ${egress === 'dest' ? 'destination decides' : 'strict'}`,
      write: { name: c.nsg ? (c.shared ? 'new Managed NSG, then the subnet swap' : `${c.nsg} adopted in place`) : 'new Managed NSG', dir: 'in', priority: 0 } });
    if (dns && dnsOn) { const init = dnsRuleInit(z); if (init) s.addRule(s.rules[s.rules.length - 1].id, undefined, init); }
    onDone(id);
  };
  return (
    <div className="pal-bg" onMouseDown={onClose}>
      <aside className="onb" role="dialog" aria-label={t('Onboard')} onMouseDown={e => e.stopPropagation()}>
        <header><div><div className="lib-k t-subnet"><Glyph kind="subnet" />{t('Candidate')}</div><h2>{c.subnet}</h2><div className="mono lib-v">{c.prefix} · {c.vnet} · {env.name}</div></div><span className="sp" /><button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button></header>
        {c.reason ? <section>
          <p className="owarn red"><ErrorCircle16Filled /><span><b>{t('Not onboardable')}: {t(reasonTitle[c.reason])}.</b></span></p>
          <p>{t(evidence[c.reason](c))}</p>
          <p className="muted">{t('It stays read-only and can be used as a subnet Address object, so Rules can still name it as source or destination.')}</p>
          <p className="muted small">{t('Detected from')}: {t(c.reason === 'reasonForward' ? 'enableIPForwarding on its network interfaces' : c.reason === 'reasonAks' || c.reason === 'reasonService' ? 'the managed resource group and the writer of its NSG' : c.reason === 'reasonTool' ? 'the deployment configuration of nsgfw' : 'the subnet name and delegation')}.</p>
        </section> : done ? <section><p className="ok"><Checkmark12Filled /> {t('In your Change set as the Zone')} <b>{zoneById.get(done)?.name}</b>.</p></section> : <>
          <section><h3>{t('Existing NSG')}</h3><p>{c.nsg ? (c.shared ? <><span className="mono">{c.nsg}</span> {t('is shared with other subnets. The tool creates a new Managed NSG and swaps it in.')}</> : <><span className="mono">{c.nsg}</span> {t('is used only by this subnet. It is adopted in place and keeps its name and resource group.')}</>) : t('None. The tool creates a Managed NSG.')}</p>
            {c.nsg && <p className="muted small"><Info16Regular /> {t('Import turns its rules into Rules in the same Change set, with Import notes and Inherited defaults. That view belongs to the Import prototype.')}</p>}</section>
          <section><h3>{t('Egress posture')}</h3>
            <div className="egopt">{(['dest', 'strict'] as Egress[]).map(e => <button key={e} className={`eg ${egress === e ? 'on' : ''}`} onClick={() => setEgress(e)}><b>{t(e === 'dest' ? 'Destination decides' : 'Strict')}</b>
              <span>{t(e === 'dest' ? 'The default. Outbound to internal addresses stays open, so onboarding breaks nothing outbound.' : 'Only what a Rule allows leaves the Zone. Check the Flow view first.')}</span></button>)}</div></section>
          <section><h3>{t('Proposed Rules')}</h3>
            {dns ? <div className={`prop ${dnsOn ? 'on' : ''}`}><Checkbox checked={dnsOn} onChange={(_, d) => setDnsOn(!!d.checked)} label={<b>{t('DNS from')} {name}</b>} />
              <p className="mono small">{name} → {dns.servers.join(', ')} · UDP 53, TCP 53 · {t('allow')}</p>
              <p className="muted small">{t('The VNet uses custom DNS servers')} ({t(dns.where)}). {lands ? `${t('Lands')} ${t(lands)}.` : t('Writes nothing today: the posture lets it out and the servers are in no Zone. It keeps name resolution working when the Zone turns strict.')}</p></div>
              : <p className="muted">{t('The VNet uses Azure-provided DNS, which NSGs do not filter. No Rule needed.')}</p>}</section>
          <footer><span className="muted small">{t('Lands in your current Change set. Approval:')} {t(env.level)}.</span><span className="sp" /><Button appearance="primary" onClick={onboard}>{t('Add to Change set')}</Button></footer>
        </>}
      </aside>
    </div>
  );
}
