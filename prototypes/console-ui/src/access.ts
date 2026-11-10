// PROTOTYPE, throwaway. Mock data for issue 38: principals, Role assignments, Approval levels per Scope, the audit log, health checks
// and settings. Nothing here is real: no tenant, subscription or customer names. Deterministic PRNG, like data.ts.
import { zones, zoneById, vnets, envs, Level, Zone } from './data';

let seed = 3838;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

// ---------- Roles and Scopes
export type RoleName = 'viewer' | 'editor' | 'approver' | 'admin';
export const roleRank: Record<RoleName, number> = { viewer: 1, editor: 2, approver: 3, admin: 4 };
export const roleNames: RoleName[] = ['viewer', 'editor', 'approver', 'admin'];
export type ScopeKind = 'instance' | 'env' | 'sub' | 'vnet' | 'zone';
export interface ScopeRef { kind: ScopeKind; id: string }
export const INSTANCE: ScopeRef = { kind: 'instance', id: 'instance' };
export const key = (s: ScopeRef) => `${s.kind}:${s.id}`;
export const fromKey = (k: string): ScopeRef => { const i = k.indexOf(':'); return { kind: k.slice(0, i) as ScopeKind, id: k.slice(i + 1) }; };

export const subs: { id: string; env: string; vnets: string[] }[] = [];
{ const m = new Map<string, { id: string; env: string; vnets: string[] }>(); for (const v of vnets) { const s = m.get(v.sub) ?? { id: v.sub, env: v.env, vnets: [] }; s.vnets.push(v.name); m.set(v.sub, s); } subs.push(...[...m.values()].sort((a, b) => a.id.localeCompare(b.id))); }
export const subById = new Map(subs.map(s => [s.id, s]));
export const vnetByName = new Map(vnets.map(v => [v.name, v]));
export const zoneByName = new Map(zones.map(z => [z.name, z]));

export const scopeName = (s: ScopeRef) => s.kind === 'instance' ? 'Instance' : s.kind === 'env' ? envs.find(e => e.id === s.id)?.name ?? s.id : s.kind === 'zone' ? zoneById.get(s.id)?.name ?? s.id : s.id;
export const kindLabel: Record<ScopeKind, string> = { instance: 'Instance', env: 'Environment', sub: 'Subscription', vnet: 'VNet', zone: 'Zone' };
export function parentOf(s: ScopeRef): ScopeRef | null {
  if (s.kind === 'instance') return null;
  if (s.kind === 'env') return INSTANCE;
  if (s.kind === 'sub') return { kind: 'env', id: subById.get(s.id)!.env };
  if (s.kind === 'vnet') return { kind: 'sub', id: vnetByName.get(s.id)!.sub };
  return { kind: 'vnet', id: zoneById.get(s.id)!.vnet };
}
export const pathOf = (s: ScopeRef) => { const out: ScopeRef[] = []; let c: ScopeRef | null = s; while (c) { out.unshift(c); c = parentOf(c); } return out; };
export const childrenOf = (s: ScopeRef): ScopeRef[] => s.kind === 'instance' ? envs.map(e => ({ kind: 'env' as const, id: e.id }))
  : s.kind === 'env' ? subs.filter(x => x.env === s.id).map(x => ({ kind: 'sub' as const, id: x.id }))
  : s.kind === 'sub' ? subById.get(s.id)!.vnets.map(v => ({ kind: 'vnet' as const, id: v }))
  : s.kind === 'vnet' ? vnetByName.get(s.id)!.zones.map(z => ({ kind: 'zone' as const, id: z })) : [];
/** Does Scope a contain Scope b (or equal it)? */
export const contains = (a: ScopeRef, b: ScopeRef) => pathOf(b).some(x => x.kind === a.kind && x.id === a.id);
export const zoneIn = (z: Zone, s: ScopeRef) => s.kind === 'instance' || (s.kind === 'env' && z.env === s.id) || (s.kind === 'sub' && z.sub === s.id) || (s.kind === 'vnet' && z.vnet === s.id) || (s.kind === 'zone' && z.id === s.id);
export const zoneCount = (s: ScopeRef) => s.kind === 'instance' ? zones.length : s.kind === 'zone' ? 1 : zones.filter(z => zoneIn(z, s)).length;

// ---------- Principals
export type PrincipalKind = 'user' | 'group' | 'sp' | 'mi';
export interface Principal { id: string; name: string; kind: PrincipalKind; upn?: string; oid: string; members?: string[]; deleted?: string; hidden?: boolean }
const oid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
export const principals: Principal[] = [
  { id: 'robin', name: 'Robin Hale', kind: 'user', upn: 'robin.hale@example.org', oid: oid() },
  { id: 'mika', name: 'Mika Berg', kind: 'user', upn: 'mika.berg@example.org', oid: oid() },
  { id: 'kim', name: 'Kim Novak', kind: 'user', upn: 'kim.novak@example.org', oid: oid() },
  { id: 'sam', name: 'Sam Ortiz', kind: 'user', upn: 'sam.ortiz@example.org', oid: oid() },
  { id: 'jo', name: 'Jo Lind', kind: 'user', upn: 'jo.lind@example.org', oid: oid() },
  { id: 'alex', name: 'Alex Weiss', kind: 'user', upn: 'alex.weiss@example.org', oid: oid() },
  { id: 'lena', name: 'Lena Roth', kind: 'user', upn: 'lena.roth@example.org', oid: oid() },
  { id: 'former', name: 'Former Admin', kind: 'user', upn: 'former.admin@example.org', oid: oid(), deleted: '2026-11-02' },
  { id: 'grp-netsec', name: 'grp-netsec', kind: 'group', oid: oid(), members: ['robin'] },
  { id: 'grp-prod-approvers', name: 'grp-prod-approvers', kind: 'group', oid: oid(), members: ['mika'] },
  { id: 'grp-platform', name: 'grp-platform', kind: 'group', oid: oid(), members: ['alex'] },
  { id: 'grp-app-teams', name: 'grp-app-teams', kind: 'group', oid: oid(), members: ['sam', 'alex'] },
  { id: 'grp-app0042', name: 'grp-app0042', kind: 'group', oid: oid(), members: ['alex'] },
  { id: 'grp-auditors', name: 'grp-auditors', kind: 'group', oid: oid(), members: [] },
  { id: 'grp-restricted-ops', name: 'grp-restricted-ops', kind: 'group', oid: oid(), hidden: true },
  { id: 'sp-siem', name: 'siem-collector', kind: 'sp', oid: oid() },
  { id: 'mi-monitoring', name: 'mi-monitoring', kind: 'mi', oid: oid() },
  { id: 'sp-pipeline', name: 'sp-release-pipeline', kind: 'sp', oid: oid() },
];
export const principalById = new Map(principals.map(p => [p.id, p]));
// The Entra app role InstanceAdmin is maintained in Entra, outside the tool.
export const instanceAdmins = ['robin', 'Break-glass account'];

export interface Assignment { id: string; principal: string; role: RoleName; scope: ScopeRef; by: string; at: string }
const z = (name: string): ScopeRef => ({ kind: 'zone', id: zoneByName.get(name)!.id });
const v = (n: number): ScopeRef => ({ kind: 'vnet', id: vnets[n - 1].name });
let aid = 0;
const as = (principal: string, role: RoleName, scope: ScopeRef, by = 'robin', at = '2026-10-14'): Assignment => ({ id: `ra${++aid}`, principal, role, scope, by, at });
export const initialAssignments: Assignment[] = [
  as('grp-netsec', 'admin', INSTANCE, 'Bootstrap (InstanceAdmin)', '2026-09-30'),
  as('sp-siem', 'viewer', INSTANCE), as('mi-monitoring', 'viewer', INSTANCE), as('grp-auditors', 'viewer', INSTANCE),
  as('mika', 'admin', { kind: 'env', id: 'prod' }), as('grp-prod-approvers', 'approver', { kind: 'env', id: 'prod' }), as('grp-platform', 'editor', { kind: 'env', id: 'prod' }),
  as('grp-app-teams', 'editor', { kind: 'env', id: 'nonprod' }), as('grp-platform', 'approver', { kind: 'env', id: 'nonprod' }),
  as('kim', 'approver', { kind: 'sub', id: 'sub-prod-03' }, 'mika', '2026-10-21'),
  as('grp-app0042', 'editor', v(42), 'mika', '2026-10-22'), as('jo', 'viewer', z('app0042-db'), 'mika', '2026-11-03'),
  as('former', 'editor', v(107), 'robin', '2026-10-01'), as('grp-restricted-ops', 'viewer', z('app0950-db'), 'robin', '2026-10-30'),
  as('sp-pipeline', 'editor', { kind: 'env', id: 'sandbox' }, 'robin', '2026-10-18'),
];
for (let i = 0; i < 26; i++) {
  const zz = zones[Math.floor(rnd() * zones.length)];
  const sc: ScopeRef = rnd() < 0.5 ? { kind: 'vnet', id: zz.vnet } : { kind: 'zone', id: zz.id };
  initialAssignments.push(as(pick(['grp-platform', 'alex', 'grp-app0042', 'grp-platform']), pick(['viewer', 'editor', 'editor', 'approver']), sc, pick(['robin', 'mika']), `2026-${pick(['10', '11'])}-${String(1 + Math.floor(rnd() * 9)).padStart(2, '0')}`));
}

// ---------- Personas for "Sign in as" (prototype only)
export interface Persona { id: string; user: string; label: string; note: string; entraAdmin?: boolean }
export const personas: Persona[] = [
  { id: 'ia', user: 'robin', label: 'Instance admin', note: 'Entra app role InstanceAdmin, and admin through grp-netsec', entraAdmin: true },
  { id: 'envadmin', user: 'mika', label: 'Environment admin', note: 'admin in Production' },
  { id: 'approver', user: 'kim', label: 'Approver', note: 'approver in subscription sub-prod-03' },
  { id: 'editor', user: 'sam', label: 'Editor', note: 'editor in Non-production through grp-app-teams' },
  { id: 'viewer', user: 'jo', label: 'Viewer of one Zone', note: 'viewer in Zone app0042-db' },
  { id: 'none', user: 'lena', label: 'No Role', note: 'signed in, nothing assigned' },
];

/** The groups a principal belongs to, resolved transitively through Graph. Hidden memberships are never resolved. */
export const groupsOf = (pid: string) => principals.filter(p => p.kind === 'group' && !p.hidden && p.members?.includes(pid)).map(p => p.id);
export interface Grant { role: RoleName; scope: ScopeRef; via: string; entra?: boolean }
export function grantsOf(pid: string, list: Assignment[], entraAdmin = false): Grant[] {
  const ids = new Set([pid, ...groupsOf(pid)]);
  const out: Grant[] = list.filter(a => ids.has(a.principal)).map(a => ({ role: a.role, scope: a.scope, via: a.principal === pid ? 'direct' : a.principal }));
  if (entraAdmin) out.unshift({ role: 'admin', scope: INSTANCE, via: 'Entra app role InstanceAdmin', entra: true });
  return out;
}
/** The highest Role a principal holds in a Scope: the highest assignment whose Scope contains it. */
export function roleAt(grants: Grant[], s: ScopeRef): Grant | null {
  let best: Grant | null = null;
  for (const g of grants) if (contains(g.scope, s) && (!best || roleRank[g.role] > roleRank[best.role])) best = g;
  return best;
}
export const roleInZone = (grants: Grant[], z: Zone): RoleName | null => {
  let best: RoleName | null = null;
  for (const g of grants) if (zoneIn(z, g.scope) && (!best || roleRank[g.role] > roleRank[best])) best = g.role;
  return best;
};

// ---------- Approval levels: set from Environment down, below the instance default.
export const levelRank: Record<Level, number> = { none: 0, approver: 1, 'four-eyes': 2 };
export const levels: Level[] = ['none', 'approver', 'four-eyes'];
export const initialLevels: Record<string, Level> = {
  'instance:instance': 'four-eyes',
  ...Object.fromEntries(envs.map(e => [`env:${e.id}`, e.level])),
  [`vnet:${vnets[609].name}`]: 'four-eyes',
  [`zone:${zoneByName.get('app0950-db')!.id}`]: 'approver',
  [`zone:${zoneByName.get('app0042-db')!.id}`]: 'four-eyes',
};

// ---------- Audit log
export type AuditCat = 'cs' | 'approval' | 'commit' | 'emergency' | 'setting' | 'role' | 'denied' | 'deploy' | 'drift' | 'auto' | 'import' | 'recovery';
export interface AuditEntry { seq: number; at: Date; actor: string; actorKind: PrincipalKind | 'tool'; cat: AuditCat; action: string; object: string; scopes: ScopeRef[]; result: 'ok' | 'denied' | 'failed'; detail?: string; ticket?: string; hash: string; prev: string }
export const auditCats: [AuditCat | 'all', string][] = [['all', 'All'], ['cs', 'Change sets'], ['approval', 'Approvals'], ['commit', 'Commits'], ['emergency', 'Emergency Commits'],
  ['setting', 'Settings'], ['role', 'Role assignments'], ['denied', 'Denied'], ['deploy', 'Deployments'], ['drift', 'Drift'], ['auto', 'Automatic'], ['import', 'Import notes'], ['recovery', 'Recovery']];
export const NOW = new Date('2026-11-10T10:04:00');
const people = ['robin', 'mika', 'kim', 'sam', 'alex', 'jo'];
const csNames = ['Q4 cleanup of expired Rules', 'Partner VPN access', 'Onboard vnet-app0107', 'Hotfix: block 203.0.113.0/24', 'Release app0042', 'Monitoring agents to all Zones', 'Backup window change', 'Remove legacy SMB'];
const rzones = () => { const n = 1 + Math.floor(rnd() * rnd() * 6); return Array.from({ length: n }, () => ({ kind: 'zone' as const, id: zones[Math.floor(rnd() * zones.length)].id })); };
export const auditEntries: AuditEntry[] = [];
{
  const gen: (() => Omit<AuditEntry, 'seq' | 'at' | 'hash' | 'prev'>)[] = [
    () => ({ actor: pick(people), actorKind: 'user', cat: 'cs', action: 'Submitted Change set', object: pick(csNames), scopes: rzones(), result: 'ok', ticket: `CHG-${4000 + Math.floor(rnd() * 2000)}` }),
    () => ({ actor: pick(people), actorKind: 'user', cat: 'cs', action: 'Discarded Change set', object: pick(csNames), scopes: rzones(), result: 'ok' }),
    () => { const sc = rzones(); return { actor: pick(['kim', 'mika']), actorKind: 'user', cat: 'approval', action: 'Approved', object: pick(csNames), scopes: sc, result: 'ok', detail: `Approved the Preview of revision ${1 + Math.floor(rnd() * 6)} for ${sc.length} Affected ${sc.length === 1 ? 'Zone' : 'Zones'}` }; },
    () => ({ actor: pick(['kim', 'mika']), actorKind: 'user', cat: 'approval', action: 'Rejected', object: pick(csNames), scopes: rzones(), result: 'ok', detail: 'Reason: opens SMB to a partner network' }),
    () => ({ actor: pick(people), actorKind: 'user', cat: 'commit', action: 'Committed', object: `Version ${1200 + Math.floor(rnd() * 88)}`, scopes: rzones(), result: 'ok', detail: `Change set “${pick(csNames)}”` }),
    () => ({ actor: 'nsgfw', actorKind: 'tool', cat: 'deploy', action: 'Deployment finished', object: `Version ${1200 + Math.floor(rnd() * 88)} to ${pick(['Production', 'Non-production', 'Sandbox'])}`, scopes: [{ kind: 'env', id: pick(['prod', 'nonprod', 'sandbox']) }], result: 'ok', detail: `${10 + Math.floor(rnd() * 400)} writes, ${Math.floor(rnd() * 3)} steps` }),
    () => ({ actor: 'nsgfw', actorKind: 'tool', cat: 'deploy', action: 'Deployment failed', object: `Version ${1200 + Math.floor(rnd() * 88)} to Production`, scopes: rzones(), result: 'failed', detail: 'Write to nsg-app0218-db rejected: 429 Too Many Requests after 3 tries. Later writes held back.' }),
    () => ({ actor: pick(people), actorKind: 'user', cat: 'deploy', action: 'Retried failed writes', object: `Deployment of Version ${1200 + Math.floor(rnd() * 88)}`, scopes: rzones(), result: 'ok' }),
    () => ({ actor: pick(['nsgfw', 'sam', 'alex']), actorKind: rnd() < 0.5 ? 'tool' : 'user', cat: 'drift', action: 'Overwrote Drift', object: `nsg-app${String(1 + Math.floor(rnd() * 999)).padStart(4, '0')}-web`, scopes: rzones().slice(0, 1), result: 'ok', detail: 'Lost subnet association written back' }),
    () => ({ actor: 'nsgfw', actorKind: 'tool', cat: 'auto', action: 'Removed ASG member', object: `nic-vm-${pick(['web', 'sql', 'jump'])}-${String(Math.floor(rnd() * 99)).padStart(2, '0')} from asg-${pick(['webfarm', 'sqlnodes', 'jumphosts'])}-${String(Math.floor(rnd() * 600)).padStart(3, '0')}`, scopes: rzones().slice(0, 1), result: 'ok', detail: 'The network interface was deleted in Azure. Adopted on its own: removing a member only closes traffic.' }),
    () => ({ actor: 'nsgfw', actorKind: 'tool', cat: 'auto', action: 'Disabled expired Rule', object: `R${String(Math.floor(rnd() * 99999)).padStart(5, '0')}`, scopes: rzones(), result: 'ok', detail: 'Expiry reached. Disabling an allow Rule needs no Approval.' }),
    () => ({ actor: pick(['robin', 'mika']), actorKind: 'user', cat: 'setting', action: 'Changed setting', object: pick(['flushConnection of Non-production: off to on', 'Hits window of Production: 30 to 14 days', 'Overwrite automatically of Production: on', 'Settle time: 10 s to 12 s']), scopes: [{ kind: 'env', id: pick(['prod', 'nonprod']) }], result: 'ok' }),
    () => ({ actor: 'robin', actorKind: 'user', cat: 'setting', action: 'Changed Approval level', object: 'Sandbox: approver to none', scopes: [{ kind: 'env', id: 'sandbox' }], result: 'ok' }),
    () => ({ actor: pick(['robin', 'mika']), actorKind: 'user', cat: 'role', action: 'Assigned Role', object: `${pick(['editor', 'viewer', 'approver'])} to ${pick(['grp-app-teams', 'alex', 'grp-app0042'])}`, scopes: [rnd() < 0.5 ? { kind: 'vnet', id: pick(vnets).name } : rzones()[0]], result: 'ok' }),
    () => ({ actor: pick(['robin', 'mika']), actorKind: 'user', cat: 'role', action: 'Removed Role assignment', object: `editor of ${pick(['alex', 'sam'])}`, scopes: [{ kind: 'vnet', id: pick(vnets).name }], result: 'ok' }),
    () => ({ actor: pick(['jo', 'sam', 'lena']), actorKind: 'user', cat: 'denied', action: 'Denied', object: pick(['Commit of “Release app0042”', 'Approval of “Partner VPN access”', 'Sign-in: no Role', 'Change of Role assignments']), scopes: rzones().slice(0, 2), result: 'denied', detail: 'Missing Role. The person was told which Role and Scope the action needs.' }),
    () => ({ actor: pick(['mika', 'robin']), actorKind: 'user', cat: 'import', action: 'Acknowledged Import note', object: `R${String(Math.floor(rnd() * 99999)).padStart(5, '0')} (warning)`, scopes: rzones().slice(0, 1), result: 'ok' }),
    () => ({ actor: 'sp-release-pipeline', actorKind: 'sp', cat: 'cs', action: 'Submitted Change set', object: 'Sandbox app rollout', scopes: [{ kind: 'env', id: 'sandbox' }], result: 'ok' }),
  ];
  const weights = [10, 2, 7, 1, 7, 9, 1, 1, 3, 6, 3, 1, 0.3, 2, 1, 2, 1, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  let t = NOW.getTime() - 4 * 60_000; const out: Omit<AuditEntry, 'seq' | 'hash' | 'prev'>[] = [];
  for (let i = 0; i < 4800; i++) {
    let r = rnd() * total, k = 0; while (r > weights[k]) { r -= weights[k]; k++; }
    out.push({ ...gen[k](), at: new Date(t) }); t -= Math.floor(rnd() * rnd() * 18 * 60_000) + 20_000;
  }
  // A few hand-written entries at the top, so the first screen reads like the morning of a real instance.
  const top: Omit<AuditEntry, 'seq' | 'hash' | 'prev'>[] = [
    { at: new Date(NOW.getTime() - 60_000), actor: 'jo', actorKind: 'user', cat: 'denied', action: 'Denied', object: 'Commit of “Release app0042”', scopes: [{ kind: 'zone', id: zoneByName.get('app0042-db')!.id }], result: 'denied', detail: 'Commit at the level none needs the editor Role in every Affected Zone. Jo holds viewer in app0042-db.' },
    { at: new Date(NOW.getTime() - 3 * 60_000), actor: 'nsgfw', actorKind: 'tool', cat: 'auto', action: 'Removed ASG member', object: 'nic-vm-web-03 from asg-webfarm-012', scopes: [{ kind: 'zone', id: zoneByName.get('app0042-web')!.id }], result: 'ok', detail: 'The network interface was deleted in Azure. Adopted on its own: removing a member only closes traffic.' },
    { at: new Date(NOW.getTime() - 9 * 60_000), actor: 'kim', actorKind: 'user', cat: 'approval', action: 'Approved', object: 'Partner VPN access', scopes: [{ kind: 'zone', id: zoneByName.get('app0042-api')!.id }, { kind: 'zone', id: zoneByName.get('app0042-db')!.id }], result: 'ok', detail: 'Approved the Preview of revision 4 for 2 Affected Zones. Signed in again 2 minutes before.' },
    { at: new Date(NOW.getTime() - 34 * 60_000), actor: 'nsgfw', actorKind: 'tool', cat: 'setting', action: 'Permission check', object: `Production: 2 actions missing on ${zones.filter(z => z.flags.includes('perm') && z.env === 'prod').length} Zones`, scopes: [{ kind: 'env', id: 'prod' }], result: 'failed', detail: 'Microsoft.Network/virtualNetworks/subnets/write and Microsoft.Network/networkSecurityGroups/join/action are missing. Deployments to these Zones stop before their first write.' },
  ];
  const all = [...top, ...out];
  // The recovery entry: the chain forks here, and the verify job accepts a fork only at a recovery entry (ADR 0019).
  all.splice(3100, 0, { at: new Date(all[3100].at.getTime() + 1000), actor: 'robin', actorKind: 'user', cat: 'recovery', action: 'Ended Recovery mode', object: 'Instance', scopes: [INSTANCE], result: 'ok', detail: 'Reason: database recovered from the backup of 2026-10-21 02:00. ID sequences jumped by the reserve.' });
  let prev = hex(64);
  for (let i = all.length - 1; i >= 0; i--) { const h = hex(64); auditEntries[i] = { ...all[i], seq: 1_283_000 + (all.length - i), hash: h, prev }; prev = h; }
}
export const auditTotal = 1_283_000 + auditEntries.length;

// ---------- Health
export type Health = 'ok' | 'warn' | 'bad' | 'off';
export const permZones = zones.filter(z => z.flags.includes('perm'));
export interface Problem { id: string; check: string; level: Health; title: string; where: string; effect: string; fix: string; zones?: Zone[]; actions?: string[]; link?: 'access' | 'envs' | 'alert' }
export const problems = (onPrem: boolean, chainBroken: boolean, alertOff: boolean): Problem[] => [
  ...(chainBroken ? [{ id: 'chain', check: 'chain', level: 'bad' as Health, title: 'The audit chain is broken at entry 1,284,977', where: 'Entry of 2026-11-08 14:02:11, “Changed setting”', effect: 'The entry, or one before it, was changed after it was written. The SIEM export holds the entries as they were written.', fix: 'Compare the entries around 1,284,977 with the export, then follow the incident runbook.' }] : []),
  { id: 'subnetwrite', check: 'azure', level: 'bad', title: 'Microsoft.Network/virtualNetworks/subnets/write', where: `nsgfw Writer, ${permZones.filter(z => z.env === 'prod').length} Zones in Production`, effect: 'Deployments to these Zones stop before their first write. Zones there cannot be onboarded.', fix: 'The Writer is not assigned on the resource groups of these subnets. Run environment-access for Production again, or assign the Writer on these resource groups.', zones: permZones.filter(z => z.env === 'prod'), actions: ['Microsoft.Network/virtualNetworks/subnets/write', 'Microsoft.Network/networkSecurityGroups/join/action'], link: 'envs' },
  { id: 'rgread', check: 'azure', level: 'warn', title: 'Microsoft.ResourceGraph/resourceChanges/read', where: 'nsgfw Reader, Non-production', effect: 'Drift polling is off in Non-production since 2026-11-09 06:00. The daily reconcile still finds Drift.', fix: 'The Reader role definition is older than this version of nsgfw. Apply the instance module to update the role definitions.', zones: permZones.filter(z => z.env !== 'prod'), actions: ['Microsoft.ResourceGraph/resourceChanges/read'], link: 'envs' },
  { id: 'hidden', check: 'graph', level: 'warn', title: 'A group with hidden membership', where: 'grp-restricted-ops, viewer in app0950-db', effect: 'nsgfw cannot read its members, so its Role assignment gives nobody access.', fix: 'Assign the Role to the people directly, or to a group with visible membership.', link: 'access' },
  { id: 'deleted', check: 'graph', level: 'warn', title: 'A Role assignment for a principal deleted in Entra', where: `Former Admin, editor in ${vnets[106].name}`, effect: 'The assignment gives nobody access. It stays until an admin removes it.', fix: 'Remove the assignment in Access.', link: 'access' },
  ...(onPrem ? [{ id: 'cert', check: 'cert', level: 'warn' as Health, title: 'The certificate of the Tool identity expires on 2026-12-03', where: 'Service principal nsgfw, thumbprint 7C…41', effect: 'In 23 days nsgfw can no longer sign in to Azure or Graph. Nothing reaches Azure after that.', fix: 'Add a new certificate to the app registration, swap the PEM file, then remove the old certificate. No restart needed.' }] : []),
  ...(alertOff ? [{ id: 'alert', check: 'alert', level: 'warn' as Health, title: 'No alert channel', where: 'Instance', effect: 'Alerts reach only the in-app inbox. A broken chain or a failed Deployment at night waits until someone signs in.', fix: 'Set up e-mail or a webhook.', link: 'alert' as const }] : []),
];

// ---------- Settings
export interface EnvSettings { autoOverwrite: boolean; flush: boolean; hitsDays: number; workspace: string; naming: string; rgPattern: string; def: string; repo?: string; branch?: string; pathPattern?: string; autoMerge?: boolean; applyTimeout?: number }
export const initialEnvSettings: Record<string, EnvSettings> = {
  prod: { autoOverwrite: false, flush: false, hitsDays: 30, workspace: 'law-flowlogs-mgmt (outside every Environment)', naming: 'nsg-{vnet}-{subnet}', rgPattern: '{vnet-resource-group}', def: 'Management group mg-production' },
  nonprod: { autoOverwrite: false, flush: true, hitsDays: 30, workspace: 'law-flowlogs-mgmt (outside every Environment)', naming: 'nsg-{vnet}-{subnet}', rgPattern: 'rg-network-{region}', def: 'Management group mg-nonproduction', repo: 'https://git.example.org/network/nonprod-nsg', branch: 'main', pathPattern: 'stacks/{subscription}/{region}', autoMerge: true, applyTimeout: 120 },
  sandbox: { autoOverwrite: false, flush: false, hitsDays: 14, workspace: 'law-sandbox', naming: 'nsg-{vnet}-{subnet}', rgPattern: '{vnet-resource-group}', def: 'Subscriptions sub-sandbox-01 to sub-sandbox-12' },
};
export const internalSpace = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'];
export const toolPaths = [
  { from: 'deployment', what: 'PostgreSQL', dst: 'psql-nsgfw (private endpoint 10.250.10.4)', svc: 'TCP 5432' },
  { from: 'deployment', what: 'Key Vault', dst: 'kv-nsgfw (private endpoint 10.250.10.5)', svc: 'TCP 443' },
  { from: 'deployment', what: 'DNS', dst: '168.63.129.16', svc: 'UDP 53, TCP 53' },
  { from: 'admin', what: 'Proxy', dst: '10.250.0.10', svc: 'TCP 3128', by: 'robin', reason: 'Outbound to Entra and ARM goes through the proxy' },
];
export const destEnforced = zones.filter(z => z.egress === 'dest').length;
