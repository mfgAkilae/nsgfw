// PROTOTYPE, throwaway. Issue 37: mock Deployments. The history of the last days, the live run of Version 1290 in Production,
// the Deployments of the Commits made in this session and the Retries started here. Every state derives from one shared clock.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { zones, zoneById } from './data';
import { permZones } from './access';
import { useOps, getOps, type Ops37 } from './ops37';
import { useFlow, type SessionVersion } from './flow';
import { useSession } from './session';

export type EnvId = 'prod' | 'nonprod' | 'sandbox';
export type DState = 'queued' | 'running' | 'deployed' | 'failed' | 'superseded' | 'stopped';
export type Start = 'commit' | 'scheduled' | 'emergency' | 'retry' | 'overwrite' | 'auto' | 'catchup';
export type VKind = 'expiry' | 'retranslation' | 'restore';
export type WKind = 'nsg' | 'assoc' | 'asg' | 'asgdel' | 'join' | 'leave';
export type WState = 'waiting' | 'writing' | 'retrying' | 'done' | 'failed' | 'policy' | 'skipped' | 'stopped' | 'pr';
export type PrState = 'open' | 'merged' | 'deployed' | 'policy' | 'notApplied' | 'closed' | 'superseded' | 'later';
/** A text with placeholders {0}, {1}: the first element is the i18n key. */
export type Msg = [string, ...(string | number)[]];
export const fill = (s: string, a: (string | number)[]) => s.replace(/\{(\d)\}/g, (_, i: string) => String(a[+i] ?? ''));

export interface PolicyHit { name: string; effect: string; reason: string; diff: [string, string, string][]; exemption: string }
export interface Write {
  id: string; res: string; kind: WKind; zone: string; step: number; state: WState; attempts: number; corr: string; hash: [string, string];
  at?: string; end?: string; code?: string; msg?: string; chg?: [number, number, number]; target?: string;
  waitsFor?: string; edge?: 'crossing' | 'dependency' | 'member'; wait?: 'edge' | 'slot' | 'precheck' | 'failed' | 'step'; left?: number;
  holds?: string; skip?: Msg; policy?: PolicyHit; rule?: string; pr?: number; retryAfter?: number; inFlight?: boolean; byV?: number;
}
export interface Bound { after: number; kind: 'crossing' | 'member'; text: Msg; state: 'done' | 'running' | 'later' | 'held'; left?: number }
export interface Pr { step: number; n?: number; state: PrState; files: string[]; rev: string; head?: string; at?: string; seen: [number, number]; by?: string; supersededBy?: number; assignment?: string }
export interface Check { what: 'drift' | 'policy' | 'limits' | 'perm' | 'contract'; tone: 'ok' | 'bad' | 'warn'; text: Msg; more?: Msg[] }
export interface Deployment {
  id: string; v: number | null; env: EnvId; start: Start; vkind?: VKind; cs: string; by: string; ts: string; secs: number; state: DState;
  writes: Write[]; more?: number; moreState?: WState; groups?: number; bounds: Bound[]; pre: Check[]; prs?: Pr[];
  supersededBy?: number; stopped?: Msg; retryOf?: string; retried?: { by: string; at: string; id: string }; resolved?: Msg; what?: Msg;
  live?: boolean; session?: boolean; emergencyOpen?: boolean; endAt?: string; revisionOnly?: boolean;
}

// ---------- names and small helpers
const pad = (n: number) => String(n).padStart(4, '0');
const zid = (v: number, tier: string) => `z${pad(v)}-${tier}`;
const Z = (id: string) => zoneById.get(id)!;
export const nsgOf = (id: string) => Z(id).nsg;
export const WEB = nsgOf('z0042-web'), API = nsgOf('z0042-api'), APP = nsgOf('z0042-app'), DB = nsgOf('z0042-db');
export const TODAY = '2026-11-10', YESTERDAY = '2026-11-09';
const NOWS = '10:04:00';
export const hx = (s: string, n = 7) => { let h = 2166136261, out = ''; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  while (out.length < n) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); out += (h >>> 0).toString(16).padStart(8, '0'); } return out.slice(0, n); };
const corr = (s: string) => `${hx(s + 'a', 8)}-${hx(s + 'b', 4)}-4${hx(s + 'c', 3)}-${hx(s + 'd', 4)}-${hx(s + 'e', 12)}`;
export const addS = (hms: string, s: number) => { const [h, m, x] = hms.split(':').map(Number); const tot = h * 3600 + m * 60 + (x || 0) + Math.round(s);
  return [Math.floor(tot / 3600) % 24, Math.floor(tot / 60) % 60, tot % 60].map(n => String(n).padStart(2, '0')).join(':'); };
export const dur = (s: number) => { s = Math.max(0, Math.round(s)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${Math.floor(s / 3600)} h${s % 3600 >= 60 ? ` ${Math.floor((s % 3600) / 60)} min` : ''}`; };
export const moduleOf = (z: string, pattern: string) => { const x = Z(z); return pattern.replace('{subscription}', x.sub).replace('{region}', x.region); };
export const fileOf = (m: string) => `${m}/nsgfw.json`;
const tiers = ['web', 'api', 'app', 'db', 'cache', 'mq', 'batch', 'mgmt', 'pe', 'aks', 'jump', 'ingress', 'worker', 'files', 'etl', 'mon', 'build', 'dmz', 'sftp', 'bi'];
const span: Record<EnvId, [number, number]> = { prod: [1, 600], nonprod: [601, 300], sandbox: [901, 100] };
function pickZones(key: string, env: EnvId, n: number) {
  const h = parseInt(hx(key, 6), 16); const [a, len] = span[env]; const out: string[] = [];
  for (let i = 0; out.length < n; i++) { const id = zid(a + ((h + i * 37) % len), tiers[(h + i * 7) % 20]); if (!out.includes(id)) out.push(id); }
  return out;
}
function W(dep: string, z: string, o: Partial<Write> = {}): Write {
  const zz = Z(z); const kind = o.kind ?? 'nsg'; const res = o.res ?? (kind === 'assoc' ? `${zz.vnet}/${zz.name}` : zz.nsg); const id = `${dep}:${res}:${kind}`;
  return { id, res, kind, zone: z, step: 1, state: 'done', attempts: 1, corr: corr(id), hash: [hx(id + 'h0', 6), hx(id + 'h1', 6)], chg: kind === 'nsg' ? [1, 0, 0] : undefined, target: kind === 'assoc' ? zz.nsg : undefined, ...o };
}
const at = (hms: string, i: number, w = 2) => ({ at: addS(hms, i * 3), end: addS(hms, i * 3 + w) });
const pre = (n: number, o: Partial<Record<Check['what'], Check>> = {}, np = n): Check[] => [
  o.drift ?? { what: 'drift', tone: 'ok', text: ['Fresh GET of {0} resources: no Drift.', n.toLocaleString('en')] },
  o.policy ?? { what: 'policy', tone: 'ok', text: ['checkPolicyRestrictions for {0} NSG and subnet writes: no deny finding.', np.toLocaleString('en')] },
  o.limits ?? { what: 'limits', tone: 'ok', text: ['NSGs and ASGs per subscription and region, Unmanaged included: within the limits.'] },
  o.perm ?? { what: 'perm', tone: 'ok', text: ['Complete for every Zone.'] },
];
const preTf = (n: number, contract?: Check): Check[] => [
  { what: 'drift', tone: 'ok', text: ['Fresh GET of every tool resource in the touched root modules ({0}): no Drift.', n.toLocaleString('en')] },
  contract ?? { what: 'contract', tone: 'ok', text: ['No hand edit in the Data contract files.'] },
  { what: 'limits', tone: 'ok', text: ['NSGs and ASGs per subscription and region, Unmanaged included: within the limits.'] },
];
const crossing = (flow: string, a: string, b: string, after = 1, state: Bound['state'] = 'done'): Bound => ({ after, kind: 'crossing', text: ['Crossing flow {0}: {1} closes it, {2} opens it.', flow, a, b], state });
const sizes = new Map<string, Map<string, number>>();
const inModules = (c: Ctx, zs: string[]) => { let m = sizes.get(c.pattern); if (!m) { m = new Map(); for (const z of zones) if (z.env === 'nonprod') { const k = moduleOf(z.id, c.pattern); m.set(k, (m.get(k) ?? 0) + 1); } sizes.set(c.pattern, m); }
  return [...new Set(zs.map(x => moduleOf(x, c.pattern)))].reduce((n, k) => n + (m!.get(k) ?? 0), 0); };
const tfFiles = (c: Ctx, zs: string[]) => [...new Set(zs.map(x => fileOf(moduleOf(x, c.pattern))))];

// Release 1285 opened SSH to the web tier for a vendor; its approver waived the deny finding at Submit (issue 36).
const waived = (n: number, nsg: string) => pre(n, { policy: { what: 'policy', tone: 'warn', text: ['checkPolicyRestrictions for {0} NSG and subnet writes: 1 deny finding, waived.', n],
  more: [['Waiver in force: {0} on {1}, by {2}: “{3}”', 'Deny management ports from the Internet (landing zone)', nsg, 'kim', 'Vendor maintenance until 2026-11-14, CHG-5099']] } });
export const POLICY_LZ: PolicyHit = { name: 'Landing zone: deny inbound from the Internet', effect: 'append', exemption: 'ex-lz-app0042-web',
  reason: 'Every NSG gets the NSG rule pol-deny-internet-in at priority 4000.',
  diff: [['securityRules', '24 NSG rules', '25 NSG rules'], ['pol-deny-internet-in', 'not requested', 'priority 4000, inbound, deny, Internet → any']] };
export const POLICY_FLUSH: PolicyHit = { name: 'Network baseline: flushConnection on every NSG', effect: 'modify', exemption: 'ex-baseline-app0042-app',
  reason: 'Sets flushConnection to true on every NSG.', diff: [['flushConnection', 'false (Environment setting: off)', 'true']] };

interface Ctx { t: number; wall: number; ops: Ops37; settle: number; extra: SessionVersion[]; pattern: string }

// ---------- Version 1290 in Production: the live run. Seconds on the live clock; the Deployment started 154 s before it.
function d1290prod(c: Ctx, cap = Infinity): Deployment {
  const id = 'd-1290-prod', S = c.settle, t = Math.min(c.t, cap), pol = c.ops.policyOnWrite, z = (x: string) => zid(42, x);
  const T: Record<string, [number, number]> = { app: [0, 3], jump: [0, 5], build: [0, 6], sftp: [0, 8], db: [3 + S, 6 + S] };
  const end = Math.max(8, 6 + S), appBad = pol && t >= 3;
  const timed = (tier: string, o: Partial<Write>): Write => {
    const [a, b] = T[tier]; const w = W(id, z(tier), o);
    if (t >= b) return tier === 'app' && pol ? { ...w, state: 'policy', at: addS(NOWS, a), end: addS(NOWS, b), policy: POLICY_FLUSH } : { ...w, state: 'done', at: addS(NOWS, a), end: addS(NOWS, b), attempts: tier === 'sftp' ? 3 : 1 };
    if (t >= a) return tier === 'sftp' ? { ...w, state: t < 6 ? 'retrying' : 'writing', at: addS(NOWS, a), attempts: t < 6 ? 2 : 3, code: 'AnotherOperationInProgress', retryAfter: t < 6 ? Math.ceil(6 - t) : undefined } : { ...w, state: 'writing', at: addS(NOWS, a) };
    return { ...w, state: 'waiting', wait: 'slot' };
  };
  const before = ['bi', 'batch', 'etl', 'mon', 'cache', 'mq', 'worker', 'files'].map((x, i) => W(id, z(x), { ...at('10:01:31', i + 1), chg: [1 + (i % 2), 0, i % 3], rule: 'R90004', ...(x === 'bi' ? { waitsFor: 'asg-reporting-app0042-wes', edge: 'dependency' as const } : {}) }));
  const asg = W(id, z('bi'), { kind: 'asg', res: 'asg-reporting-app0042-wes', ...at('10:01:28', 0) });
  let db = W(id, z('db'), { step: 2, waitsFor: APP, edge: 'crossing', holds: 'allow app0042-app → app0042-db tcp/1433', chg: [2, 0, 1], rule: 'R90004' });
  db = appBad ? { ...db, state: 'waiting', wait: 'failed' } : t < 3 ? { ...db, state: 'waiting', wait: 'edge' } : t < 3 + S ? { ...db, state: 'waiting', wait: 'edge', left: Math.ceil(3 + S - t) }
    : t < 6 + S ? { ...db, state: 'writing', at: addS(NOWS, 3 + S) } : { ...db, state: 'done', at: addS(NOWS, 3 + S), end: addS(NOWS, 6 + S) };
  const writes = [timed('app', { chg: [0, 1, 0], rule: 'R90004' }), asg, ...before, timed('jump', { chg: [1, 0, 2] }), timed('build', {}), timed('sftp', { chg: [1, 1, 0] }), db];
  const bound = crossing('app0042-app → app0042-db tcp/1433', APP, DB, 1, appBad ? 'held' : t < 3 ? 'later' : t < 3 + S ? 'running' : 'done');
  if (bound.state === 'running') bound.left = Math.ceil(3 + S - t);
  const done = t >= end && !appBad, failed = appBad && t >= 8;
  const d: Deployment = { id, v: 1290, env: 'prod', start: 'commit', cs: 'CHG-5131 Reporting database access', by: 'jo', ts: `${TODAY} 10:01`, secs: 154 + Math.min(t, failed ? 8 : end),
    state: done ? 'deployed' : failed ? 'failed' : 'running', writes, bounds: [bound], live: true, endAt: done ? addS(NOWS, end).slice(0, 5) : undefined,
    pre: pre(14, pol ? { policy: { what: 'policy', tone: 'ok', text: ['checkPolicyRestrictions for {0} NSG and subnet writes: no deny finding.', 13], more: [['{0} finding (information): {1} on {2}.', 'modify', POLICY_FLUSH.name, APP]] } } : {}, 13) };
  if (cap < Infinity && d.state === 'running') return { ...d, state: 'superseded', writes: d.writes.map(w => (w.state === 'writing' || w.state === 'retrying' ? { ...w, state: 'done', inFlight: true, end: addS(NOWS, t + 2) } : w.state === 'waiting' ? { ...w, state: 'stopped' } : w)), bounds: d.bounds.map(b => (b.state === 'running' ? { ...b, state: 'later', left: undefined } : b)) };
  return d;
}

// ---------- Version 1290 in Non-production: Terraform, one pull request per step.
function d1290nonprod(c: Ctx, supersededBy?: { n: number; pr: number }): Deployment {
  const id = 'd-1290-nonprod', zs = ['app', 'bi', 'etl', 'db'].map(x => zid(602, x)), files = tfFiles(c, zs);
  const st: PrState = c.ops.tfApplyPolicy ? 'policy' : c.ops.tfNotApplied ? 'notApplied' : supersededBy ? 'superseded' : 'open';
  const step1 = zs.slice(0, 3).map((z, i) => W(id, z, { pr: 418, chg: [1, i === 0 ? 1 : 0, 0], state: st === 'superseded' ? 'stopped' : st === 'notApplied' ? 'failed' : st === 'policy' && i === 0 ? 'failed' : st === 'policy' && i === 1 ? 'done' : 'pr',
    code: st === 'notApplied' ? 'not applied' : st === 'policy' && i === 0 ? 'RequestDisallowedByPolicy' : undefined, ...(st === 'policy' && i === 1 ? { end: '10:09:40' } : {}) }));
  const db = W(id, zs[3], { step: 2, waitsFor: nsgOf(zs[0]), edge: 'crossing', holds: 'allow app0602-app → app0602-db tcp/1433', chg: [2, 0, 0], state: st === 'superseded' ? 'stopped' : 'waiting', wait: 'step' });
  const head = hx('1290-step-1', 7);
  return { id, v: 1290, env: 'nonprod', start: 'commit', cs: 'CHG-5131 Reporting database access', by: 'jo', ts: `${TODAY} 10:01`, secs: 160,
    state: st === 'open' ? 'running' : st === 'superseded' ? 'superseded' : 'failed', supersededBy: supersededBy?.n, writes: [...step1, db],
    bounds: [crossing('app0602-app → app0602-db tcp/1433', nsgOf(zs[0]), nsgOf(zs[3]), 1, 'later')],
    prs: [{ step: 1, n: 418, state: st, files, rev: '1290.1', head, at: '10:01', seen: st === 'policy' ? [1, 3] : [0, 3], supersededBy: supersededBy?.pr, assignment: st === 'policy' ? 'Deny management ports from the Internet (landing zone)' : undefined },
      { step: 2, state: 'later', files, rev: '1290.2', seen: [0, 1] }], pre: preTf(inModules(c, zs)) };
}

// ---------- Version 1289 in Production: one write changed by Azure Policy on write, one write that waits for it.
function d1289prod(): Deployment {
  const id = 'd-1289-prod', z = (x: string) => zid(42, x);
  const web = W(id, z('web'), { state: 'policy', at: '09:12:38', end: '09:12:41', policy: POLICY_LZ, chg: [1, 0, 2], rule: 'R90002' });
  const rest = ['mgmt', 'mon', 'ingress'].map((x, i) => W(id, z(x), { ...at('09:12:38', i, 3), chg: [1, 0, i] }));
  const api = W(id, z('api'), { step: 2, state: 'waiting', wait: 'failed', waitsFor: WEB, edge: 'crossing', holds: 'allow app0042-web → app0042-api tcp/8443', chg: [1, 0, 0], rule: 'R90003' });
  return { id, v: 1289, env: 'prod', start: 'commit', cs: 'CHG-5118 Partner API for app0042', by: 'kim', ts: `${TODAY} 09:12`, secs: 47, state: 'failed', writes: [web, ...rest, api],
    bounds: [crossing('app0042-web → app0042-api tcp/8443', WEB, API, 1, 'held')],
    pre: pre(5, { policy: { what: 'policy', tone: 'ok', text: ['checkPolicyRestrictions for {0} NSG and subnet writes: no deny finding.', 5], more: [['{0} finding (information): {1} on {2}.', 'append', POLICY_LZ.name, WEB]] } }) };
}

// A small Deployment that went through without anything to look at.
function plain(id: string, v: number | null, env: EnvId, cs: string, by: string, ts: string, n: number, c: Ctx, o: Partial<Deployment> & { pr?: number } = {}): Deployment {
  const { pr, ...rest } = o; const zs = pickZones(id, env, n); const hms = `${ts.slice(11)}:05`; const tfm = env === 'nonprod'; const total = n + (o.more ?? 0);
  const writes = zs.map((z, i) => W(id, z, { ...at(hms, i), chg: [i % 3 === 0 ? 0 : 1, i % 4 === 0 ? 1 : 0, i % 5], pr: tfm ? pr : undefined }));
  const d: Deployment = { id, v, env, start: 'commit', cs, by, ts, secs: tfm ? 1260 : 8 + n * 3, state: 'deployed', writes, bounds: [], pre: tfm ? preTf(inModules(c, zs)) : pre(total), ...rest };
  if (tfm && pr) d.prs = [{ step: 1, n: pr, state: 'deployed', files: tfFiles(c, zs), rev: `${v ?? 0}.1`, head: hx(id, 7), at: ts.slice(11), seen: [total, total] }];
  return d;
}

function seeded(c: Ctx): Deployment[] {
  const S = c.settle, out: Deployment[] = [];
  // Version 1289 in Non-production: one step, one pull request, deployed once Azure showed the target.
  out.push(plain('d-1289-nonprod', 1289, 'nonprod', 'CHG-5118 Partner API for app0042', 'kim', `${TODAY} 09:12`, 2, c, { pr: 416, secs: 1140 }));
  // The tool overwrote a lost subnet association in Sandbox on its own (an Environment switch), without a Version.
  { const z = zid(950, 'web'); const id = 'd-auto-sandbox-0812';
    out.push({ id, v: null, env: 'sandbox', start: 'auto', cs: '', by: 'nsgfw', ts: `${TODAY} 08:12`, secs: 9, state: 'deployed', what: ['Automatic Overwrite of the association of {0}', Z(z).name], endAt: '08:12',
      writes: [W(id, z, { kind: 'assoc', at: '08:12:03', end: '08:12:09' })], bounds: [],
      pre: pre(1, { drift: { what: 'drift', tone: 'warn', text: ['The association of {0} to {1} was removed at 08:07 by svc-legacy-deploy via Azure CLI. A GET confirmed it.', Z(z).name, nsgOf(z)] } }) }); }
  // Emergency Commit 1287 in Non-production: the first pull request was closed without merge in the repository; sam's Retry opened a new one.
  { const zs = pickZones('1287-np', 'nonprod', 10); inModules(c, []); const files = [...sizes.get(c.pattern)!.keys()].map(fileOf).sort();
    const open = c.ops.tfOpenEmergency;
    out.push({ id: 'd-1287-nonprod', v: 1287, env: 'nonprod', start: 'retry', cs: 'Hotfix: block ext-partner-0339', by: 'sam', ts: `${TODAY} 07:04`, secs: open ? 3 * 3600 : 27 * 60, state: open ? 'running' : 'deployed', retryOf: 'd-1287-nonprod-1', emergencyOpen: open,
      writes: zs.map((z, i) => W('d-1287-nonprod', z, { pr: 414, state: open ? 'pr' : 'done', ...(open ? {} : at('07:31:00', i, 1)), chg: [1, 0, 0], rule: 'R90001' })), more: 5990, moreState: open ? 'pr' : 'done', groups: 12, bounds: [],
      prs: [{ step: 1, n: 414, state: open ? 'open' : 'deployed', files, rev: '1287.2', head: hx('1287-r', 7), at: '07:04', seen: open ? [0, 6000] : [6000, 6000] }], pre: preTf(6000), endAt: open ? undefined : '07:31' });
    out.push({ id: 'd-1287-nonprod-1', v: 1287, env: 'nonprod', start: 'emergency', cs: 'Hotfix: block ext-partner-0339', by: 'sam', ts: `${YESTERDAY} 09:41`, secs: 4 * 3600 + 28 * 60, state: 'failed',
      retried: { by: 'sam', at: 'today 07:04', id: 'd-1287-nonprod' }, resolved: ['Retried by {0} {1}', 'sam', 'today 07:04'],
      writes: zs.map(z => W('d-1287-nonprod-1', z, { pr: 409, state: 'stopped', chg: [1, 0, 0], rule: 'R90001' })), more: 5990, moreState: 'stopped', groups: 12, bounds: [],
      prs: [{ step: 1, n: 409, state: 'closed', by: 'j.doe', files, rev: '1287.1', head: hx('1287', 7), at: 'yesterday 09:42', seen: [0, 6000] }], pre: preTf(6000) }); }
  // An Overwrite of one resource: a Deployment of the Deployed state, no new Version, no Approval.
  { const z = zid(311, 'web'); const id = 'd-ow-0311-web';
    out.push({ id, v: null, env: 'prod', start: 'overwrite', cs: '', by: 'alex', ts: `${YESTERDAY} 14:20`, secs: 6, state: 'deployed', what: ['Overwrite of {0}', nsgOf(z)],
      writes: [W(id, z, { chg: [0, 1, 0], at: '14:20:02', end: '14:20:06' })], bounds: [],
      pre: pre(1, { drift: { what: 'drift', tone: 'warn', text: ['Drift on {0}: NSG rule {1} added in the Azure portal. The Overwrite writes the Deployed state back.', nsgOf(z), 'tmp-debug-8080'] } }) }); }
  // A catch-up after a re-home: the current Version delivered to a Zone's new Managed NSG, no new Version, no new Approval.
  { const z = zid(310, 'files'); const id = 'd-catchup-0310-files';
    out.push({ id, v: 1287, env: 'prod', start: 'catchup', cs: 'Hotfix: block ext-partner-0339', by: 'nsgfw', ts: `${YESTERDAY} 11:20`, secs: 21, state: 'deployed', what: ['Catch-up after the re-home of {0}', Z(z).name],
      writes: [W(id, z, { chg: [14, 0, 0], at: '11:20:04', end: '11:20:11' }), W(id, z, { kind: 'assoc', step: 1, at: '11:20:12', end: '11:20:25', waitsFor: nsgOf(z), edge: 'dependency' })], bounds: [], pre: pre(2) }); }
  // Emergency Commit 1287: every Managed NSG, because its deny Rule has the destination any. The write budget decides the duration.
  out.push(plain('d-1287-prod', 1287, 'prod', 'Hotfix: block ext-partner-0339', 'sam', `${YESTERDAY} 09:41`, 12, c, { start: 'emergency', more: 11988, groups: 12, secs: 700, writes: pickZones('1287-p', 'prod', 12).map((z, i) => W('d-1287-prod', z, { ...at('09:41:06', i, 2), chg: [1, 0, 0], rule: 'R90001' })) }));
  out.push(plain('d-1287-sandbox', 1287, 'sandbox', 'Hotfix: block ext-partner-0339', 'sam', `${YESTERDAY} 09:41`, 8, c, { start: 'emergency', more: 1992, groups: 12, secs: 96 }));
  // Version 1286 turned off expired allow Rules. One Zone was skipped (the nsgfw Writer is missing there); it delivered what 1285 did not.
  { const id = 'd-1286-prod'; const pz = permZones.find(z => z.env === 'prod') ?? Z(zid(77, 'web'));
    const leftovers = [W(id, zid(41, 'api'), { ...at('00:05:04', 0, 2), chg: [1, 0, 0], byV: 1285 }), W(id, zid(41, 'db'), { ...at('00:05:04', 1, 2), chg: [1, 0, 1], byV: 1285 })];
    const exp = pickZones(id, 'prod', 9).map((z, i) => W(id, z, { ...at('00:05:10', i, 2), chg: [0, 1, 0] }));
    const skip = W(id, pz.id, { state: 'skipped', chg: [0, 1, 0], skip: ['missing {0} (the nsgfw Writer is not on its resource group)', 'Microsoft.Network/networkSecurityGroups/write'] });
    out.push({ id, v: 1286, env: 'prod', start: 'commit', vkind: 'expiry', cs: 'Disable expired allow Rules', by: 'nsgfw', ts: '2026-11-08 00:05', secs: 64, state: 'deployed', writes: [...leftovers, ...exp, skip], bounds: [],
      pre: pre(12, { perm: { what: 'perm', tone: 'warn', text: ['1 Zone skipped: {0}, missing {1}. Skipped Zones do not block the others.', pz.name, 'Microsoft.Network/networkSecurityGroups/write'] } }) }); }
  out.push(plain('d-1286-nonprod', 1286, 'nonprod', 'Disable expired allow Rules', 'nsgfw', '2026-11-08 00:05', 4, c, { vkind: 'expiry', pr: 406 }));
  // Version 1285, scheduled: one write kept failing on a transient error for 30 minutes; kim's Retry was superseded by Version 1286.
  { const z = (x: string) => zid(41, x); const [web, api, db] = ['web', 'api', 'db'].map(x => nsgOf(z(x)));
    out.push({ id: 'd-1285-prod', v: 1285, env: 'prod', start: 'retry', cs: 'Release app0041', by: 'kim', ts: '2026-11-08 00:01', secs: 251, state: 'superseded', supersededBy: 1286, retryOf: 'd-1285-prod-1',
      writes: [W('d-1285-prod', z('web'), { at: '00:01:12', end: '00:02:10', attempts: 1 }), W('d-1285-prod', z('api'), { step: 2, at: '00:04:40', end: '00:05:12', inFlight: true, waitsFor: web, edge: 'crossing' }),
        W('d-1285-prod', z('db'), { step: 3, state: 'stopped', waitsFor: api, edge: 'crossing', holds: 'allow app0041-api → app0041-db tcp/1433' })],
      bounds: [crossing('app0041-web → app0041-api tcp/443', web, api, 1), crossing('app0041-api → app0041-db tcp/1433', api, db, 2, 'later')], pre: waived(3, web) });
    out.push({ id: 'd-1285-prod-1', v: 1285, env: 'prod', start: 'scheduled', cs: 'Release app0041', by: 'alex', ts: '2026-11-07 22:00', secs: 1870, state: 'failed',
      retried: { by: 'kim', at: '2026-11-08 00:01', id: 'd-1285-prod' }, resolved: ['Retried by {0} {1}', 'kim', '2026-11-08 00:01'],
      writes: [W('d-1285-prod-1', z('app'), at('22:00:08', 0)), W('d-1285-prod-1', z('web'), { state: 'failed', at: '22:00:08', end: '22:31:02', attempts: 14, code: 'AnotherOperationInProgress', msg: `Operation on ${web} is not allowed: another operation on this or a dependent resource is in progress. Retried with backoff for 30 minutes.` }),
        W('d-1285-prod-1', z('api'), { step: 2, state: 'waiting', wait: 'failed', waitsFor: web, edge: 'crossing', holds: 'allow app0041-web → app0041-api tcp/443' }),
        W('d-1285-prod-1', z('db'), { step: 3, state: 'waiting', wait: 'edge', waitsFor: api, edge: 'crossing', holds: 'allow app0041-api → app0041-db tcp/1433' })],
      bounds: [crossing('app0041-web → app0041-api tcp/443', web, api, 1, 'held'), crossing('app0041-api → app0041-db tcp/1433', api, db, 2, 'later')], pre: waived(4, web) }); }
  out.push(plain('d-1285-nonprod', 1285, 'nonprod', 'Release app0041', 'alex', '2026-11-07 22:00', 3, c, { start: 'scheduled', pr: 405, secs: 2460 }));
  for (const env of ['prod', 'nonprod', 'sandbox'] as EnvId[]) out.push(plain(`d-1284-${env}`, 1284, env, 'Move the Folder “Monitoring and backup”', 'kim', '2026-11-07 11:15', env === 'prod' ? 8 : env === 'nonprod' ? 3 : 2, c, { pr: 404 }));
  // Re-translation 1283 in Production: member steps and one Crossing flow, so three step boundaries, each with the Settle time.
  { const id = 'd-1283-prod', z = (x: string) => zid(42, x), asgN = 'asg-webfarm-app0042-wes', asgO = 'asg-web-app0042-wes';
    const nic = (n: number, kind: WKind, step: number, i: number) => W(id, z('web'), { kind, res: `nic-vm-app0042-web-0${n}`, target: kind === 'join' ? asgN : asgO, step, ...at('07:30:20', i + step * 4, 2) });
    out.push({ id, v: 1283, env: 'prod', start: 'commit', vkind: 'retranslation', cs: 'Re-translation for engine 1.5.2', by: 'nsgfw', ts: '2026-11-06 07:30', secs: 71, state: 'deployed', bounds: [
        { after: 1, kind: 'member', text: ['Member step: the network interfaces join {0} before an NSG rule refers to it.', asgN], state: 'done' },
        crossing('app0042-api → app0042-db tcp/1433', API, DB, 2),
        { after: 3, kind: 'member', text: ['Member step: the network interfaces leave {0} only after no NSG rule refers to it any more.', asgO], state: 'done' }],
      writes: [W(id, z('web'), { kind: 'asg', res: asgN, ...at('07:30:08', 0) }), nic(1, 'join', 1, 1), nic(2, 'join', 1, 2),
        W(id, z('web'), { step: 2, chg: [2, 2, 0], ...at('07:30:40', 0) }), W(id, z('api'), { step: 2, chg: [1, 1, 3], ...at('07:30:40', 1) }),
        W(id, z('db'), { step: 3, chg: [1, 1, 0], waitsFor: API, edge: 'crossing', ...at('07:30:58', 0) }),
        nic(1, 'leave', 4, 0), nic(2, 'leave', 4, 1), W(id, z('web'), { kind: 'asgdel', res: asgO, step: 4, waitsFor: 'nic-vm-app0042-web-02', edge: 'dependency', ...at('07:31:24', 0) })],
      pre: pre(6) }); }
  out.push(plain('d-1283-nonprod', 1283, 'nonprod', 'Re-translation for engine 1.5.2', 'nsgfw', '2026-11-06 07:30', 5, c, { vkind: 'retranslation', pr: 401 }));
  out.push(plain('d-1283-sandbox', 1283, 'sandbox', 'Re-translation for engine 1.5.2', 'nsgfw', '2026-11-06 07:30', 3, c, { vkind: 'retranslation' }));
  out.push(plain('d-1282-prod', 1282, 'prod', 'Restore to Version 1279', 'jo', '2026-11-05 18:02', 2, c, { vkind: 'restore' }));
  out.push(plain('d-1282-nonprod', 1282, 'nonprod', 'Restore to Version 1279', 'jo', '2026-11-05 18:02', 1, c, { vkind: 'restore', pr: 399 }));
  out.push(plain('d-1280-prod', 1280, 'prod', 'Monitoring agents in 019', 'kim', '2026-11-04 10:30', 4, c));
  out.push(plain('d-1280-nonprod', 1280, 'nonprod', 'Monitoring agents in 019', 'kim', '2026-11-04 10:30', 2, c, { pr: 396 }));
  // Version 1274 stopped in Non-production before its first write: a live limit. Version 1275 delivered it.
  { const id = 'd-1274-nonprod'; const zs = pickZones(id, 'nonprod', 3); const big = zid(700, 'aks');
    out.push({ id, v: 1274, env: 'nonprod', start: 'commit', cs: 'Monitoring agents in 013', by: 'jo', ts: '2026-11-01 14:10', secs: 4, state: 'stopped', resolved: ['Delivered by Version {0}', 1275],
      stopped: ['Limit: {0} would hold {1} of {2} NSG rules.', nsgOf(big), '2,031', '2,000'], writes: [...zs, big].map(z => W(id, z, { state: 'stopped' })), bounds: [],
      pre: [{ what: 'drift', tone: 'ok', text: ['Fresh GET of every tool resource in the touched root modules ({0}): no Drift.', inModules(c, zs).toLocaleString('en')] }, { what: 'contract', tone: 'ok', text: ['No hand edit in the Data contract files.'] },
        { what: 'limits', tone: 'bad', text: ['Limit: {0} would hold {1} of {2} NSG rules.', nsgOf(big), '2,031', '2,000'] }] }); }
  return [d1289prod(), ...out];
}

// ---------- Retries started in this session: ARM writes again, or a Terraform pull request that changes only the revision value
interface Retry { id: string; of: string; ids: string[]; wall: number; at: string; by: string }
let retries: Retry[] = [];
export function startRetry(of: Deployment, ids: string[], by: string, at: string) {
  const dependants = of.writes.filter(w => w.wait === 'failed' || w.wait === 'step' || (w.state === 'waiting' && ids.some(i => of.writes.find(x => x.id === i)?.res === w.waitsFor))).map(w => w.id);
  const id = `${of.id}-r${retries.filter(r => r.of === of.id).length + 1}`;
  retries = [...retries, { id, of: of.id, ids: [...new Set([...ids, ...dependants])], wall: Date.now(), at, by }]; ensureTimer(); emit(); return id;
}
const bad = (w: Write) => w.state === 'failed' || w.state === 'policy';
function retryDep(c: Ctx, r: Retry, of: Deployment, prNo: number): Deployment {
  const e = (c.wall - r.wall) / 1000, S = c.settle; const ws = of.writes.filter(w => r.ids.includes(w.id));
  const first = Math.min(...ws.filter(w => bad(w) || w.state === 'pr').map(w => w.step), ...(ws.length ? [] : [1])); const later = ws.some(w => w.step > first);
  const base = { id: r.id, v: of.v, env: of.env, start: 'retry' as Start, cs: of.cs, by: r.by, ts: `${TODAY} ${r.at.slice(0, 5)}`, retryOf: of.id, session: true, what: of.what };
  const fresh = (w0: Write): Write => ({ ...w0, id: `${r.id}:${w0.res}:${w0.kind}`, corr: corr(r.id + w0.res), state: 'waiting', policy: undefined, code: undefined, msg: undefined, attempts: 1, at: undefined, end: undefined, wait: undefined, left: undefined });
  if (of.prs) {
    const o1 = 0.5, o2 = o1 + 9 + S; const prState = (o: number): PrState => (e < o ? 'later' : e < o + 4 ? 'open' : e < o + 9 ? 'merged' : 'deployed');
    const writes = ws.map((w0): Write => { const w = fresh(w0); const s = prState(w.step <= first ? o1 : o2);
      return { ...w, pr: w.step <= first ? prNo : prNo + 1, state: s === 'deployed' ? 'done' : s === 'later' ? 'waiting' : 'pr', wait: s === 'later' ? (w.step <= first ? 'precheck' : 'step') : undefined }; });
    const files = of.prs[0].files; const end = later ? o2 + 9 : o1 + 9; const major = of.prs[0].rev.split('.')[0];
    const prs: Pr[] = [{ step: first, n: prNo, state: prState(o1), files, rev: `${major}.${first}.${r.id.slice(-1)}`, head: hx(r.id, 7), at: r.at.slice(0, 5), seen: [writes.filter(w => w.step <= first && w.state === 'done').length, writes.filter(w => w.step <= first).length] }];
    if (later) prs.push({ step: first + 1, n: e >= o2 ? prNo + 1 : undefined, state: prState(o2), files, rev: `${major}.${first + 1}`, head: e >= o2 ? hx(r.id + '2', 7) : undefined, seen: [writes.filter(w => w.step > first && w.state === 'done').length, writes.filter(w => w.step > first).length] });
    return { ...base, secs: Math.min(e, end), state: e >= end ? 'deployed' : 'running', writes, prs, endAt: e >= end ? r.at.slice(0, 5) : undefined, revisionOnly: of.prs.some(p => p.state === 'notApplied' || p.state === 'closed'),
      bounds: of.bounds.map(b => ({ ...b, state: e < o1 + 9 ? 'later' : e < o2 ? 'running' : 'done', left: e >= o1 + 9 && e < o2 ? Math.ceil(o2 - e) : undefined })), pre: of.pre };
  }
  const end = later ? 6 + S : 3;
  const writes = ws.map((w0): Write => {
    const w = fresh(w0);
    if (e < 1) return { ...w, wait: 'precheck' };
    if (w0.step <= first) return e < 3 ? { ...w, state: 'writing', at: r.at } : { ...w, state: 'done', at: r.at, end: addS(r.at, 3) };
    return e < 3 ? { ...w, wait: 'edge' } : e < 3 + S ? { ...w, wait: 'edge', left: Math.ceil(3 + S - e) } : e < 6 + S ? { ...w, state: 'writing', at: addS(r.at, 3 + S) } : { ...w, state: 'done', at: addS(r.at, 3 + S), end: addS(r.at, 6 + S) };
  });
  const pol = ws.find(w => w.policy);
  return { ...base, secs: Math.min(e, end), state: e >= end ? 'deployed' : 'running', writes, endAt: e >= end ? addS(r.at, end).slice(0, 5) : undefined,
    bounds: of.bounds.filter(b => b.after >= first && b.after < Math.max(...ws.map(w => w.step))).map(b => ({ ...b, state: e < 3 ? 'later' : e < 3 + S ? 'running' : 'done', left: e >= 3 && e < 3 + S ? Math.ceil(3 + S - e) : undefined })),
    pre: pre(writes.length, { policy: { what: 'policy', tone: 'ok', text: ['checkPolicyRestrictions ran again for the {0} retried writes: no deny finding.', writes.length], more: pol?.policy ? [['Exemption {0} for {1} in force (prototype assumption).', pol.policy.exemption, pol.res]] : undefined } }) };
}

// ---------- Deployments of the Commits made in this session
const seen = new Map<number, { wall: number; t: number }>();
function sessionDeps(c: Ctx, sv: SessionVersion, idx: number, ids: Set<string>, sup: { prod?: Deployment; nonprod?: Deployment }): Deployment[] {
  const e = (c.wall - seen.get(sv.n)!.wall) / 1000, S = c.settle;
  const sid = (env: EnvId) => (ids.has(`d-${sv.n}-${env}`) ? `d-${sv.n}-${env}-now` : `d-${sv.n}-${env}`);
  const start: Start = sv.kind === 'emergency' ? 'emergency' : sv.kind === 'scheduled' ? 'scheduled' : 'commit';
  const base = { v: sv.n, start, cs: sv.name, by: sv.by, ts: `${TODAY} ${sv.at}`, session: true, bounds: [] as Bound[] };
  // Production: at most 10 writes in flight per subscription and region.
  const pid = sid('prod'); const pool = zones.slice(41 * 20, 44 * 20).filter(z => z.id !== 'z0042-web' && z.id !== 'z0042-api').map(z => z.id);
  const n = Math.min(sv.nsgs, 40);
  const prodW: Write[] = pool.slice(0, n).map((z, i): Write => { const a = 0.6 + Math.floor(i / 10) * 1.6, b = a + 1.2; const w = W(pid, z, { chg: [1, 0, i % 3] });
    return e < a ? { ...w, state: 'waiting', wait: i >= 10 ? 'slot' : 'precheck' } : e < b ? { ...w, state: 'writing', at: sv.at } : { ...w, state: 'done', at: sv.at, end: sv.at }; });
  // A superseded older Deployment: the newer one plans from the Deployed state and also delivers what the older did not.
  const carry: Write[] = (sup.prod?.writes ?? []).filter(w => w.state === 'stopped').map((w): Write => ({ ...w, id: `${pid}:${w.res}:${w.kind}`, byV: sup.prod!.v ?? undefined, state: e < 3 ? 'waiting' : 'done', wait: e < 3 ? 'precheck' : undefined, step: 1, waitsFor: undefined, edge: undefined, left: undefined }));
  const pEnd = 0.6 + Math.ceil(n / 10) * 1.6;
  const prod: Deployment = { ...base, id: pid, env: 'prod', secs: Math.min(e, pEnd), state: e >= pEnd ? 'deployed' : 'running', writes: [...prodW, ...carry], more: Math.max(0, sv.nsgs - n) || undefined, pre: pre(sv.nsgs), endAt: e >= pEnd ? sv.at : undefined };
  // Non-production: one pull request per step; when it supersedes 1290, it carries its Crossing flow and so has two steps.
  const nid = sid('nonprod'); const two = !!sup.nonprod; const k0 = 421 + idx * 2; const o1 = 0.5, o2 = o1 + 9 + S;
  const prState = (o: number): PrState => (e < o ? 'later' : e < o + 4 ? 'open' : e < o + 9 ? 'merged' : 'deployed');
  const own = pickZones(`s${sv.n}`, 'nonprod', Math.min(Math.max(1, Math.round(sv.nsgs / 6)), 8));
  const tw: Write[] = [...own.map(z => W(nid, z, { step: 1 })), ...(two ? sup.nonprod!.writes.map(w => ({ ...w, id: `${nid}:${w.res}:${w.kind}`, byV: 1290 })) : [])].map((w): Write => { const s = prState(w.step === 1 ? o1 : o2);
    return { ...w, pr: w.step === 1 ? k0 : k0 + 1, state: s === 'deployed' ? 'done' : s === 'later' ? 'waiting' : 'pr', wait: s === 'later' ? (w.step === 1 ? 'precheck' : 'step') : undefined, code: undefined }; });
  const files = tfFiles(c, tw.map(w => w.zone));
  const prs: Pr[] = [{ step: 1, n: k0, state: prState(o1), files, rev: `${sv.n}.1`, head: hx(`${sv.n}-1`, 7), at: sv.at, seen: [tw.filter(w => w.step === 1 && w.state === 'done').length, tw.filter(w => w.step === 1).length] }];
  if (two) prs.push({ step: 2, n: e >= o2 ? k0 + 1 : undefined, state: prState(o2), files, rev: `${sv.n}.2`, head: e >= o2 ? hx(`${sv.n}-2`, 7) : undefined, at: e >= o2 ? sv.at : undefined, seen: [tw.filter(w => w.step === 2 && w.state === 'done').length, tw.filter(w => w.step === 2).length] });
  const nEnd = two ? o2 + 9 : o1 + 9;
  const nonprod: Deployment = { ...base, id: nid, env: 'nonprod', secs: Math.min(e, nEnd), state: e >= nEnd ? 'deployed' : 'running', writes: tw, prs, pre: preTf(inModules(c, tw.map(w => w.zone))), endAt: e >= nEnd ? sv.at : undefined,
    bounds: two ? [{ ...sup.nonprod!.bounds[0], state: e < o1 + 9 ? 'later' : e < o2 ? 'running' : 'done', left: e >= o1 + 9 && e < o2 ? Math.ceil(o2 - e) : undefined }] : [] };
  return [prod, nonprod];
}

function build(c: Ctx): Deployment[] {
  const sess = c.extra.filter(v => v.nsgs > 0 && v.kind !== 'folders').slice().reverse();   // oldest first
  sess.forEach(v => { if (!seen.has(v.n)) { seen.set(v.n, { wall: Date.now(), t: c.t }); ensureTimer(); } });
  // Only a newer Version supersedes: a session Commit numbered 1289 or 1290 (flow.tsx starts at 1288) leaves the seeded 1290 alone.
  const supI = sess.findIndex(v => v.n > 1290); const sup = supI < 0 ? undefined : sess[supI]; const first = sup ? seen.get(sup.n)! : undefined;
  let p90 = d1290prod(c); if (sup && first) { const capped = d1290prod(c, first.t); if (capped.state === 'superseded') p90 = { ...capped, supersededBy: sup.n }; }
  let n90 = d1290nonprod(c); if (sup && n90.state === 'running') n90 = d1290nonprod(c, { n: sup.n, pr: 421 + supI * 2 });
  const base = [p90, n90, ...seeded(c)];
  const ids = new Set(base.map(d => d.id));
  const sessDeps = sess.flatMap((v, i) => sessionDeps(c, v, i, ids, i === supI ? { prod: p90.state === 'superseded' ? p90 : undefined, nonprod: n90.state === 'superseded' ? n90 : undefined } : {}));
  const all = [...sessDeps.reverse(), ...base];
  const rs: Deployment[] = []; let prNo = 419;
  for (const r of retries) { const of = [...rs, ...all].find(d => d.id === r.of); if (!of) continue; rs.push(retryDep(c, r, of, prNo)); if (of.prs) prNo += 2; }
  const done = (d: Deployment): Deployment => { const r = [...retries].reverse().find(x => x.of === d.id); if (!r) return d; const rd = rs.find(x => x.id === r.id)!;
    return { ...d, retried: { by: r.by, at: `today ${r.at.slice(0, 5)}`, id: r.id }, resolved: rd.state === 'deployed' ? ['Retried by {0} {1}', r.by, `today ${r.at.slice(0, 5)}`] : undefined }; };
  const rest = all.map(done);
  return [...rs.map(done).reverse(), ...rest.filter(d => d.session), ...rest.filter(d => !d.session).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))];
}

// ---------- the clock: sampled on each tick, so every read between two ticks sees the same time
let liveStart: number | null = null, pausedAt: number | null = null, tick = 0, timer: number | undefined, lastSettle = 10;
let sampled = { t: 0, wall: Date.now() };
const subs = new Set<() => void>();
function sample() {
  const on = getOps().liveRun; const raw = liveStart === null ? 0 : (Date.now() - liveStart) / 1000;
  if (!on && pausedAt === null) pausedAt = raw; else if (on && pausedAt !== null) { if (liveStart !== null) liveStart = Date.now() - pausedAt * 1000; pausedAt = null; }
  sampled = { t: pausedAt ?? (liveStart === null ? 0 : (Date.now() - liveStart) / 1000), wall: Date.now() };
}
function emit() { sample(); tick++; subs.forEach(f => f()); }
function busy() { const now = Date.now(), long = 30_000 + lastSettle * 2000;
  return (liveStart !== null && pausedAt === null && sampled.t < 12 + lastSettle) || retries.some(r => now - r.wall < long) || [...seen.values()].some(s => now - s.wall < long); }
function ensureTimer() { if (timer !== undefined) return; timer = window.setInterval(() => { emit(); if (!busy()) { window.clearInterval(timer); timer = undefined; } }, 500); }
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
/** The live run of Version 1290 starts when someone first looks at Deployments, so it is still running then. */
export function startLive() { if (liveStart === null) replay(); }
export function replay() { liveStart = Date.now(); pausedAt = getOps().liveRun ? null : 0; ensureTimer(); emit(); }

let cache: { key: string; list: Deployment[] } | null = null;
let last: Deployment[] | null = null;
function useCtx(): Omit<Ctx, 't' | 'wall'> {
  const ops = useOps(); const f = useFlow(); const se = useSession();
  useEffect(() => { emit(); if (busy()) ensureTimer(); }, [ops]);
  return { ops, settle: se.settle, extra: f.extra, pattern: se.envSettings.nonprod?.pathPattern ?? 'stacks/{subscription}/{region}' };
}
function current(c: Omit<Ctx, 't' | 'wall'>) {
  const key = `${tick}|${JSON.stringify(c.ops)}|${c.extra.map(v => v.n).join(',')}|${c.settle}|${c.pattern}|${retries.length}`;
  if (cache?.key !== key) { lastSettle = c.settle; cache = { key, list: build({ ...c, t: sampled.t, wall: sampled.wall }) }; last = cache.list; }
  return cache.list;
}
/** Every Deployment, newest first, re-rendered on each tick of the clock. */
export function useDeploys(): Deployment[] { const c = useCtx(); useSyncExternalStore(subscribe, () => tick); return current(c); }
/** A derived value that re-renders only when it changes. The selector returns plain data. */
export function useSel<T>(sel: (l: Deployment[]) => T): T {
  const c = useCtx(); const s = useSyncExternalStore(subscribe, () => JSON.stringify(sel(current(c))));
  return useMemo(() => JSON.parse(s) as T, [s]);
}
/** The list as last computed, for the plain functions that other screens call outside React. */
export const lastList = () => last ?? [];

// ---------- derived facts
export interface Prog { total: number; done: number; failed: number; waiting: number; writing: number; skipped: number; stopped: number }
export function progress(d: Deployment): Prog {
  const p: Prog = { total: d.writes.length + (d.more ?? 0), done: 0, failed: 0, waiting: 0, writing: 0, skipped: 0, stopped: 0 };
  const add = (s: WState, n = 1) => { if (s === 'done') p.done += n; else if (s === 'failed' || s === 'policy') p.failed += n; else if (s === 'skipped') p.skipped += n; else if (s === 'stopped') p.stopped += n; else if (s === 'writing' || s === 'retrying') p.writing += n; else p.waiting += n; };
  d.writes.forEach(w => add(w.state)); if (d.more) add(d.moreState ?? 'done', d.more);
  return p;
}
/** Not replaced by a Retry and not delivered by a later Version: this is where the Environment stands. */
export const isCurrent = (d: Deployment) => !d.retried && !d.resolved;
export const isFailed = (d: Deployment) => (d.state === 'failed' || d.state === 'stopped') && isCurrent(d);
export const isRunning = (d: Deployment) => d.state === 'running' || d.state === 'queued';
export const stepsOf = (d: Deployment) => Math.max(1, ...d.writes.map(w => w.step), ...(d.prs ?? []).map(p => p.step));
export const openPr = (d: Deployment) => d.prs?.find(p => p.state === 'open' || p.state === 'merged');
export const latestV = (l: Deployment[]) => Math.max(1288, ...l.map(d => d.v ?? 0));
const single = (d: Deployment) => d.v === null || d.start === 'catchup' || d.start === 'overwrite' || d.start === 'auto';
const family = (d: Deployment, l: Deployment[]): string => { const o = d.retryOf ? l.find(x => x.id === d.retryOf) : undefined; return o ? family(o, l) : `${d.session ? 's' : 'v'}${d.v}`; };
/** The Deployments of one Commit: one per Environment (the current one), for the tabs of the Deployment view. */
export function groupOf(l: Deployment[], d: Deployment): Deployment[] {
  if (single(d)) return [d];
  const k = family(d, l); const same = l.filter(x => !single(x) && family(x, l) === k);
  return (['prod', 'nonprod', 'sandbox'] as EnvId[]).map(e => (d.env === e ? d : same.find(x => x.env === e && isCurrent(x)) ?? same.find(x => x.env === e))).filter((x): x is Deployment => !!x);
}
export function zoneStates(l: Deployment[]): Record<string, 'pending' | 'failed'> {
  const out: Record<string, 'pending' | 'failed'> = {};
  for (const d of l) {
    if (!isCurrent(d) || !(isRunning(d) || isFailed(d) || d.writes.some(w => w.state === 'skipped'))) continue;
    for (const w of d.writes) {
      if (w.state === 'done' || w.state === 'stopped' && d.state === 'superseded') continue;
      const isBad = w.state === 'failed' || w.state === 'policy' || w.wait === 'failed';
      if (isBad) out[w.zone] = 'failed'; else if (!out[w.zone] && (isRunning(d) || isFailed(d) || w.state === 'skipped')) out[w.zone] = 'pending';
    }
  }
  return out;
}
export const MODULES = (pattern: string) => [...new Map(zones.filter(z => z.env === 'nonprod').map(z => [moduleOf(z.id, pattern), z.sub])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([m, sub]) => ({ m, sub, zones: zones.filter(z => z.env === 'nonprod' && z.sub === sub).length }));
export const HAND_EDIT = { sub: 'sub-nonprod-07', commit: '9f3a2c1', by: 'j.doe', ago: '2 h ago', lines: 3 };
