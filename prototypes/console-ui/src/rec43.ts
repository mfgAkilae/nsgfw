// PROTOTYPE, throwaway. Issue 43: Recovery mode (ADR 0019). Mock state and the differences between the database and Azure.
// A module-level store like ops37, so the band, the rail, Health and the sign-in gate all read the same mode.
import { useSyncExternalStore } from 'react';

export type Trigger = 'marker' | 'version' | 'identity' | 'manual';
export type Group = 'changed' | 'unknown' | 'missing';
export type How = 'overwrite' | 'recreate' | 'adopt' | 'onboard' | 'confirm' | 'leave';
export interface Resolution { how: How; at: string; cs?: string }
export interface Rec {
  on: boolean; trigger: Trigger; since: string; by?: string; reason?: string;
  identity: null | 'move' | 'copy';                  // only for the trigger 'identity'
  handover: Record<string, string>;                   // Environment id -> time of the confirmed Handover (after a Copy)
  res: Record<string, Resolution>;                    // difference id -> how it was resolved
  ended?: { reason: string; at: string; open: number };
}

// The facts the screen states. The database was recovered to 03:00; Azure carries Version tags up to 1297.
export const FACTS = {
  dbVersion: 1290, azureVersion: 1297, restorePoint: '2026-11-12 03:00', markerAt: '07:58', since: '08:02',
  sessionsEnded: 14, cleared: [{ cs: 'CHG-5117 Partner VPN access', what: 'scheduled for today 22:00', authors: 'sam, jo' }, { cs: 'CHG-5122 DMZ cleanup', what: 'queued behind the Re-translation', authors: 'alex' }],
  expired: 3, stopped: { version: 1290, env: 'Production', writes: '10 of 14 writes done, 2 in flight finished, 2 not started' },
  ids: { rule: 105_298, zone: 30_412, object: 21_877, version: 11_298 },
  audit: { seq: '1,284,212', restoredLast: '1,283,977', hash: 'a41f…9c02' },
  recorded: { tool: '3f2a8c1e-…-77d0', app: '9c1e4b2a-…-1f3b' }, running: { tool: 'b81d03f4-…-2ae6', app: '9c1e4b2a-…-1f3b' },
};

export interface Diff {
  id: string; group: Group; env: 'prod' | 'nonprod' | 'sandbox'; kind: 'Managed NSG' | 'Managed ASG'; resource: string; zone: string;
  title: string; tag: number | null; why: string;
  rows?: [string, string, string][];                 // what, database, Azure
  overwrite?: { opens?: string[]; closes?: string[]; none?: string };
  adopt?: string | false; adoptNo?: string;          // what an Adopt prepares, or why it cannot
  lost?: string;                                      // what the audit export shows about lost Rules
}

export const diffs: Diff[] = [
  { id: 'c1', group: 'changed', env: 'prod', kind: 'Managed NSG', resource: 'nsg-app0042-wes-web', zone: 'app0042-web', tag: 1294,
    title: '2 NSG rules differ', why: 'Version 1294 wrote them. The database ends at Version 1290.',
    rows: [['nsgfw-r90011-in-1', 'TCP 443 from app0042-ingress', 'TCP 443, 8443 from app0042-ingress'], ['nsgfw-r95120-in-1', 'not there', 'allow TCP 5432 from app0042-api, priority 1240']],
    overwrite: { closes: ['app0042-ingress → app0042-web TCP 8443', 'app0042-api → app0042-web TCP 5432'] },
    adopt: false, adoptNo: 'It holds an NSG rule of Rule 95120, which the database does not know. The tool does not rebuild lost Rules from NSG rules.',
    lost: 'Rule 95120 “Allow app0042-api to web on 5432”, created by kim in Version 1293.' },
  { id: 'c2', group: 'changed', env: 'prod', kind: 'Managed NSG', resource: 'nsg-app0042-wes-db', zone: 'app0042-db', tag: 1293,
    title: 'Only priorities differ', why: 'Version 1293 moved two Rules. The traffic is the same either way.',
    rows: [['nsgfw-r90021-in-1', 'priority 1210', 'priority 1230'], ['nsgfw-r90022-in-1', 'priority 1220', 'priority 1210']],
    overwrite: { none: 'No flow opens or closes. Two priorities change back.' },
    adopt: 'A Change set that moves Rule 90022 above Rule 90021, as Azure has them. It needs the Approval of app0042-db (four-eyes).' },
  { id: 'c3', group: 'changed', env: 'prod', kind: 'Managed ASG', resource: 'asg-webservers-app0042-wes', zone: 'app0042-web', tag: 1295,
    title: '2 members more in Azure', why: 'Version 1295 added two network interfaces to the ASG object webservers-app0042.',
    rows: [['vm-app0042-web-04-nic1', 'not a member', 'member'], ['vm-app0042-web-05-nic1', 'not a member', 'member']],
    overwrite: { closes: ['Every Rule with webservers-app0042 stops matching vm-app0042-web-04 and -05 (6 Rules)'] },
    adopt: 'A Change set that adds both network interfaces to the ASG object webservers-app0042. It needs the Approval of app0042-web (four-eyes).' },
  { id: 'c4', group: 'changed', env: 'nonprod', kind: 'Managed NSG', resource: 'nsg-app0614-ger-api', zone: 'app0614-api', tag: 1296,
    title: '1 NSG rule differs', why: 'Version 1296 changed it. Root module tf-nonprod-ger.',
    rows: [['nsgfw-r93310-out-1', 'TCP 443 to app0614-db', 'TCP 443, 1433 to app0614-db']],
    adopt: 'A Change set that adds TCP 1433 to Rule 93310. It needs the Approval of app0614-api (approver).' },
  { id: 'c5', group: 'changed', env: 'sandbox', kind: 'Managed NSG', resource: 'nsg-app0950-ger-db', zone: 'app0950-db', tag: 1288,
    title: 'An NSG rule added by hand', why: 'Not from a lost Version: the tag says 1288. m.ray added it in the Azure portal at 06:12. Ordinary Drift, found during the recovery.',
    rows: [['allow-debug-3306', 'not there', 'allow TCP 3306 from any, priority 200']],
    overwrite: { closes: ['any → app0950-db TCP 3306'] },
    adopt: 'A Change set with a new Rule for TCP 3306 from any to app0950-db. Sandbox needs no Approval.' },
  { id: 'u1', group: 'unknown', env: 'prod', kind: 'Managed NSG', resource: 'nsg-app0731-wes-web', zone: 'subnet app0731-web', tag: 1292,
    title: 'A Zone the database does not know', why: 'Tagged with this Instance and Version 1292: the onboarding of app0731-web happened after the restore point.',
    rows: [['NSG rules', 'none', '14 NSG rules of Rules 95201 to 95214'], ['Subnet', 'not a Zone', 'vnet-app0731-wes/app0731-web']],
    lost: 'Rules 95201 to 95214, onboarded by alex in Change set CHG-5124, Version 1292.' },
  { id: 'u2', group: 'unknown', env: 'prod', kind: 'Managed ASG', resource: 'asg-app0731-db-wes', zone: 'subnet app0731-db', tag: 1292,
    title: 'A Managed ASG the database does not know', why: 'Version 1292 created it for the ASG object app0731-db. Three NSG rules of nsg-app0731-wes-web use it.',
    rows: [['Members', 'none', '3 network interfaces of vm-app0731-db-01 to -03']],
    lost: 'ASG object app0731-db (Object 21412), created by alex in Version 1292.' },
  { id: 'u3', group: 'unknown', env: 'nonprod', kind: 'Managed NSG', resource: 'nsg-app0802-ger-etl', zone: 'subnet app0802-etl', tag: 1297,
    title: 'A Zone the database does not know', why: 'Tagged with this Instance and Version 1297, the newest in Azure. Root module tf-nonprod-ger.',
    rows: [['NSG rules', 'none', '6 NSG rules of Rules 95290 to 95295']],
    lost: 'Rules 95290 to 95295, onboarded by sam in Version 1297.' },
  { id: 'm1', group: 'missing', env: 'prod', kind: 'Managed ASG', resource: 'asg-batch-app0042-wes', zone: 'app0042-batch', tag: null,
    title: 'Missing in Azure', why: 'The database has it with 4 members. Version 1296 removed the ASG object batch-app0042 after the restore point.',
    rows: [['Resource', 'exists, 4 members', 'not found']],
    overwrite: { opens: ['2 Rules with batch-app0042 match its 4 network interfaces again'] },
    adopt: 'A Change set that removes the ASG object batch-app0042 from its 2 Rules. It needs the Approval of app0042-batch (four-eyes).' },
  { id: 'm2', group: 'missing', env: 'sandbox', kind: 'Managed NSG', resource: 'nsg-app0950-ger-api', zone: 'app0950-api', tag: null,
    title: 'Missing in Azure, the subnet has no NSG', why: 'Deleted by aa-sandbox-cleanup at 05:40. Only the Azure default rules filter the subnet now.',
    rows: [['Resource', 'exists, 9 NSG rules', 'not found'], ['Subnet association', 'nsg-app0950-ger-api', 'none']],
    overwrite: { closes: ['Everything the Azure default rules allow and no Rule allows, on app0950-api'] },
    adopt: false, adoptNo: 'Accepting a missing Managed NSG means removing the Zone. That is its own step: Remove the Zone, which goes into a Change set and waits until the mode ends.' },
  { id: 'm3', group: 'missing', env: 'nonprod', kind: 'Managed NSG', resource: 'nsg-app0614-ger-web', zone: 'app0614-web', tag: null,
    title: 'Missing in Azure', why: 'Version 1296 removed the Zone app0614-web. The database still has it. Root module tf-nonprod-ger.',
    rows: [['Resource', 'exists, 11 NSG rules', 'not found']],
    adopt: 'A Change set that removes the Zone app0614-web. It needs the Approval of app0614-web (approver).' },
];
export const groups: [Group, string, string][] = [
  ['changed', 'Changed in Azure', 'Known resources whose content differs from the database'],
  ['unknown', 'Unknown to the database', 'Managed NSGs and ASGs of this Instance that the database does not hold'],
  ['missing', 'Missing in Azure', 'Resources the database holds that Azure does not have'],
];
export const envName: Record<string, string> = { prod: 'Production', nonprod: 'Non-production', sandbox: 'Sandbox' };
export const envMode: Record<string, 'ARM' | 'Terraform'> = { prod: 'ARM', nonprod: 'Terraform', sandbox: 'ARM' };
// After a Copy, the Zones of each Environment carry the old Instance ID until a Handover is confirmed.
export const copyEnvs = [{ id: 'prod', zones: 412, resources: 431 }, { id: 'nonprod', zones: 96, resources: 102 }, { id: 'sandbox', zones: 18, resources: 18 }];

const off: Rec = { on: false, trigger: 'marker', since: FACTS.since, identity: null, handover: {}, res: {} };
let state: Rec = off;
const subs = new Set<() => void>();
export const getRec = () => state;
export const setRec = (p: Partial<Rec>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const useRec = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, getRec);
export const startRec = (trigger: Trigger, extra: Partial<Rec> = {}) => setRec({ ...off, on: true, trigger, ...extra });
export const resolve = (id: string, r: Resolution) => setRec({ res: { ...state.res, [id]: r } });
export const unresolve = (id: string) => { const n = { ...state.res }; delete n[id]; setRec({ res: n }); };
// The differences this trigger finds. A copy or a manual start finds only the Drift that happens to exist.
export const diffsFor = (r: Rec) => (r.trigger === 'identity' || r.trigger === 'manual' ? diffs.filter(d => d.id === 'c5' || d.id === 'm2') : diffs);
export const openCount = (r: Rec) => diffsFor(r).filter(d => !r.res[d.id] || r.res[d.id].how === 'leave').length;
// A Terraform Environment gets pull requests again only when every difference in its root module is adopted or confirmed (ADR 0019).
export const tfBlocked = (r: Rec) => diffsFor(r).filter(d => envMode[d.env] === 'Terraform' && !['adopt', 'confirm', 'onboard'].includes(r.res[d.id]?.how ?? '')).length;
// Until Move or Copy is chosen, the Instance ID is unsettled and nothing can be resolved.
export const locked = (r: Rec) => r.trigger === 'identity' && !r.identity;
