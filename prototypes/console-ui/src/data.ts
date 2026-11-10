// PROTOTYPE, throwaway. Mock data at the design target: 10,000 Rules, 20,000 Zones, ~10,000 Objects.
// Nothing here is real: no tenant, subscription or customer names. Deterministic PRNG so every reload looks the same.

let seed = 42;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const pad = (n: number, w = 4) => String(n).padStart(w, '0');

export type Action = 'allow' | 'deny';
export type Egress = 'dest' | 'strict';
export type ObjKind = 'any' | 'zone' | 'ip' | 'cidr' | 'tag' | 'subnet' | 'vnet' | 'asg' | 'extasg' | 'group';
export type Flag = 'drift' | 'policy' | 'limit' | 'perm' | 'import' | 'avnm' | 'nicnsg';
export type Level = 'none' | 'approver' | 'four-eyes';

export interface Env { id: string; name: string; mode: 'ARM' | 'Terraform'; level: Level }
export interface Zone {
  id: string; name: string; env: string; vnet: string; sub: string; region: string; prefix: string; extra?: string[];
  egress: Egress; nsg: string; rules: number; addrSrc: number; addrDst: number; asgs: number; flags: Flag[]; inherited: boolean;
}
export interface Candidate { id: string; subnet: string; vnet: string; env: string; prefix: string; nsg?: string; shared?: boolean; reason?: string }
export interface Obj { id: string; name: string; kind: ObjKind; value: string; cov: string[]; members?: string[]; vnetBinding?: string }
export interface Svc { id: string; name: string; value: string; group?: boolean }
export interface Rule {
  id: string; name: string; src: string[]; dst: string[]; svc: string[]; action: Action; enabled: boolean;
  comment: string; ticket: string; owner: string; expiry?: string; hits: number | null;
  policy?: string; importNote?: 'blocking' | 'warning' | 'info'; layerWarn?: string;
  folder?: string;
}
// A Folder is a named, contiguous run of Rules. It only organises: the Translation engine never sees it.
export interface FolderRow { id: string; folderRow: true; name: string }
export type Entry = Rule | FolderRow;
export const isFolder = (e: unknown): e is FolderRow => !!(e as FolderRow | undefined)?.folderRow;

export const envs: Env[] = [
  { id: 'prod', name: 'Production', mode: 'ARM', level: 'four-eyes' },
  { id: 'nonprod', name: 'Non-production', mode: 'Terraform', level: 'approver' },
  { id: 'sandbox', name: 'Sandbox', mode: 'ARM', level: 'none' },
];
const regions = ['westeurope', 'northeurope', 'germanywestcentral'];
const regionTag: Record<string, string> = { westeurope: 'WestEurope', northeurope: 'NorthEurope', germanywestcentral: 'GermanyWestCentral' };
const tiers = ['web', 'api', 'app', 'db', 'cache', 'mq', 'batch', 'mgmt', 'pe', 'aks', 'jump', 'ingress', 'worker', 'files', 'etl', 'mon', 'build', 'dmz', 'sftp', 'bi'];

// ---- Zones: 1,000 VNets x 20 subnets = 20,000 Zones
export const zones: Zone[] = [];
export const vnets: { name: string; env: string; region: string; sub: string; zones: string[] }[] = [];
for (let v = 1; v <= 1000; v++) {
  const env = v <= 600 ? 'prod' : v <= 900 ? 'nonprod' : 'sandbox';
  const region = regions[v % 3];
  const sub = `sub-${env}-${pad((v % 12) + 1, 2)}`;
  const vn = { name: `vnet-app${pad(v)}-${region.slice(0, 3)}`, env, region, sub, zones: [] as string[] };
  vnets.push(vn);
  tiers.forEach((tier, i) => {
    const id = `z${pad(v)}-${tier}`;
    const util = rnd();
    const flags: Flag[] = [];
    if (rnd() < 0.004) flags.push('drift');
    if (rnd() < 0.003) flags.push('policy');
    if (util > 0.995) flags.push('limit');
    if (rnd() < 0.002) flags.push('perm');
    if (rnd() < 0.004) flags.push('import');
    if (v % 97 === 0) flags.push('avnm');
    if (tier === 'aks' && rnd() < 0.2) flags.push('nicnsg');
    zones.push({
      id, name: `app${pad(v)}-${tier}`, env, vnet: vn.name, sub, region,
      prefix: `10.${Math.floor(v / 4)}.${(v % 4) * 64 + i * 3}.0/26`,
      extra: tier === 'aks' ? [`100.${64 + (v % 64)}.0.0/16`] : undefined,
      egress: rnd() < 0.12 ? 'strict' : 'dest', nsg: `nsg-${vn.name.slice(5)}-${tier}`,
      rules: Math.floor(util > 0.995 ? 1700 + rnd() * 290 : 8 + util * util * 300),
      addrSrc: Math.floor(rnd() * rnd() * 2200), addrDst: Math.floor(rnd() * rnd() * 1800),
      asgs: Math.floor(rnd() * rnd() * 40), flags, inherited: rnd() < 0.08,
    });
    vn.zones.push(id);
  });
}
export const zoneById = new Map(zones.map(z => [z.id, z]));

export const candidates: Candidate[] = [];
for (let i = 1; i <= 320; i++) {
  const v = vnets[Math.floor(rnd() * vnets.length)];
  const r = rnd();
  const special = r < 0.06 ? 'GatewaySubnet' : r < 0.1 ? 'AzureFirewallSubnet' : r < 0.13 ? 'snet-sqlmi' : r < 0.16 ? 'snet-nva-transit' : null;
  candidates.push({
    id: `c${i}`, subnet: special ?? `snet-new-${pad(i, 3)}`, vnet: v.name, env: v.env, prefix: `10.200.${i % 250}.0/27`,
    nsg: special ? undefined : rnd() < 0.5 ? `nsg-legacy-${pad(i, 3)}` : undefined, shared: rnd() < 0.15,
    reason: special === 'GatewaySubnet' || special === 'AzureFirewallSubnet' ? 'reasonSpecial'
      : special === 'snet-sqlmi' ? 'reasonService' : special === 'snet-nva-transit' ? 'reasonForward' : undefined,
  });
}

// ---- Address objects
export const serviceTags = ['Internet', 'VirtualNetwork', 'AzureLoadBalancer', 'AzureCloud', 'Storage', 'Sql', 'AzureKeyVault', 'AzureMonitor',
  'AzureActiveDirectory', 'AzureContainerRegistry', 'AzureCosmosDB', 'EventHub', 'ServiceBus', 'AppService', 'ApiManagement', 'AzureBackup',
  'AzureFrontDoor.Backend', 'AzureFrontDoor.Frontend', 'GatewayManager', 'AzureTrafficManager', 'GuestAndHybridManagement', 'AzureArcInfrastructure',
  'AzureDevOps', 'PowerBI', 'AzureDatabricks', 'AzureSiteRecovery', 'DataFactory', 'AzureMachineLearning', 'MicrosoftContainerRegistry',
  'AzureUpdateDelivery', 'WindowsVirtualDesktop', 'AzureSignalR', 'BatchNodeManagement', 'AzureResourceManager', 'AzurePlatformDNS'];
const regional = ['Storage', 'Sql', 'AzureCloud', 'EventHub', 'ServiceBus', 'AzureKeyVault', 'AzureMonitor', 'AppService'];

export const objects: Obj[] = [{ id: 'any', name: 'any', kind: 'any', value: '0.0.0.0/0, ::/0', cov: [] }];
serviceTags.forEach(t => objects.push({ id: `tag:${t}`, name: t, kind: 'tag', value: 'Azure service tag', cov: [] }));
regional.forEach(t => regions.forEach(r => objects.push({ id: `tag:${t}.${r}`, name: `${t}.${regionTag[r]}`, kind: 'tag', value: 'Azure service tag', cov: [] })));
vnets.forEach(v => objects.push({ id: `vnet:${v.name}`, name: v.name, kind: 'vnet', value: `${v.zones.length} Zones`, cov: v.zones }));
for (let i = 1; i <= 2400; i++) {
  const z = zones[Math.floor(rnd() * zones.length)];
  objects.push({ id: `h${i}`, name: `h-${z.name}-${pad(i % 100, 2)}`, kind: 'ip', value: z.prefix.replace(/0\/26$/, String(4 + (i % 50))), cov: [z.id] });
}
for (let i = 1; i <= 3000; i++) {
  if (i % 3 === 0) { objects.push({ id: `n${i}`, name: `ext-partner-${pad(i, 4)}`, kind: 'cidr', value: `203.0.${i % 255}.0/24`, cov: [] }); continue; }
  const v = vnets[Math.floor(rnd() * vnets.length)];
  const k = 2 + Math.floor(rnd() * 6);
  objects.push({ id: `n${i}`, name: `net-${v.name.slice(5, 12)}-${pad(i, 4)}`, kind: 'cidr', value: `10.${i % 250}.0.0/2${k}`, cov: v.zones.slice(0, k), vnetBinding: rnd() < 0.3 ? v.name : undefined });
}
for (let i = 1; i <= 60; i++) objects.push({ id: `s${i}`, name: `snet-sqlmi-${pad(i, 2)}`, kind: 'subnet', value: `10.250.${i}.0/27 (not a Zone)`, cov: [] });
for (let i = 1; i <= 600; i++) {
  const v = Math.floor(rnd() * 1000);
  const cov = [vnets[v].zones[Math.floor(rnd() * 20)]];
  if (rnd() < 0.3) cov.push(vnets[(v + 1) % 1000].zones[Math.floor(rnd() * 20)]);
  objects.push({ id: `a${i}`, name: `asg-${pick(['webfarm', 'sqlnodes', 'jumphosts', 'scanners', 'backup-agents', 'print', 'ad-dc'])}-${pad(i, 3)}`, kind: 'asg', value: `${2 + Math.floor(rnd() * 40)} members`, cov });
}
for (let i = 1; i <= 200; i++) {
  const z = zones[Math.floor(rnd() * zones.length)];
  objects.push({ id: `x${i}`, name: `ext-asg-aks-${pad(i, 3)}`, kind: 'extasg', value: `${10 + Math.floor(rnd() * 300)} members (read)`, cov: [z.id] });
}
const leafCount = objects.length;
for (let i = 1; i <= 400; i++) {
  const members = [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => objects[1 + Math.floor(rnd() * (leafCount - 1))].id))];
  const cov = [...new Set(members.flatMap(m => objects.find(o => o.id === m)?.cov ?? []))];
  objects.push({ id: `g${i}`, name: `grp-${pick(['admins', 'monitoring', 'backup', 'partners', 'build', 'dns', 'ntp', 'pki'])}-${pad(i, 3)}`, kind: 'group', value: `${members.length} members`, cov, members });
}
export const objById = new Map(objects.map(o => [o.id, o]));

export const services: Svc[] = [{ id: 'svc-any', name: 'any', value: 'any protocol, any port' }];
const wellKnown: [string, string][] = [['https', 'TCP 443'], ['http', 'TCP 80'], ['ssh', 'TCP 22'], ['rdp', 'TCP 3389'], ['dns-udp', 'UDP 53'], ['dns-tcp', 'TCP 53'],
  ['mssql', 'TCP 1433'], ['postgres', 'TCP 5432'], ['redis', 'TCP 6380'], ['amqp', 'TCP 5671-5672'], ['kafka', 'TCP 9093'], ['ldaps', 'TCP 636'],
  ['kerberos', 'TCP 88'], ['smb', 'TCP 445'], ['ntp', 'UDP 123'], ['syslog', 'UDP 514'], ['icmp', 'ICMP'], ['winrm', 'TCP 5985-5986'], ['k8s-api', 'TCP 6443']];
wellKnown.forEach(([n, v]) => services.push({ id: `svc-${n}`, name: n, value: v }));
for (let i = 1; i <= 1400; i++) services.push({ id: `svc-c${i}`, name: `app-port-${8000 + i}`, value: `TCP ${8000 + i}` });
for (let i = 1; i <= 150; i++) services.push({ id: `svcg-${i}`, name: `svcgrp-${pick(['ad', 'web', 'sql', 'monitoring', 'backup'])}-${pad(i, 3)}`, value: `${2 + (i % 5)} services`, group: true });
export const svcById = new Map(services.map(s => [s.id, s]));

// ---- Rules
const owners = ['grp-netsec', 'grp-platform', 'grp-app-teams', 'kim', 'sam'];
const verbs = ['Allow', 'Allow', 'Allow', 'Permit', 'Block'];
const zonePool = () => `zone:${zones[Math.floor(rnd() * zones.length)].id}`;
const objPool = () => objects[1 + Math.floor(rnd() * (objects.length - 1))].id;
const refList = () => uniq(Array.from({ length: 1 + Math.floor(rnd() * rnd() * 3) }, () => (rnd() < 0.55 ? zonePool() : objPool())));
function uniq<T>(a: T[]) { return [...new Set(a)]; }

export function ref(id: string): { name: string; kind: ObjKind; value: string; cov: string[] } {
  if (id.startsWith('zone:')) { const z = zoneById.get(id.slice(5))!; return { name: z.name, kind: 'zone', value: z.prefix, cov: [z.id] }; }
  const o = objById.get(id);
  return o ?? { name: id, kind: 'any', value: '', cov: [] };
}
export const svcName = (id: string) => svcById.get(id)?.name ?? id;

export const rules: Rule[] = [];
for (let i = 1; i <= 10000; i++) {
  const deny = rnd() < 0.08;
  const r: Rule = {
    id: `R${pad(i * 7 % 100000, 5)}`, name: '', src: refList(), dst: refList(),
    svc: uniq(Array.from({ length: 1 + Math.floor(rnd() * rnd() * 3) }, () => (rnd() < 0.7 ? pick(services.slice(1, 20)).id : pick(services).id))),
    action: deny ? 'deny' : 'allow', enabled: rnd() > 0.04, comment: rnd() < 0.6 ? pick(['Release 24.3', 'Monitoring agents', 'Backup window', 'Partner access per contract', 'Legacy, review', '']) : '',
    ticket: rnd() < 0.7 ? `CHG-${pad(1000 + Math.floor(rnd() * 9000))}` : '', owner: pick(owners),
    expiry: rnd() < 0.05 ? `2026-${pad(11 + Math.floor(rnd() * 2), 2)}-${pad(1 + Math.floor(rnd() * 28), 2)}` : undefined,
    hits: rnd() < 0.15 ? null : rnd() < 0.05 ? 0 : Math.floor(rnd() * rnd() * rnd() * 2_000_000),
  };
  if (rnd() < 0.002) r.src = ['any'];
  r.name = `${deny ? 'Block' : pick(verbs.slice(0, 4))} ${ref(r.src[0]).name} to ${ref(r.dst[0]).name} ${svcName(r.svc[0])}`;
  if (rnd() < 0.003) r.policy = 'Deny: Management ports must not be open from the Internet';
  if (rnd() < 0.006) r.importNote = pick(['blocking', 'warning', 'info'] as const);
  if (rnd() < 0.004) r.layerWarn = pick(['blocked by AVNM', 'bypassed by AVNM', 'blocked on 3 of 12 interfaces']);
  rules.push(r);
}
// A few hand-written Rules at the top, so the first screen reads like a real Rule base.
const top: Partial<Rule>[] = [
  { id: 'R90001', name: 'Block known bad networks', src: ['n3'], dst: ['any'], svc: ['svc-any'], action: 'deny', comment: 'Threat feed', ticket: 'CHG-4711', owner: 'grp-netsec', hits: 18233 },
  { id: 'R90002', name: 'Web tier from Front Door', src: ['tag:AzureFrontDoor.Backend'], dst: ['zone:z0042-web'], svc: ['svc-https'], action: 'allow', comment: 'Public entry', ticket: 'CHG-5012', owner: 'grp-app-teams', hits: 4120933 },
  { id: 'R90003', name: 'API from web', src: ['zone:z0042-web'], dst: ['zone:z0042-api'], svc: ['svc-https'], action: 'allow', comment: '', ticket: 'CHG-5012', owner: 'grp-app-teams', hits: 3911002 },
  { id: 'R90004', name: 'DB from API', src: ['zone:z0042-api'], dst: ['zone:z0042-db'], svc: ['svc-mssql'], action: 'allow', comment: '', ticket: 'CHG-5012', owner: 'grp-app-teams', hits: 802113 },
  { id: 'R90005', name: 'Admins to jump hosts', src: ['g7'], dst: ['zone:z0001-jump'], svc: ['svc-rdp', 'svc-ssh'], action: 'allow', comment: 'Tiered admin model', ticket: 'CHG-3001', owner: 'grp-platform', hits: 2201 },
  { id: 'R90006', name: 'Backups to storage', src: ['vnet:vnet-app0042-wes'], dst: ['tag:Storage.westeurope'], svc: ['svc-https'], action: 'allow', comment: 'Backup window', ticket: 'CHG-3307', owner: 'grp-platform', hits: null },
];
rules.unshift(...top.map(t => ({ enabled: true, ...t }) as Rule));
rules.length = 10000;

// The Rule base as it is shown: Folder rows followed by their Rules, and Rules outside every Folder in between.
export const entries: Entry[] = [];
{
  const add = (id: string, name: string, from: number, to: number) => { entries.push({ id, folderRow: true, name }); for (let i = from; i < to; i++) { rules[i].folder = id; entries.push(rules[i]); } };
  entries.push(rules[0]);
  add('F01', 'App0042 release', 1, 4); add('F02', 'Platform and admin access', 4, 6);
  const names = ['Internet edge', 'Shared services', 'Monitoring and backup', 'Identity and directory', 'Partner access', 'Build and deploy', 'Data platform', 'Web applications',
    'Internal applications', 'Batch and integration', 'Databases', 'Messaging', 'Kubernetes platforms', 'Virtual desktops', 'Sandbox', 'Legacy, to review'];
  let i = 6, n = 0;
  while (i < 9800) {
    const to = Math.min(9800, i + 120 + Math.floor(rnd() * 900));
    add(`F${pad(n + 3, 2)}`, names[n % names.length] + (n >= names.length ? ` ${Math.floor(n / names.length) + 1}` : ''), i, to); i = to; n++;
    if (rnd() < 0.3) for (let k = 1 + Math.floor(rnd() * 3); k > 0 && i < 9800; k--) entries.push(rules[i++]);
  }
  for (; i < rules.length; i++) entries.push(rules[i]);
}

export const me = 'you';
export const versions = { latest: 1288, base: 1287 };
