// PROTOTYPE, throwaway. Issue 36: mock Version history. The newest Versions carry their content, so Revert and Restore can build
// real Change sets from it; older ones are generic. The current mock Rule base is the state of Version 1290.
// Issue 37 added 1289 and 1290 in front, so the Deployment views have a failed and a running Deployment; issue 36's numbers moved up by two.
import type { Store } from './store';
import { entries, isFolder, rules, Rule, FolderRow } from './data';

export type VKind = 'normal' | 'emergency' | 'scheduled' | 'expiry' | 'folders' | 'retranslation' | 'restore' | 'revert';
export type Dep = 'ok' | 'failed' | 'running' | 'none';
export type Step = (s: Store) => void;
export interface VersionRow {
  n: number; name: string; by: string; at: string; kind: VKind; deploy: [Dep, Dep, Dep]; rules: { id: string; what: string }[]; folders: string[];
  approvals: string[]; note?: string; reason?: string; emergencyOpen?: boolean; noRevert?: string; conflict?: string; revert?: Step[]; session?: boolean;
}

export const fid = (name: string) => (entries.find(e => isFolder(e) && e.name === name) as FolderRow | undefined)?.id ?? '';
const size = (id: string) => entries.filter(e => !isFolder(e) && (e as Rule).folder === id).length;
// Set the base Version's content without an edit, then edit back: the Rule base of the prototype is Version 1288 already.
const withBase = (patches: [string, Partial<Rule>][]): Step => s => s.rebaseOnto(s.version, es => es.map(e => { const p = patches.find(x => x[0] === e.id); return p ? { ...e, ...p[1] } : e; }), e => e, true,
  patches.map(([id, p]) => ({ ...rules.find(r => r.id === id)!, ...p })));
const exp3 = rules.filter(r => r.action === 'allow' && r.expiry).slice(8, 11);
const rel = rules.slice(40, 43);
// A run of Rules outside every Folder: the 12 former Rules of "Old DMZ" that still stand together.
const loose = (() => { const out: string[] = []; for (const e of entries) { if (isFolder(e) || (e as Rule).folder) { if (out.length >= 12) break; out.length = 0; continue; } out.push(e.id); if (out.length >= 12) break; } return out; })();
const mon = fid('Monitoring and backup');

export const VERSIONS: VersionRow[] = [
  { n: 1290, name: 'CHG-5131 Reporting database access', by: 'jo', at: 'today 10:01', kind: 'normal', deploy: ['running', 'running', 'none'], rules: [{ id: '', what: 'Added 2 Rules to app0042-db, changed 1 Rule' }], folders: [],
    approvals: ['Production: approved by kim and alex (four-eyes)', 'Non-production: approved by kim'], noRevert: 'Prototype: this Version carries no content. Issue 37 added it for its Deployment views.' },
  { n: 1289, name: 'CHG-5118 Partner API for app0042', by: 'kim', at: 'today 09:12', kind: 'normal', deploy: ['failed', 'ok', 'none'], rules: [{ id: '', what: 'Added the Rule “Partner API to web”, changed “API from web”' }], folders: [],
    approvals: ['Production: approved by jo and alex (four-eyes)', 'Non-production: approved by jo'], noRevert: 'Prototype: this Version carries no content. Issue 37 added it for its Deployment views.' },
  { n: 1288, name: 'Folder cleanup', by: 'jo', at: 'yesterday 17:40', kind: 'folders', deploy: ['none', 'none', 'none'], rules: [],
    folders: [`Created the Folder “Partner access” around its ${size(fid('Partner access'))} Rules`, 'Renamed the Folder “Legacy” to “Legacy, to review”'], approvals: [],
    note: 'Only Folder edits: no Approval and no Deployment. Any editor committed it.',
    revert: [s => s.deleteFolder(fid('Partner access')), s => s.renameFolder(fid('Legacy, to review'), 'Legacy')] },
  { n: 1287, name: 'Hotfix: block ext-partner-0339', by: 'sam', at: 'yesterday 09:41', kind: 'emergency', deploy: ['ok', 'running', 'ok'], rules: [{ id: 'R90001', what: 'Source: added ext-partner-0339' }], folders: [],
    approvals: ['Emergency Commit: Approval afterwards still open'], emergencyOpen: true, reason: 'Active scan from a partner network against the web tier, INC-2211',
    revert: [withBase([['R90001', { src: ['n3', 'n339'] }]]), s => s.editField('R90001', 'src', ['n3'])] },
  { n: 1286, name: 'Disable expired allow Rules', by: 'nsgfw', at: '2026-11-08 00:05', kind: 'expiry', deploy: ['ok', 'ok', 'none'], rules: exp3.map(r => ({ id: r.id, what: `Turned off, expired ${r.expiry}` })), folders: [],
    approvals: ['No Approval: turning off an allow Rule never opens traffic'],
    revert: [withBase(exp3.map(r => [r.id, { enabled: false }])), s => s.setEnabled(exp3.map(r => r.id), true)] },
  { n: 1285, name: 'Release app0041', by: 'alex', at: '2026-11-07 22:00 (scheduled)', kind: 'scheduled', deploy: ['failed', 'ok', 'none'], rules: rel.map(r => ({ id: r.id, what: 'Added' })), folders: [],
    approvals: ['kim: Production, four-eyes', 'jo: Non-production, approver'], revert: [s => s.remove(rel.map(r => r.id))] },
  { n: 1284, name: 'Move the Folder “Monitoring and backup”', by: 'kim', at: '2026-11-07 11:15', kind: 'normal', deploy: ['ok', 'ok', 'ok'], rules: [{ id: '', what: `${size(mon)} Rules moved with their Folder` }],
    folders: [`Moved “Monitoring and backup” with its ${size(mon)} Rules above “Identity and directory”`], approvals: ['jo: Production, four-eyes', 'jo: Non-production, approver'],
    revert: [s => s.move([mon], fid('Identity and directory'), 'after')] },
  { n: 1283, name: 'Re-translation for engine 1.5.2', by: 'nsgfw', at: '2026-11-06 07:30', kind: 'retranslation', deploy: ['ok', 'ok', 'ok'], rules: [], folders: [],
    approvals: ['kim: Production, four-eyes', 'jo: Non-production, approver'], note: 'No edits: only the new output of engine 1.5.2.', noRevert: 'A Re-translation holds no edits, so there is nothing to revert.' },
  { n: 1282, name: 'Restore to Version 1279', by: 'jo', at: '2026-11-05 18:02', kind: 'restore', deploy: ['ok', 'ok', 'none'], rules: [{ id: rules[60].id, what: 'Back to Version 1279: comment' }, { id: rules[61].id, what: 'Back to Version 1279: service' }], folders: [],
    approvals: ['kim: Production, four-eyes'], revert: [s => s.editField(rules[60].id, 'comment', 'Release 24.2'), s => s.editField(rules[61].id, 'comment', 'Monitoring agents')] },
  { n: 1281, name: 'Remove the Folder “Old DMZ”', by: 'kim', at: '2026-11-05 10:20', kind: 'folders', deploy: ['none', 'none', 'none'], rules: [], folders: ['Removed the Folder “Old DMZ”; its 14 Rules stayed in place'], approvals: [],
    note: 'Only Folder edits: no Approval and no Deployment.', conflict: 'The Folder “Old DMZ” cannot come back as it was: its former Rules no longer stand together. Two of them moved into “Partner access” in Version 1288.',
    revert: [s => s.newFolder('Old DMZ', loose)] },
];
const people = ['kim', 'sam', 'jo', 'alex'];
const titles = ['Release app0', 'Partner access for ', 'Monitoring agents in ', 'Onboard vnet-app0', 'Tighten egress of ', 'Cleanup of '];
const day = (n: number) => { const d = new Date(Date.UTC(2026, 10, 4) - Math.floor((1280 - n) / 2) * 86400000); return d.toISOString().slice(0, 10); };
for (let n = 1280; n > 1180; n--) VERSIONS.push({ n, name: `${titles[n % titles.length]}${String(n % 97).padStart(3, '0')}`, by: people[n % 4], at: day(n),
  kind: n % 17 === 0 ? 'scheduled' : n % 29 === 0 ? 'emergency' : 'normal', deploy: ['ok', n % 13 === 0 ? 'failed' : 'ok', n % 3 ? 'none' : 'ok'], rules: [{ id: rules[n % 900].id, what: 'Edited' }], folders: [],
  approvals: ['jo: Production, four-eyes'], revert: [s => s.editField(rules[n % 900].id, 'comment', `Reverted from Version ${n}`)] });

export const byN = (n: number) => VERSIONS.find(v => v.n === n);
// A Restore to Version N undoes every newer Version that carries edits, newest first.
// A Restore never conflicts: it brings back the Folders of its Version, so "Old DMZ" returns around the Rules that still stand together.
export const restoreSteps = (n: number): Step[] => VERSIONS.filter(v => v.n > n && v.revert).flatMap(v => v.revert!);
export const restoreFolders = (n: number) => VERSIONS.filter(v => v.n > n && v.folders.length).map(v => `Version ${v.n}: ${v.folders.join('; ')}`);
