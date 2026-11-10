// PROTOTYPE, throwaway. Issue 37: what Import finds and makes at onboarding. The legacy NSGs of the candidates with their NSG rules, ASGs and
// foreign-IaC evidence, the Inherited defaults each one keeps, and per NSG rule the Rule it becomes, with its Import notes and merge group.
// Below that, the onboarding in the current Change set: provenance of the added Rules, acknowledgements, the Handover and the Import snapshot.
// Nothing here is real. Internet addresses come from the documentation ranges; the hub range 10.255.64.0/26 is made up.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { candidates, vnets, zones, zoneById, objects, objById, services, svcById, envs, Candidate, Rule, Zone, Obj } from './data';
import { onboarded } from './zonedata';
import { useStore, onDiscard, placement, Store } from './store';

export type NoteLevel = 'blocking' | 'warning' | 'info';
export interface Note { level: NoteLevel; text: string; resolve?: string }
export interface LegacyRule { name: string; priority: number; dir: 'in' | 'out'; access: 'Allow' | 'Deny'; src: string; dst: string; proto: string; ports: string; desc: string }
export interface LegacyAsg { name: string; rg: string; members: number; unmappable?: { why: string; resolve: string } }
export interface Evidence { tool: string; lines: string[]; checklist: string[]; line: string }
/** One NSG rule and the Rule it becomes. Addresses: 'self' is the new Zone, 'asg:<name>' a referenced ASG, anything else an object id. */
export interface Imp { from: string; src: string[]; dst: string[]; svc: string[]; notes: Note[]; merge?: string; folder?: string; opens?: string }
export interface Legacy { nsg: string; rg: string; shared: string[]; rules: LegacyRule[]; asgs: LegacyAsg[]; evidence?: Evidence; imports: Imp[]; dropped: { from: string; note: Note }[]; zoneNotes: Note[] }
export type InhPart = 'inbound from VirtualNetwork' | 'outbound to VirtualNetwork' | 'outbound to Internet';
export const inhParts: InhPart[] = ['inbound from VirtualNetwork', 'outbound to VirtualNetwork', 'outbound to Internet'];
export interface Plan { c: Candidate; sub: string; region: string; legacy?: Legacy; inherited: Record<InhPart, { set: boolean; why: string }>; warnings: string[]; tf?: { module: string; file: string } }

// ---------- candidates: c903 comes from zonedata.ts; these complete the app0042 story and its Non-production copy.
const more: Candidate[] = [
  { id: 'c904', subnet: 'snet-new-orders', vnet: 'vnet-app0602-ger', env: 'nonprod', prefix: '10.150.210.0/26', nsg: 'nsg-orders-nonprod' },
  { id: 'c905', subnet: 'snet-new-reports', vnet: 'vnet-app0042-wes', env: 'prod', prefix: '10.10.210.64/26', nsg: 'nsg-legacy-app0042-shared', shared: true },
  { id: 'c906', subnet: 'snet-agw', vnet: 'vnet-app0042-wes', env: 'prod', prefix: '10.10.210.128/27', nsg: 'nsg-legacy-agw' },
  { id: 'c907', subnet: 'snet-new-pe', vnet: 'vnet-app0042-wes', env: 'prod', prefix: '10.10.210.160/27' },
];
if (!candidates.some(c => c.id === 'c904')) candidates.push(...more);
const first = ['c903', 'c904', 'c905', 'c906', 'c907'];
candidates.sort((a, b) => (first.includes(a.id) ? first.indexOf(a.id) : 99) - (first.includes(b.id) ? first.indexOf(b.id) : 99));
export const candOf = (id: string) => candidates.find(c => c.id === id);
export const onboardable = (c: Candidate) => !c.reason && !onboarded.has(c.id);
export const subOf = (vnet: string) => vnets.find(v => v.name === vnet)?.sub ?? '';

// ---------- legacy NSGs
const L = (name: string, priority: number, dir: 'in' | 'out', access: 'Allow' | 'Deny', src: string, dst: string, proto: string, ports: string, desc: string): LegacyRule => ({ name, priority, dir, access, src, dst, proto, ports, desc });
const took = (nsg: string, rule: string, prio: number) => ({ set: true, why: `\`${rule}\` (${prio}) took effect in \`${nsg}\`.` });
const denied = (rule: string, prio: number) => ({ set: false, why: `Not set: rule \`${rule}\` at ${prio} denied it before.` });
const allThree = (why: string) => Object.fromEntries(inhParts.map(p => [p, { set: true, why }])) as Plan['inherited'];
const defaults = (nsg: string): Plan['inherited'] => ({ 'inbound from VirtualNetwork': took(nsg, 'AllowVnetInBound', 65000), 'outbound to VirtualNetwork': took(nsg, 'AllowVnetOutBound', 65000), 'outbound to Internet': took(nsg, 'AllowInternetOutBound', 65001) });
const bastion = L('allow-bastion-ssh', 110, 'in', 'Allow', '10.255.64.0/26', '*', 'Tcp', '22', 'Hub Bastion');
const winrm = L('allow-monitoring-winrm', 120, 'in', 'Allow', '10.0.85.0/26', '*', 'Tcp', '5985-5986', 'Monitoring agents');
const bastionImp: Imp = { from: 'allow-bastion-ssh', src: ['imp-hub-bastion'], dst: ['self'], svc: ['svc-ssh'], notes: [], merge: 'bastion' };
const winrmImp: Imp = { from: 'allow-monitoring-winrm', src: ['zone:z0001-mgmt'], dst: ['self'], svc: ['svc-winrm'], notes: [], merge: 'winrm' };
const lbRedundant = { level: 'info' as const, text: 'Not imported: redundant with the posture. The Platform exceptions band allows AzureLoadBalancer above every Rule.' };

const hand: Record<string, Omit<Plan, 'c' | 'sub' | 'region'>> = {
  c903: {
    legacy: { nsg: 'nsg-legacy-orders', rg: 'rg-app0042-orders', shared: [], asgs: [{ name: 'asg-orders-app', rg: 'rg-app0042-orders', members: 4 }],
      rules: [L('allow-https-from-web', 100, 'in', 'Allow', '10.10.128.0/26', '*', 'Tcp', '443', 'Orders UI from the web tier'), { ...bastion }, { ...winrm },
        L('allow-lb-probe', 130, 'in', 'Allow', 'AzureLoadBalancer', '*', '*', '*', 'Load balancer health probe'), L('allow-app-from-asg', 140, 'in', 'Allow', 'asg-orders-app', '*', 'Tcp', '8080', 'Order workers to the app'),
        L('deny-vnet-in', 4000, 'in', 'Deny', 'VirtualNetwork', 'VirtualNetwork', '*', '*', 'Only the listed sources'), L('allow-orders-to-api', 100, 'out', 'Allow', '*', '10.10.131.0/26', 'Tcp', '8443', 'Orders service calls the API')],
      imports: [
        { from: 'allow-https-from-web', src: ['zone:z0042-web'], dst: ['self'], svc: ['svc-https'], notes: [] },
        bastionImp, winrmImp,
        { from: 'allow-app-from-asg', src: ['asg:asg-orders-app'], dst: ['self'], svc: ['svc-c80'], notes: [] },
        { from: 'deny-vnet-in', src: ['tag:VirtualNetwork'], dst: ['self'], svc: ['svc-any'], notes: [{ level: 'warning', text: 'VirtualNetwork kept as a one-sided tag: on this Zone it matches the VNet, its peerings and the routes Azure learns, as Azure resolves the tag. It is not the Internal address space.' }] },
        { from: 'allow-orders-to-api', src: ['self'], dst: ['zone:z0042-api'], svc: ['svc-c443'], opens: 'z0042-api',
          notes: [{ level: 'warning', text: 'Opens on the managed Zone app0042-api: its Managed NSG gets an inbound allow from this Zone on TCP 8443. Until now app0042-api decided this flow alone.' }] },
      ],
      dropped: [{ from: 'allow-lb-probe', note: lbRedundant }],
      zoneNotes: [{ level: 'warning', text: 'Starts destination-enforced. Outbound to Internal addresses that the old VirtualNetwork tag did not hold opens: snet-new-orders → 10.40.9.0/26 (app0160-db) TCP 1433 was seen in the last 30 days.' }] },
    inherited: { 'inbound from VirtualNetwork': denied('deny-vnet-in', 4000), 'outbound to VirtualNetwork': took('nsg-legacy-orders', 'AllowVnetOutBound', 65000), 'outbound to Internet': took('nsg-legacy-orders', 'AllowInternetOutBound', 65001) },
    warnings: [],
  },
  c904: {
    legacy: { nsg: 'nsg-orders-nonprod', rg: 'rg-app0602-orders', shared: [],
      asgs: [{ name: 'asg-orders-app-test', rg: 'rg-app0602-orders', members: 3 },
        { name: 'asg-orders-workers', rg: 'rg-orders-legacy', members: 0, unmappable: { why: 'It sits in resource group `rg-orders-legacy`, which the Tool identity cannot read, so its members are unknown.', resolve: 'Give the Tool identity Reader on `rg-orders-legacy`, or replace the ASG in the Rule `allow-workers-amqp` with an Address object.' } }],
      rules: [L('allow-https-from-web', 100, 'in', 'Allow', '10.150.128.0/26', '*', 'Tcp', '443', 'Orders UI from the web tier'), { ...bastion }, { ...winrm },
        L('allow-app-from-asg', 130, 'in', 'Allow', 'asg-orders-app-test', '*', 'Tcp', '8080', 'Order workers to the app'), L('allow-workers-amqp', 140, 'in', 'Allow', 'asg-orders-workers', '*', 'Tcp', '5671-5672', 'Queue consumers'),
        L('allow-any-8443', 150, 'in', 'Allow', '10.150.128.0/18', '*', '*', '8443', 'Health endpoint')],
      imports: [
        { from: 'allow-https-from-web', src: ['zone:z0602-web'], dst: ['self'], svc: ['svc-https'], notes: [] },
        bastionImp, winrmImp,
        { from: 'allow-app-from-asg', src: ['asg:asg-orders-app-test'], dst: ['self'], svc: ['svc-c80'], notes: [] },
        { from: 'allow-workers-amqp', src: ['asg:asg-orders-workers'], dst: ['self'], svc: ['svc-amqp'],
          notes: [{ level: 'blocking', text: 'The ASG `asg-orders-workers` cannot be mapped: it sits in resource group `rg-orders-legacy`, which the Tool identity cannot read.', resolve: 'Replace `asg-orders-workers` in From with an Address object, or delete this Rule. Then the note is resolved.' }] },
        { from: 'allow-any-8443', src: ['vnet:vnet-app0602-ger'], dst: ['self'], svc: ['svc-c443', 'svc-imp-udp8443'], notes: [{ level: 'warning', text: 'Protocol * with port 8443: imported as two services, TCP 8443 and UDP 8443. ICMP and other protocols no longer match.' }] },
      ],
      dropped: [], zoneNotes: [],
      evidence: { tool: 'Terraform',
        lines: ['`resourcechanges`: changedBy `sp-platform-tf`, clientType Terraform, 4 writes in 30 days', 'Activity Log caller: `sp-platform-tf`', 'Tag `managed-by=terraform` on `nsg-orders-nonprod`',
          'Repository `platform/network`: `modules/app0602/network.tf` declares `azurerm_network_security_group.orders` and `azurerm_subnet_network_security_group_association.orders`'],
        checklist: ['A `removed` block with `destroy = false` for `azurerm_network_security_group.orders`, so Terraform forgets the NSG without deleting it.',
          '`azurerm_subnet.orders`, or an inline subnet in `azurerm_virtual_network`, must not set the NSG: the association gets a `removed` block too.'],
        line: 'Terraform in `platform/network` no longer writes `nsg-orders-nonprod`.' } },
    inherited: defaults('nsg-orders-nonprod'), warnings: [],
  },
  c905: {
    legacy: { nsg: 'nsg-legacy-app0042-shared', rg: 'rg-app0042-network', shared: ['snet-new-batch', 'snet-new-files'], asgs: [],
      rules: [{ ...bastion, priority: 100 }, { ...winrm, priority: 110 }, L('allow-partner-https', 120, 'in', 'Allow', '203.0.3.0/24', '*', 'Tcp', '443', 'Partner report download'),
        L('allow-batch-to-reports', 130, 'in', 'Allow', '10.10.211.0/26', '10.10.210.64/26', 'Tcp', '8443', 'Batch writes reports'), L('allow-files-smb', 140, 'in', 'Allow', '*', '10.10.211.64/26', 'Tcp', '445', 'File shares'),
        L('deny-lb-in', 200, 'in', 'Deny', 'AzureLoadBalancer', '*', '*', '*', 'No load balancer here'), L('allow-reports-sql', 300, 'out', 'Allow', '*', '10.10.137.0/26', 'Tcp', '1433', 'Reports read the database'),
        L('deny-vnet-out', 4000, 'out', 'Deny', '*', 'VirtualNetwork', '*', '*', 'No east-west'), L('deny-internet-out', 4010, 'out', 'Deny', '*', 'Internet', '*', '*', 'No Internet')],
      imports: [
        { ...bastionImp }, { ...winrmImp },
        { from: 'allow-partner-https', src: ['n3'], dst: ['self'], svc: ['svc-https'], notes: [{ level: 'info', text: 'An existing Rule closes a flow: “Block known bad networks” (number 1) denies ext-partner-0003 first, so 203.0.3.0/24 → snet-new-reports TCP 443 stops.' }] },
        { from: 'allow-batch-to-reports', src: ['imp-snet-new-batch'], dst: ['self'], svc: ['svc-c443'], notes: [{ level: 'info', text: 'New Address object snet-new-batch for 10.10.211.0/26, bound to vnet-app0042-wes: that subnet is no Zone yet.' }] },
        { from: 'deny-lb-in', src: ['tag:AzureLoadBalancer'], dst: ['self'], svc: ['svc-any'], notes: [{ level: 'warning', text: 'A deny from AzureLoadBalancer: the Platform exceptions band allows AzureLoadBalancer above every Rule, so health probes reach snet-new-reports again.' }] },
        { from: 'allow-reports-sql', src: ['self'], dst: ['zone:z0042-db'], svc: ['svc-mssql'], notes: [{ level: 'warning', text: 'A cycle broke toward closing: the order of nsg-legacy-app0042-shared puts allow-reports-sql above deny-vnet-out, and with the Rule base no order keeps both. The deny comes first. Closes: snet-new-reports → app0042-db TCP 1433.' }] },
        { from: 'deny-vnet-out', src: ['self'], dst: ['tag:VirtualNetwork'], svc: ['svc-any'], notes: [] },
        { from: 'deny-internet-out', src: ['self'], dst: ['tag:Internet'], svc: ['svc-any'], notes: [] },
      ],
      dropped: [{ from: 'allow-files-smb', note: { level: 'info', text: 'Not imported: its destination 10.10.211.64/26 (snet-new-files) is disjoint from this Zone. It stays on nsg-legacy-app0042-shared for snet-new-files.' } }],
      zoneNotes: [] },
    inherited: { 'inbound from VirtualNetwork': took('nsg-legacy-app0042-shared', 'AllowVnetInBound', 65000), 'outbound to VirtualNetwork': denied('deny-vnet-out', 4000), 'outbound to Internet': denied('deny-internet-out', 4010) },
    warnings: [],
  },
  c906: {
    legacy: { nsg: 'nsg-legacy-agw', rg: 'rg-app0042-edge', shared: [], asgs: [],
      rules: [L('allow-gwm', 100, 'in', 'Allow', 'GatewayManager', '*', 'Tcp', '65200-65535', 'Required by Application Gateway v2'), L('allow-https-internet', 110, 'in', 'Allow', 'Internet', '*', 'Tcp', '443', 'Public listener'),
        L('allow-http-internet', 120, 'in', 'Allow', 'Internet', '*', 'Tcp', '80', 'Redirect to HTTPS')],
      imports: [
        { from: 'allow-https-internet', src: ['tag:Internet'], dst: ['self'], svc: ['svc-https'], folder: 'Web applications', notes: [{ level: 'info', text: 'Placed inside the Folder “Web applications”: a deny Rule there overlaps it, and the deny comes first.' }] },
        { from: 'allow-http-internet', src: ['tag:Internet'], dst: ['self'], svc: ['svc-http'], notes: [] },
      ],
      dropped: [{ from: 'allow-gwm', note: { level: 'info', text: 'Not imported: redundant with the posture. Platform exceptions allow GatewayManager on TCP 65200-65535 for an Application Gateway v2 subnet.' } }],
      zoneNotes: [] },
    inherited: defaults('nsg-legacy-agw'),
    warnings: ['Application Gateway v2: outbound stays open, required by Azure. The Zone keeps an outbound allow to the Internet whatever its Egress posture.'],
  },
  c907: {
    inherited: allThree('No NSG before: the subnet gets all three.'),
    warnings: ['Private endpoints with network policies off: NSG rules do not apply to them. This warning stays on the Zone until `privateEndpointNetworkPolicies` is Enabled on `snet-new-pe`.'],
  },
};

const pad = (n: number, w = 4) => String(n).padStart(w, '0');
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// Any other candidate: a small legacy NSG derived from its id, so a bulk selection always has something to show.
function generic(c: Candidate): Omit<Plan, 'c' | 'sub' | 'region'> {
  if (!c.nsg) return { inherited: allThree('No NSG before: the subnet gets all three.'), warnings: [] };
  const v = Number(/app(\d{4})/.exec(c.vnet)?.[1] ?? 1); const space = `10.${Math.floor(v / 4)}.${(v % 4) * 64}.0/18`; const db = zoneById.get(`z${pad(v)}-db`);
  const rules = [L('allow-https-from-vnet', 100, 'in', 'Allow', space, '*', 'Tcp', '443', 'Clients in the VNet'), { ...bastion }];
  const imports: Imp[] = [{ from: 'allow-https-from-vnet', src: [`vnet:${c.vnet}`], dst: ['self'], svc: ['svc-https'], notes: [] }, { ...bastionImp }];
  if (db && hash(c.id) % 2) {
    rules.push(L('allow-sql-to-db', 100, 'out', 'Allow', '*', db.prefix, 'Tcp', '1433', 'The app reads its database'));
    imports.push({ from: 'allow-sql-to-db', src: ['self'], dst: [`zone:${db.id}`], svc: ['svc-mssql'], opens: db.id, notes: [{ level: 'warning', text: `Opens on the managed Zone ${db.name}: its Managed NSG gets an inbound allow from this Zone on TCP 1433.` }] });
  }
  return { legacy: { nsg: c.nsg, rg: `rg-${c.vnet.slice(5, 12)}-${c.subnet.replace(/^snet-/, '')}`, shared: c.shared ? ['snet-shared-01'] : [], asgs: [], rules, imports, dropped: [], zoneNotes: [] }, inherited: defaults(c.nsg), warnings: [] };
}
const plans = new Map<string, Plan>();
export function planOf(c: Candidate): Plan {
  const hit = plans.get(c.id); if (hit) return hit;
  const v = vnets.find(x => x.name === c.vnet); const sub = v?.sub ?? ''; const env = envs.find(e => e.id === c.env);
  const p: Plan = { c, sub, region: v?.region ?? '', ...(hand[c.id] ?? generic(c)), tf: env?.mode === 'Terraform' ? { module: sub, file: `data-contracts/${sub}/nsgfw.json` } : undefined };
  plans.set(c.id, p); return p;
}

// Objects that imported Rules need and the Rule base does not have yet. Created when the onboarding lands in the Change set.
export const newObjects: Record<string, Obj> = {
  'imp-hub-bastion': { id: 'imp-hub-bastion', name: 'hub-bastion', kind: 'cidr', value: '10.255.64.0/26', cov: [] },
  'imp-snet-new-batch': { id: 'imp-snet-new-batch', name: 'snet-new-batch', kind: 'cidr', value: '10.10.211.0/26', cov: [], vnetBinding: 'vnet-app0042-wes' },
};
export const newServices = { 'svc-imp-udp8443': { id: 'svc-imp-udp8443', name: 'udp-8443', value: 'UDP 8443' } };
export const asgObjId = (name: string) => `imp-asg-${name}`;

// ---------- the onboarding in the current Change set
export interface ProvItem { cid: string; zid: string; nsg: string; rule: string; priority: number; dir: 'in' | 'out'; adopted: boolean }
export interface Prov { items: ProvItem[]; notes: Note[]; folder?: string; init: Partial<Rule>; block?: string }
export interface HandoverItem { cid: string; nsg: string; subnet: string; vnet: string; ev: Evidence }
export interface ImportState {
  prov: Map<string, Prov>; acks: Map<string, { by: string; at: string }>; zones: string[];
  handover: { items: HandoverItem[]; confirmed?: { by: string; at: string } };
  snap: { nsg: string; cid: string; zid: string; choice?: { kind: 'reimport' | 'keep'; at: string } } | null; snapOpen: boolean;
}
const empty = (): ImportState => ({ prov: new Map(), acks: new Map(), zones: [], handover: { items: [] }, snap: null, snapOpen: false });
let state = empty();
const subs = new Set<() => void>();
export const getImport = () => state;
export const setImport = (p: Partial<ImportState>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const useImport = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, getImport);
export const addProv = (id: string, p: Prov) => setImport({ prov: new Map(state.prov).set(id, p) });
export const ack = (key: string, by: string, at: string) => setImport({ acks: new Map(state.acks).set(key, { by, at }) });

const madeObjs: string[] = []; const madeSvcs: string[] = [];
export function makeObject(o: Obj) { if (objById.has(o.id)) return; objects.push(o); objById.set(o.id, o); madeObjs.push(o.id); }
export function makeService(id: keyof typeof newServices) { if (svcById.has(id)) return; services.push(newServices[id]); svcById.set(id, newServices[id]); madeSvcs.push(id); }
export function addZone(z: Zone, cid: string) { zones.push(z); zoneById.set(z.id, z); onboarded.set(cid, z.id); setImport({ zones: [...state.zones, z.id] }); }
onDiscard(() => {
  for (const id of state.zones) { const i = zones.findIndex(z => z.id === id); if (i >= 0) zones.splice(i, 1); zoneById.delete(id); }
  for (const id of madeObjs.splice(0)) { const i = objects.findIndex(o => o.id === id); if (i >= 0) objects.splice(i, 1); objById.delete(id); }
  for (const id of madeSvcs.splice(0)) { const i = services.findIndex(s => s.id === id); if (i >= 0) services.splice(i, 1); svcById.delete(id); }
  state = empty(); subs.forEach(f => f());
});

/** Runs store calls one per render. The store API closes over the state of the last render: a second call in the same tick would build on stale entries. */
export function useSteps() {
  const s = useStore(); const [q, setQ] = useState<{ steps: ((s: Store) => void)[]; done?: () => void } | null>(null); const [i, setI] = useState(0); const done = useRef<(() => void) | undefined>();
  useEffect(() => {
    if (!q) return;
    if (i < q.steps.length) { q.steps[i](s); setI(i + 1); return; }
    setQ(null); setI(0); done.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, i]);
  return { busy: !!q, run: (steps: ((s: Store) => void)[], then?: () => void) => { done.current = then; setI(0); setQ({ steps }); } };
}

// ---------- Rules that were imported before this session (data.ts marks them with importNote): a provenance derived from the id.
const warnTexts = ['VirtualNetwork kept as a one-sided tag: it matches what Azure resolves for this VNet, not the Internal address space.',
  'Protocol * with ports: imported as TCP and UDP. Other protocols no longer match.', 'An existing Rule opens a flow: it now lands on this Zone and allows what the legacy NSG denied.'];
const infoTexts = ['Renamed on collision: the NSG rule name was taken.', 'Redundant with the posture: the Egress posture already lets this out.', 'An existing Rule closes a flow: a deny Rule above it matches first.'];
export function legacyProv(r: Rule): Prov | undefined {
  if (!r.importNote) return undefined;
  const h = hash(r.id); const n = 1 + (h % 320); const pl = placement(r); const zid = pl.dst[0] ?? pl.src[0] ?? '';
  const nsg = `nsg-legacy-${pad(n, 3)}`; const rule = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const note: Note = r.importNote === 'blocking' ? { level: 'blocking', text: `The ASG asg-legacy-${pad(n, 3)} cannot be mapped: its members are in a subscription the Tool identity cannot read.`, resolve: 'Replace the ASG in this Rule with an Address object, or give the Tool identity Reader there.' }
    : r.importNote === 'warning' ? { level: 'warning', text: warnTexts[h % warnTexts.length] } : { level: 'info', text: infoTexts[h % infoTexts.length] };
  return { items: [{ cid: '', zid, nsg, rule, priority: 100 + (h % 38) * 10, dir: h % 3 ? 'in' : 'out', adopted: !!(h % 2) }], notes: [note], init: {} };
}
/** One line for a tooltip in the Rule base: where an imported Rule came from. */
export function importLine(r: Rule): string {
  const p = getImport().prov.get(r.id) ?? legacyProv(r); if (!p) return '';
  const i = p.items[0]; return `Import note (${r.importNote ?? p.notes[0]?.level}) from ${i.nsg}, rule “${i.rule}”, priority ${i.priority}, ${i.dir === 'in' ? 'inbound' : 'outbound'}${p.items.length > 1 ? `, and ${p.items.length - 1} more` : ''}`;
}
