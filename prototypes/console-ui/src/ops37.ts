// PROTOTYPE, throwaway. Issue 37 (Deployment, Drift and Import views): the scenario switches that the flask sets,
// and a small navigation bus so that inbox rows, banners and links in the new views can open a page of the console.
import { useSyncExternalStore } from 'react';

export interface Ops37 {
  policyOnWrite: boolean;   // Production: a write of the running Deployment comes back changed by Azure Policy
  liveRun: boolean;         // the running Deployment advances live: writes finish, a Settle time counts down
  tfApplyPolicy: boolean;   // Non-production: the merge commit's check failed with RequestDisallowedByPolicy
  tfOpenEmergency: boolean; // Non-production: the pull request of Emergency Commit 1287 stays open
  tfNotApplied: boolean;    // Non-production: merged, but Azure did not show the target within the apply timeout
  portalDrift: boolean;     // someone adds an NSG rule in the Azure portal: high Drift
  autoOverwriteLoop: boolean; // automatic Overwrite stopped because the same writer keeps removing an association
  snapshotChanged: boolean; // the legacy NSG of a subnet in the onboarding changes in Azure after the Import snapshot
  handEdit: boolean;        // a Data contract file was edited by hand in the Terraform repository
}
const initial: Ops37 = { policyOnWrite: false, liveRun: true, tfApplyPolicy: false, tfOpenEmergency: true, tfNotApplied: false, portalDrift: false, autoOverwriteLoop: false, snapshotChanged: false, handEdit: true };
let state: Ops37 = initial;
const subs = new Set<() => void>();
export const getOps = () => state;
export const setOps = (p: Partial<Ops37>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const resetOps = () => setOps(initial);
export const useOps = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, getOps);

// Navigation from anywhere (inbox rows, banners, links inside the new views). Console.tsx listens.
export type Go37 =
  | { to: 'deployments'; tab?: 'deployments' | 'drift'; env?: string }
  | { to: 'deployment'; id: string }            // the Deployment view of one Deployment id (see deploydata.ts)
  | { to: 'drift'; id?: string; env?: string }  // the Drift tab, optionally one Drift item selected
  | { to: 'onboard'; candidates: string[] }     // the wide onboarding screen for these candidate ids
  | { to: 'env'; env: string }                  // Admin > Environments > one Environment (settings live there, issue 38)
  | { to: 'audit' }                             // Admin > Audit log
  | { to: 'rule'; id: string } | { to: 'zone'; id: string } | { to: 'versions'; n?: number };
export const navBus = new EventTarget();
export const go37 = (g: Go37) => navBus.dispatchEvent(new CustomEvent('go', { detail: g }));
