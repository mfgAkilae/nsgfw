// PROTOTYPE, throwaway. Issue 43: Change set management. The description and ticket reference, several Change sets of one person
// with one current, co-editors, the hand-over, and Change sets of the tool that a person takes over or dismisses.
// The main store holds the current Change set; the others wait here as snapshots.
import { useSyncExternalStore } from 'react';
import type { Snapshot } from './store';
import { principalById } from './access';

export interface Mine { id: string; description: string; ticket: string; owner: string; coeditors: string[]; opened: string; snap?: Snapshot;
  discarded?: { by: string; at: string }; handedAt?: string }
export interface ToolSet { id: string; title: string; cause: string; state: 'Open' | 'Submitted'; flag?: 'rejected' | 'conflict'; note?: string;
  zones: string[]; env: string; level: string; edits: number; base: number; owner?: string; dismissed?: { by: string; at: string; reason: string } }
export interface Cs43 { current: string; mine: Mine[]; tool: ToolSet[]; next: number }

const initial: Cs43 = {
  current: 'CHG-5120', next: 5131,
  mine: [
    { id: 'CHG-5120', description: 'Release app0042', ticket: 'RFC-2291', owner: 'you', coeditors: ['alex'], opened: 'today 08:40' },
    { id: 'CHG-5109', description: 'Test: open 8080 to app0042', ticket: '', owner: 'you', coeditors: [], opened: 'yesterday 15:02', discarded: { by: 'you', at: 'yesterday 17:20' } },
  ],
  tool: [
    { id: 'CHG-5125', title: 'Adopt member changes of External ASG object aks-prod-nodes', cause: '3 network interfaces joined the Unmanaged ASG aks-prod-nodes in Azure.',
      state: 'Submitted', zones: ['app0042-aks'], env: 'Production', level: 'four-eyes', edits: 1, base: 1290 },
    { id: 'CHG-5119', title: 'Disable the expired deny Rule “Block legacy SMB”', cause: 'Rule 90412 expired at the end of 2026-11-11.', state: 'Open', flag: 'rejected',
      note: 'kim rejected it: “Keep it until the file server migration ends.”', zones: ['app0311-files', 'app0311-app'], env: 'Non-production', level: 'approver', edits: 1, base: 1288 },
    { id: 'CHG-5128', title: 'Adopt the new prefix of subnet app0311-app', cause: 'Subnet app0311-app grew from 10.77.198.0/26 to 10.77.198.0/25 in Azure.', state: 'Submitted', flag: 'conflict',
      note: 'The Rebase onto Version 1290 left a conflict on the Zone app0311-app.', zones: ['app0311-app'], env: 'Production', level: 'four-eyes', edits: 1, base: 1289 },
  ],
};
let state: Cs43 = initial;
const subs = new Set<() => void>();
export const getCs = () => state;
export const setCs = (p: Partial<Cs43>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const useCs = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, getCs);
export const patchMine = (id: string, p: Partial<Mine>) => setCs({ mine: state.mine.map(m => (m.id === id ? { ...m, ...p } : m)) });
export const patchTool = (id: string, p: Partial<ToolSet>) => setCs({ tool: state.tool.map(m => (m.id === id ? { ...m, ...p } : m)) });
export const curMeta = (c: Cs43 = state) => c.mine.find(m => m.id === c.current)!;
export const nameOf = (m: Mine) => (m.description.trim() ? `${m.id} ${m.description.trim()}` : m.id);
export const who = (id: string) => (id === 'you' ? 'you' : principalById.get(id)?.name ?? id);
export const initialsOf = (id: string) => (id === 'you' ? 'YO' : id === 'nsgfw' ? 'NS' : (principalById.get(id)?.name ?? id).split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase());
// The Change sets of the person that can still change: theirs as owner or co-editor, not discarded.
export const openMine = (c: Cs43 = state) => c.mine.filter(m => !m.discarded && (m.owner === 'you' || m.coeditors.includes('you')));
