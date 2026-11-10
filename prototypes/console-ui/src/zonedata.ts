// PROTOTYPE, throwaway (issue 35). Mock data for the Zone detail, the Flow view and the object editors:
// Security layers, flows, network interfaces, Unmanaged ASGs, DNS servers and the evidence behind "not onboardable".
// Nothing here is real. New Internet addresses come from the documentation ranges (198.51.100.0/24, 203.0.113.0/24).
import { zones, zoneById, vnets, objById, candidates, rules, services, Zone, Rule, ref } from './data';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const prng = (key: string) => { let seed = hash(key); return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const vnum = (vnet: string) => Number(/app(\d{4})/.exec(vnet)?.[1] ?? 0);
export const hostIp = (z: Zone, n: number) => z.prefix.replace(/\.0\/\d+$/, `.${4 + (n % 58)}`);

// ---------- Security layers
export type Sev = 'high' | 'medium';
export type AvnmAction = 'Allow' | 'Deny' | 'AlwaysAllow';
export interface AdminRule { name: string; priority: number; action: AvnmAction; dir: 'in' | 'out'; src: string; dst: string; svc: string; group: string; note?: { text: string; sev?: Sev; rule?: string } }
export interface NicRule { name: string; priority: number; dir: 'in' | 'out'; access: 'Allow' | 'Deny'; src: string; dst: string; svc: string; dflt?: boolean }
export interface NicNsg { name: string; nics: string[]; rules: NicRule[] }
export interface Layers { manager: string; avnm: AdminRule[]; user: AdminRule[]; avnmSkip?: string; nicTotal: number; nicNsgs: NicNsg[] }

const defaults: NicRule[] = [
  { name: 'AllowVnetInBound', priority: 65000, dir: 'in', access: 'Allow', src: 'VirtualNetwork', dst: 'VirtualNetwork', svc: 'any', dflt: true },
  { name: 'AllowAzureLoadBalancerInBound', priority: 65001, dir: 'in', access: 'Allow', src: 'AzureLoadBalancer', dst: 'any', svc: 'any', dflt: true },
  { name: 'DenyAllInBound', priority: 65500, dir: 'in', access: 'Deny', src: 'any', dst: 'any', svc: 'any', dflt: true },
  { name: 'AllowVnetOutBound', priority: 65000, dir: 'out', access: 'Allow', src: 'VirtualNetwork', dst: 'VirtualNetwork', svc: 'any', dflt: true },
  { name: 'AllowInternetOutBound', priority: 65001, dir: 'out', access: 'Allow', src: 'any', dst: 'Internet', svc: 'any', dflt: true },
  { name: 'DenyAllOutBound', priority: 65500, dir: 'out', access: 'Deny', src: 'any', dst: 'any', svc: 'any', dflt: true },
];
// The hand-written story around app0042: a central AVNM team and two NIC-level NSGs that the app team never told anyone about.
const avnm42: AdminRule[] = [
  { name: 'AlwaysAllow-Partner-Monitoring', priority: 10, action: 'AlwaysAllow', dir: 'in', src: '203.0.3.0/24', dst: '*', svc: 'TCP 443', group: 'ng-prod-spokes',
    note: { text: 'Bypasses deny Rule “Block known bad networks”: AlwaysAllow skips every NSG.', sev: 'high', rule: 'R90001' } },
  { name: 'Deny-SQL-East-West', priority: 20, action: 'Deny', dir: 'in', src: '10.10.0.0/16', dst: '*', svc: 'TCP 1433', group: 'ng-prod-spokes',
    note: { text: 'Blocks allow Rule “DB from API” before any NSG sees it.', sev: 'medium', rule: 'R90004' } },
  { name: 'Allow-HTTPS-Internal', priority: 30, action: 'Allow', dir: 'in', src: 'VirtualNetwork', dst: '*', svc: 'TCP 443', group: 'ng-prod-spokes', note: { text: 'Allow hands the traffic on to the NSGs. No warning.' } },
  { name: 'Deny-SMTP-Out', priority: 40, action: 'Deny', dir: 'out', src: '*', dst: 'Internet', svc: 'TCP 25', group: 'ng-all-spokes', note: { text: 'No Rule allows this. No warning.' } },
  { name: 'Deny-Telnet', priority: 50, action: 'Deny', dir: 'in', src: '*', dst: '*', svc: 'TCP 23', group: 'ng-all-spokes' },
];
const avnmUser42: AdminRule[] = [
  { name: 'user-allow-bastion-hub', priority: 100, action: 'Allow', dir: 'in', src: '10.0.64.0/26', dst: '*', svc: 'TCP 22, 3389', group: 'ng-prod-spokes' },
];
const avnmGeneric = (v: number): AdminRule[] => [
  { name: 'Deny-Mgmt-From-Internet', priority: 10, action: 'Deny', dir: 'in', src: 'Internet', dst: '*', svc: 'TCP 22, 3389', group: 'ng-all-spokes' },
  { name: 'AlwaysAllow-SOC-Scanners', priority: 20, action: 'AlwaysAllow', dir: 'in', src: '10.0.200.0/24', dst: '*', svc: 'any', group: 'ng-all-spokes', note: { text: v % 2 ? 'Bypasses 1 deny Rule on this Zone.' : 'No deny Rule overlaps. It also skips the Deny-all rules.', sev: v % 2 ? 'high' : undefined } },
  { name: 'Deny-SMTP-Out', priority: 40, action: 'Deny', dir: 'out', src: '*', dst: 'Internet', svc: 'TCP 25', group: 'ng-all-spokes' },
];

// The demo Zone keeps its Inherited defaults, so the Flow view and Settings can show what removing them would stop.
zoneById.get('z0042-web')!.inherited = true;
const layerCache = new Map<string, Layers>();
export function layersOf(z: Zone): Layers {
  const hit = layerCache.get(z.id); if (hit) return hit;
  const v = vnum(z.vnet); const tier = z.id.split('-')[1]; const r = prng(`layers:${z.id}`);
  const has = v === 42 || z.flags.includes('avnm');
  const l: Layers = { manager: 'avnm-platform', avnm: [], user: [], nicTotal: 3 + Math.floor(r() * 14), nicNsgs: [] };
  if (has) { l.avnm = v === 42 ? avnm42 : avnmGeneric(v); l.user = v === 42 ? avnmUser42 : []; }
  if (has && tier === 'ingress') { l.avnmSkip = 'This subnet holds an Application Gateway, so AVNM admin rules do not apply here. Other subnets of the VNet still get them.'; l.avnm = []; l.user = []; }
  if (z.id === 'z0042-web') {
    l.nicTotal = 12;
    l.nicNsgs = [
      { name: 'nsg-nic-web-default', nics: ['vm-app0042-web-01-nic1', 'vm-app0042-web-02-nic1', 'vm-app0042-web-03-nic1', 'vm-app0042-web-04-nic1', 'vm-app0042-web-05-nic1'], rules: defaults },
      { name: 'nsg-nic-web-mgmt', nics: ['vm-app0042-web-06-nic2'], rules: [{ name: 'Allow-RDP-Jump', priority: 200, dir: 'in', access: 'Allow', src: '10.0.4.0/26', dst: 'any', svc: 'TCP 3389' }, ...defaults] },
    ];
  } else if (z.flags.includes('nicnsg')) {
    const n = 1 + Math.floor(r() * 4);
    l.nicNsgs = [{ name: `nsg-nic-${z.name}`, nics: Array.from({ length: n }, (_, i) => `aks-nodepool1-${pad(v, 4)}-vmss_${i}`), rules: [{ name: 'Allow-Kubelet', priority: 100, dir: 'in', access: 'Allow', src: 'VirtualNetwork', dst: 'any', svc: 'TCP 10250' }, ...defaults] }];
  }
  layerCache.set(z.id, l); return l;
}
export const avnmCount = (z: Zone) => { const l = layersOf(z); return l.avnm.length + l.user.length; };
export const nicNsgCount = (z: Zone) => layersOf(z).nicNsgs.length;

// Rule warnings from Security layers, with severity. A deny Rule that AVNM bypasses is high, an allow Rule that a layer blocks is medium.
export interface LayerWarn { text: string; sev: Sev; layer: 'avnm' | 'nic'; zone?: string; source: string; detail: string }
const handWarn: Record<string, LayerWarn> = {
  R90001: { text: 'bypassed by AVNM', sev: 'high', layer: 'avnm', zone: 'z0042-web', source: 'AlwaysAllow-Partner-Monitoring', detail: 'AVNM always allows 203.0.3.0/24 (ext-partner-0003) on TCP 443 into vnet-app0042-wes. This deny Rule never stops it there, because AlwaysAllow skips every NSG.' },
  R90002: { text: 'blocked on 5 of 12 interfaces in app0042-web', sev: 'medium', layer: 'nic', zone: 'z0042-web', source: 'nsg-nic-web-default', detail: 'Five network interfaces in app0042-web carry the NIC-level NSG nsg-nic-web-default. Its default rule DenyAllInBound drops traffic from the Internet, so Front Door reaches only 7 of 12 interfaces.' },
  R90004: { text: 'blocked by AVNM', sev: 'medium', layer: 'avnm', zone: 'z0042-db', source: 'Deny-SQL-East-West', detail: 'The AVNM admin rule Deny-SQL-East-West (priority 20) denies TCP 1433 from 10.10.0.0/16 before any NSG sees it. This allow Rule never takes effect.' },
};
for (const [id, w] of Object.entries(handWarn)) { const r = rules.find(x => x.id === id); if (r) r.layerWarn = w.text; }
export function layerWarn(r: Rule): LayerWarn | null {
  if (!r.layerWarn) return null;
  if (handWarn[r.id]?.text === r.layerWarn) return handWarn[r.id];
  const high = r.layerWarn.startsWith('bypassed');
  return { text: r.layerWarn, sev: high ? 'high' : 'medium', layer: r.layerWarn.includes('interfaces') ? 'nic' : 'avnm', source: high ? 'AlwaysAllow-SOC-Scanners' : r.layerWarn.includes('interfaces') ? 'a NIC-level NSG' : 'Deny-Mgmt-From-Internet',
    detail: high ? 'An AVNM AlwaysAllow admin rule lets this traffic through before any NSG, so this deny Rule never stops it.' : 'A Security layer drops this traffic before or after the Managed NSG, so this allow Rule does not take full effect.' };
}

// ---------- Flow data: one state per Environment, plus VNet-level gaps.
export type FlowState = { kind: 'ok'; ageMin: number; deniedFiltered?: boolean } | { kind: 'noaccess'; missing: string[] } | { kind: 'nolog'; vnet: string };
export function flowState(z: Zone): FlowState {
  if (z.env === 'nonprod') return { kind: 'noaccess', missing: ['Microsoft.OperationalInsights/workspaces/query/read', 'Microsoft.OperationalInsights/workspaces/tables/data/read (table NTANetAnalytics)'] };
  const v = vnum(z.vnet);
  if (z.env === 'sandbox' || v % 13 === 0) return { kind: 'nolog', vnet: z.vnet };
  return { kind: 'ok', ageMin: 64 + (hash(z.vnet) % 50), deniedFiltered: v % 7 === 3 };
}
// What the hits column shows for a Rule: a number, "—" where no flow data exists, or "no access" where the query permission is missing.
export function hitsView(r: Rule, zonesOfRule: string[]): 'noaccess' | 'none' | number {
  if (zonesOfRule.length && zonesOfRule.slice(0, 200).every(zid => zoneById.get(zid)?.env === 'nonprod')) return 'noaccess';
  return r.hits == null ? 'none' : r.hits;
}

export type Decider = { kind: 'rule'; id: string } | { kind: 'band'; band: 'pe' | 'intra' | 'inherited' | 'egress' | 'denyall'; part?: string } | { kind: 'avnm'; name: string } | { kind: 'nic'; nsg: string; rule: string };
export interface Peer { label: string; ip: string; ref?: string; kind: string }
export interface Flow { id: string; src: Peer; dst: Peer; svc: string; svcId?: string; result: 'allow' | 'deny'; flows: number; lastMin: number; by: Decider; ifaces?: string }
const svcFor = (id: string) => services.find(s => s.id === id);
const internet = (r: () => number) => `${r() < 0.5 ? '198.51.100' : '203.0.113'}.${1 + Math.floor(r() * 250)}`;
function peerOf(id: string, r: () => number): Peer | null {
  const o = ref(id);
  if (o.kind === 'zone') { const z = zoneById.get(id.slice(5))!; return { label: z.name, ip: hostIp(z, Math.floor(r() * 40)), ref: id, kind: 'zone' }; }
  if (o.kind === 'ip') return { label: o.name, ip: o.value, ref: id, kind: 'ip' };
  if (o.kind === 'cidr') return { label: o.name, ip: o.value.replace(/\.0\/\d+$/, `.${10 + Math.floor(r() * 200)}`), ref: id, kind: 'cidr' };
  if (o.kind === 'tag') return { label: o.name, ip: o.name.startsWith('AzureFrontDoor') ? `198.51.100.${10 + Math.floor(r() * 20)}` : internet(r), ref: id, kind: 'tag' };
  if (o.kind === 'asg' || o.kind === 'extasg') { const zid = o.cov[0]; const z = zid ? zoneById.get(zid) : undefined; return z ? { label: o.name, ip: hostIp(z, Math.floor(r() * 40)), ref: id, kind: o.kind } : null; }
  if (o.kind === 'vnet' || o.kind === 'group') { const zid = o.cov[Math.floor(r() * o.cov.length)]; const z = zid ? zoneById.get(zid) : undefined; return z ? { label: z.name, ip: hostIp(z, Math.floor(r() * 40)), ref: `zone:${z.id}`, kind: 'zone' } : null; }
  if (o.kind === 'any') return { label: 'Internet', ip: internet(r), kind: 'ext' };
  return null;
}
const self = (z: Zone, r: () => number): Peer => ({ label: z.name, ip: hostIp(z, Math.floor(r() * 40)), ref: `zone:${z.id}`, kind: 'zone' });
const anon = (z: Zone, r: () => number): Peer => { const o = zones[Math.floor(r() * zones.length)]; return { label: o.name, ip: hostIp(o, Math.floor(r() * 40)), ref: `zone:${o.id}`, kind: 'zone' }; };

// Flows of the newest data window. A row aggregates flows with the same source, destination, port, protocol and NSG rule, as NTANetAnalytics does.
export function flowsOf(z: Zone, dir: 'in' | 'out', here: Rule[]): Flow[] {
  const r = prng(`flows:${z.id}:${dir}`); const out: Flow[] = []; const l = layersOf(z); let n = 0;
  const push = (f: Omit<Flow, 'id' | 'lastMin'>) => out.push({ ...f, id: `f${++n}`, lastMin: 64 + Math.floor(r() * 300) });
  const scale = (h: number | null) => Math.max(1, Math.round(((h ?? 400) / 30) * (0.3 + r())));
  for (const rule of here.filter(x => x.enabled).slice(0, 40)) {
    const peers = (dir === 'in' ? rule.src : rule.dst).slice(0, 2).map(id => peerOf(id, r)).filter(Boolean) as Peer[];
    for (const p of peers) {
      const svcId = rule.svc[0] === 'svc-any' ? 'svc-https' : rule.svc[0]; const svc = svcFor(svcId)?.value ?? 'TCP 443';
      if (rule.layerWarn && handWarn[rule.id]?.layer === 'nic' && dir === 'in') {
        push({ src: p, dst: self(z, r), svc, svcId, result: 'allow', flows: scale(rule.hits), by: { kind: 'rule', id: rule.id }, ifaces: '7 of 12 interfaces' });
        push({ src: p, dst: self(z, r), svc, svcId, result: 'deny', flows: Math.round(scale(rule.hits) * 0.6), by: { kind: 'nic', nsg: handWarn[rule.id].source, rule: 'DenyAllInBound' }, ifaces: '5 of 12 interfaces' });
        continue;
      }
      if (rule.layerWarn && handWarn[rule.id]?.layer === 'avnm' && rule.action === 'allow') { push({ src: dir === 'in' ? p : self(z, r), dst: dir === 'in' ? self(z, r) : p, svc, svcId, result: 'deny', flows: scale(rule.hits), by: { kind: 'avnm', name: handWarn[rule.id].source } }); continue; }
      push({ src: dir === 'in' ? p : self(z, r), dst: dir === 'in' ? self(z, r) : p, svc, svcId, result: rule.action, flows: rule.action === 'deny' ? 1 + Math.floor(r() * 40) : scale(rule.hits), by: { kind: 'rule', id: rule.id } });
    }
  }
  const zoneSvc = ['svc-postgres', 'svc-redis', 'svc-c42', 'svc-c88', 'svc-smb', 'svc-https', 'svc-kafka'];
  if (dir === 'in') {
    push({ src: { label: 'AzureLoadBalancer', ip: '168.63.129.16', ref: 'tag:AzureLoadBalancer', kind: 'tag' }, dst: self(z, r), svc: 'TCP 80', svcId: 'svc-http', result: 'allow', flows: 8640, by: { kind: 'band', band: 'pe' } });
    if (z.inherited) for (let i = 0; i < 6; i++) { const id = zoneSvc[i % zoneSvc.length]; push({ src: anon(z, r), dst: self(z, r), svc: svcFor(id)?.value ?? 'TCP 8080', svcId: id, result: 'allow', flows: 3 + Math.floor(r() * 900), by: { kind: 'band', band: 'inherited', part: 'inbound from VirtualNetwork' } }); }
    for (let i = 0; i < 5; i++) push({ src: { label: 'Internet', ip: internet(r), kind: 'ext' }, dst: self(z, r), svc: ['TCP 22', 'TCP 3389', 'TCP 23', 'TCP 445', 'TCP 5900'][i], result: 'deny', flows: 2 + Math.floor(r() * 300), by: { kind: 'band', band: 'denyall' } });
    for (let i = 0; i < 3; i++) push({ src: anon(z, r), dst: self(z, r), svc: ['TCP 445', 'TCP 135', 'TCP 5985'][i], result: 'deny', flows: 1 + Math.floor(r() * 30), by: { kind: 'band', band: 'denyall' } });
    if (l.avnm.some(a => a.action === 'AlwaysAllow')) push({ src: { label: 'ext-partner-0003', ip: '203.0.3.17', ref: 'n3', kind: 'cidr' }, dst: self(z, r), svc: 'TCP 443', svcId: 'svc-https', result: 'allow', flows: 412, by: { kind: 'avnm', name: l.avnm.find(a => a.action === 'AlwaysAllow')!.name } });
  } else {
    if (z.egress === 'dest') for (let i = 0; i < 7; i++) { const id = zoneSvc[(i + 2) % zoneSvc.length]; push({ src: self(z, r), dst: anon(z, r), svc: svcFor(id)?.value ?? 'TCP 8080', svcId: id, result: 'allow', flows: 5 + Math.floor(r() * 2000), by: { kind: 'band', band: 'egress' } }); }
    if (z.inherited) {
      for (let i = 0; i < 3; i++) push({ src: self(z, r), dst: { label: 'Internet', ip: internet(r), kind: 'ext' }, svc: 'TCP 443', svcId: 'svc-https', result: 'allow', flows: 40 + Math.floor(r() * 4000), by: { kind: 'band', band: 'inherited', part: 'outbound to Internet' } });
      push({ src: self(z, r), dst: anon(z, r), svc: 'TCP 8443', result: 'allow', flows: 120, by: { kind: 'band', band: 'inherited', part: 'outbound to VirtualNetwork' } });
    }
    push({ src: self(z, r), dst: { label: 'Internet', ip: internet(r), kind: 'ext' }, svc: 'TCP 25', result: 'deny', flows: 6, by: l.avnm.length ? { kind: 'avnm', name: 'Deny-SMTP-Out' } : { kind: 'band', band: 'denyall' } });
    push({ src: self(z, r), dst: { label: 'Internet', ip: internet(r), kind: 'ext' }, svc: 'UDP 123', result: 'deny', flows: 288, by: { kind: 'band', band: 'denyall' } });
  }
  push({ src: self(z, r), dst: self(z, r), svc: 'TCP 8080', result: 'allow', flows: 2300, by: { kind: 'band', band: 'intra' } });
  // A flow log that filters out denied flows delivers none of them.
  const fs = flowState(z); return fs.kind === 'ok' && fs.deniedFiltered ? out.filter(f => f.result === 'allow') : out;
}
// The outbound flows that only the destination-enforced Egress posture lets out: a strict posture denies them unless a Rule allows them.
export const egressImpact = (z: Zone, here: Rule[]) => flowsOf(z, 'out', here).filter(f => f.by.kind === 'band' && f.by.band === 'egress');
export const inheritedImpact = (z: Zone, here: Rule[], part: string) => [...flowsOf(z, 'in', here), ...flowsOf(z, 'out', here)].filter(f => f.by.kind === 'band' && f.by.band === 'inherited' && f.by.part === part);

// ---------- Inventory: VMs, network interfaces and private endpoints per Zone, for the ASG member picker.
export interface Nic { id: string; name: string; ip: string; zone?: string; vnet: string; vmss?: boolean }
export interface Vm { id: string; name: string; kind: 'vm' | 'pe' | 'vmss'; zone?: string; vnet: string; nics: Nic[] }
const invCache = new Map<string, Vm[]>();
export function inventoryOf(z: Zone): Vm[] {
  const hit = invCache.get(z.id); if (hit) return hit;
  const r = prng(`inv:${z.id}`); const tier = z.id.split('-')[1]; const out: Vm[] = [];
  if (tier === 'pe') ['sql', 'kv', 'blob', 'acr', 'cosmos'].slice(0, 2 + Math.floor(r() * 4)).forEach((s, i) => out.push({ id: `pe-${s}-${z.name}`, name: `pe-${s}-${z.name}`, kind: 'pe', zone: z.id, vnet: z.vnet, nics: [{ id: `pe-${s}-${z.name}.nic`, name: `pe-${s}-${z.name}.nic`, ip: hostIp(z, i), zone: z.id, vnet: z.vnet }] }));
  else if (tier === 'aks') out.push({ id: `vmss-${z.name}`, name: `aks-nodepool1-${z.name.slice(3, 7)}-vmss`, kind: 'vmss', zone: z.id, vnet: z.vnet, nics: Array.from({ length: 3 }, (_, i) => ({ id: `vmss-${z.name}-${i}`, name: `aks-nodepool1-${z.name.slice(3, 7)}-vmss_${i}`, ip: hostIp(z, i), zone: z.id, vnet: z.vnet, vmss: true })) });
  else { const n = z.id === 'z0042-web' ? 6 : 2 + Math.floor(r() * 4); for (let i = 1; i <= n; i++) { const vm = `vm-${z.name}-${pad(i)}`; const k = z.id === 'z0042-web' && i === 6 ? 2 : r() < 0.2 ? 2 : 1; out.push({ id: vm, name: vm, kind: 'vm', zone: z.id, vnet: z.vnet, nics: Array.from({ length: k }, (_, j) => ({ id: `${vm}-nic${j + 1}`, name: `${vm}-nic${j + 1}`, ip: hostIp(z, i * 2 + j), zone: z.id, vnet: z.vnet })) }); } }
  invCache.set(z.id, out); return out;
}
export const nicById = (id: string): Nic | undefined => { const m = /^(?:vm-|vmss-|pe-\w+-)?(app\d{4}-[a-z]+)/.exec(id); const z = m ? zones.find(x => x.name === m[1]) : undefined; return z ? inventoryOf(z).flatMap(v => v.nics).find(n => n.id === id) : undefined; };
// One search over VMs, network interfaces and private endpoints, by name, IP or Zone.
export function searchInventory(q: string): Vm[] {
  const ql = q.trim().toLowerCase(); if (ql.length < 2) return [];
  const app = /app\d{1,4}(-[a-z]*)?/.exec(ql)?.[0]; const ip = /^\d+\.\d+/.test(ql);
  const hits: Vm[] = [];
  for (const z of zones) {
    if (hits.length >= 12) break;
    const zm = app ? z.name.startsWith(app) : ip ? z.prefix.startsWith(ql.split('.').slice(0, 2).join('.') + '.') : z.name.includes(ql);
    if (!zm) continue;
    const whole = app ? app.length >= z.name.length - 1 || !ql.includes(app + '-') && ql === app : !ip;
    for (const vm of inventoryOf(z)) if (whole || vm.name.includes(ql) || vm.nics.some(n => n.name.includes(ql) || n.ip.startsWith(ql))) hits.push(vm);
  }
  return hits.slice(0, 12);
}

// ---------- ASG objects and External ASG objects
export const managedAsgName = (obj: string, vnet: string) => `asg-${obj.replace(/^asg-/, '')}-${vnet.replace(/^vnet-/, '')}`;
export const initialMembers = new Map<string, string[]>();
export interface UnmanagedAsg { id: string; name: string; rg: string; vnet: string; zone: string; owner: string; members: Nic[] }
export const unmanagedAsgs: UnmanagedAsg[] = [];
{
  // A demo ASG object with members in two VNets, and a demo External ASG object on an AKS node pool.
  const a = objById.get('a1')!; a.name = 'asg-webservers'; a.cov = ['z0042-web', 'z0107-web']; a.value = '5 members';
  initialMembers.set('a1', ['vm-app0042-web-01-nic1', 'vm-app0042-web-02-nic1', 'vm-app0042-web-03-nic1', 'vm-app0107-web-01-nic1', 'vm-app0107-web-02-nic1']);
  for (const z of ['z0042-aks', 'z0107-aks', 'z0311-aks', 'z0042-worker', 'z0500-aks', 'z0640-batch']) {
    const zz = zoneById.get(z)!; const vmss = z.endsWith('aks');
    unmanagedAsgs.push({ id: `uasg-${z}`, name: vmss ? `asg-aks-${zz.name.slice(3, 7)}-nodes` : `asg-${zz.name}-scaleset`, rg: vmss ? `MC_rg-aks-${zz.name.slice(3, 7)}_${zz.region}` : `rg-${zz.name}`, vnet: zz.vnet, zone: z,
      owner: vmss ? 'AKS node pool, written through the AKS API' : 'VM scale set, written by its own Terraform', members: inventoryOf(zz).flatMap(v => v.nics) });
  }
  const x = objById.get('x1')!; x.name = 'ext-asg-aks-0042-nodes'; x.cov = ['z0042-aks']; x.value = '3 members (read)';
}
export const extAsgOf = new Map<string, string>([['x1', 'uasg-z0042-aks']]);
export function membersOf(oid: string): string[] {
  const m = initialMembers.get(oid); if (m) return m;
  const o = objById.get(oid); if (!o) return [];
  const out = o.cov.flatMap(zid => { const z = zoneById.get(zid); return z ? inventoryOf(z).filter(v => v.kind !== 'vmss').flatMap(v => v.nics).slice(0, 2).map(n => n.id) : []; });
  initialMembers.set(oid, out); return out;
}
// The tool-written membership needs the optional role nsgfw ASG Writer, which Non-production lacks.
export const asgWriterMissing = new Set(['nonprod']);
export const ASG_LIMITS = { perIpConfig: 20, perRule: 10, perNsg: 100, ipConfigsPerAsg: 4000, perSubRegion: 3000 };

// ---------- VNet bindings: an unbound prefix also matches Zones in VNets that are not connected.
export const peersOf = (vnet: string) => { const v = vnum(vnet); return [v - 1, v + 1].filter(x => x >= 1 && x <= 1000).map(x => vnets[x - 1].name); };
export function unboundCoverage(oid: string): string[] {
  const o = objById.get(oid); if (!o || !o.cov.length) return [];
  const r = prng(`bind:${oid}`); const far = vnets[Math.floor(r() * 1000)];
  return [...o.cov, ...far.zones.slice(0, 1 + Math.floor(r() * 3))];
}

// ---------- DNS servers of a VNet. Custom DNS needs a Rule, because NSGs filter traffic to customer DNS servers.
export interface Dns { servers: string[]; zone?: string; where: string }
export function dnsOf(vnet: string): Dns | null {
  const v = vnum(vnet);
  if (v % 5 === 0) return { servers: ['10.255.0.4', '10.255.0.5'], where: 'in the hub, in no Zone' };
  if (v % 5 === 2) return { servers: ['10.0.85.4', '10.0.85.5'], zone: 'z0001-mgmt', where: 'in Zone app0001-mgmt' };
  return null;
}
// A Rule that allows DNS from this Zone to its DNS servers: the source covers the Zone, the destination reaches the servers.
export const dnsRuleFor = (z: Zone, all: Rule[] = rules) => { const d = dnsOf(z.vnet); if (!d) return undefined;
  return all.find(r => r.enabled && r.action === 'allow' && r.svc.some(s => s.startsWith('svc-dns')) && r.src.some(id => ref(id).cov.includes(z.id)) && r.dst.some(id => id === 'any' || d.servers.includes(ref(id).value) || (!!d.zone && id === `zone:${d.zone}`))); };

// ---------- Candidates: the evidence behind "not onboardable", and two more reasons from the review round and the architecture.
export const evidence: Record<string, (c: { subnet: string; vnet: string }) => string> = {
  reasonSpecial: c => `Azure does not allow an NSG on ${c.subnet}. Use it as a subnet Address object.`,
  reasonService: c => `Azure SQL Managed Instance in ${c.subnet} writes its own NSG rules (network intent policy). Use the subnet as an Address object.`,
  reasonForward: c => `The network interface nva-transit-01-nic1 in ${c.subnet} has IP forwarding enabled. Its NSG sees transit traffic with any source and destination.`,
  reasonAks: c => `AKS maintains the NSG of ${c.subnet} (resource group MC_rg-aks-${c.vnet.slice(8, 12)}). Rules would be overwritten. Use an External ASG object for the nodes.`,
  reasonTool: () => 'This subnet holds nsgfw itself (Container Apps environment). A Rule could lock the tool out.',
};
candidates.push(
  { id: 'c901', subnet: 'snet-aks-system', vnet: 'vnet-app0042-wes', env: 'prod', prefix: '10.10.200.0/24', nsg: 'aks-agentpool-31337-nsg', reason: 'reasonAks' },
  { id: 'c902', subnet: 'snet-nsgfw-apps', vnet: 'vnet-app0001-nor', env: 'prod', prefix: '10.0.250.0/27', reason: 'reasonTool' },
  { id: 'c903', subnet: 'snet-new-orders', vnet: 'vnet-app0042-wes', env: 'prod', prefix: '10.10.210.0/26', nsg: 'nsg-legacy-orders' },
);
candidates.sort((a, b) => (a.id === 'c903' ? -1 : b.id === 'c903' ? 1 : 0));
// Candidates onboarded in the open Change set: candidate id -> new Zone id.
export const onboarded = new Map<string, string>();
// The name of what a Zone or Object edit changes, for the list of edits.
export const targetName = (key: string) => key.startsWith('zone:') ? zoneById.get(key.slice(5))?.name ?? key.slice(5) : key.startsWith('obj:') ? objById.get(key.slice(4))?.name ?? key.slice(4) : key;
