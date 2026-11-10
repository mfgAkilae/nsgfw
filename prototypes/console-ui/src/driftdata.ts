import { zones, zoneById } from './data';
// PROTOTYPE, throwaway. Issue 37: the mock Drift items of the Drift tab, one or more of every kind in the per-kind table:
// NSG rules, marker tags, a deleted Managed NSG, lost subnet associations, Managed ASG membership, and the Azure inventory changes.
// Names are the actual ones of the mock world (data.ts): nsg-app0042-wes-web is the Managed NSG of app0042-web.
// Polling reads Resource Graph every 5 minutes, last at 10:40; Non-production polls nothing since 2026-11-09 06:00 (Health, issue 38),
// so its items come from the daily reconcile at 02:00.

export type Sev = 'high' | 'medium' | 'low';
export type DState = 'open' | 'adopt' | 'overwriting' | 'resolved';
export type DKind = 'rule-add' | 'rule-chg' | 'rule-del' | 'tag' | 'nsg-del' | 'assoc' | 'member' | 'prefix' | 'space' | 'memberip' | 'memberdel' | 'extasg' | 'objauto';
export interface Fx { dir: 'opens' | 'closes'; text: string }
export interface Actor { who: string; via: string; changedBy: string; clientType: string; op: string; caller: string; corr: string; at: string }
export interface DriftItem {
  id: string; env: string; sev: Sev; kind: DKind;
  res: string; resKind: string;          // the resource as Azure names it, and what it is
  zones: string[]; vnet: string;         // Zone ids; a VNet item has no Zone of its own
  what: string;                          // the change in a few words
  actor: Actor;
  found: { by: 'poll' | 'reconcile'; at: string; ago: string };
  diff: [string, string, string][];      // field, Deployed state, Azure
  fx: Fx[];                              // empty: no effect on traffic
  why?: string;                          // when the severity needs more than the effect
  overwrite?: 'Overwrite' | 'Re-create' | 'Re-associate';
  adopt?: { what: string; fx: 'opens' | 'closes' | 'none' };
  noAdopt?: string;                      // an NSG rule the Import mapping cannot turn into a Rule edit
  overwriteOnly?: string;
  inventory?: boolean;                   // Adopt only (ADR 0020): the Zones show "Azure differs, Adopt open"
  removeZone?: boolean;
  root?: string;                         // Terraform root module
  rule?: string;                         // the Rule behind an nsgfw- NSG rule
  scope?: 'vnet';                        // the editor Role is checked on the VNet (Managed ASG), else on the Zone
  state: DState; cs?: string; adoptBy?: string;
  auto?: string;                         // resolved by the tool: what it did
  loop?: boolean;
  inbox?: string;
}

const op = { rule: 'Microsoft.Network/networkSecurityGroups/securityRules/write', ruleDel: 'Microsoft.Network/networkSecurityGroups/securityRules/delete', nic: 'Microsoft.Network/networkInterfaces/write', subnet: 'Microsoft.Network/virtualNetworks/subnets/write' };
const added = (name: string, prio: string, access: string, src: string, dst: string, port: string): [string, string, string][] =>
  [['NSG rule', '—', name], ['Priority', '—', prio], ['Direction', '—', 'Inbound'], ['Access', '—', access], ['Source', '—', src], ['Destination', '—', dst], ['Port', '—', port]];

/** ops.portalDrift: someone adds an NSG rule in the Azure portal. */
export const PORTAL: DriftItem = {
  id: 'dr-portal', env: 'prod', sev: 'high', kind: 'rule-add', res: 'nsg-app0042-wes-web', resKind: 'Managed NSG', zones: ['z0042-web'], vnet: 'vnet-app0042-wes',
  what: 'NSG rule added: allow-any-3389, priority 100, inbound',
  actor: { who: 'j.doe', via: 'Azure portal', changedBy: 'j.doe@example.org', clientType: 'Azure portal', op: op.rule, caller: 'j.doe@example.org', corr: '3c9f1e52-7a4d-4b0e-9f31-6d2a8c0b7e14', at: '10:38' },
  found: { by: 'poll', at: '10:40', ago: 'just now' },
  diff: added('allow-any-3389', '100', 'Allow', 'Internet', 'any', 'TCP 3389'),
  fx: [{ dir: 'opens', text: 'Internet → app0042-web, TCP 3389' }],
  overwrite: 'Overwrite', adopt: { what: 'A new Rule “allow-any-3389” from the NSG rule, placed by the constraint merge.', fx: 'opens' },
  state: 'open', inbox: 'High Drift on nsg-app0042-wes-web: an NSG rule added in the Azure portal opens tcp/3389 from the Internet.',
};

/** ops.autoOverwriteLoop: automatic Overwrite in Sandbox stopped, because the same writer keeps removing the association. */
export const LOOP: DriftItem = {
  id: 'dr-loop', env: 'sandbox', sev: 'high', kind: 'assoc', res: 'vnet-app0921-wes/app0921-web', resKind: 'Subnet association', zones: ['z0921-web'], vnet: 'vnet-app0921-wes',
  what: 'Association removed again: automatic Overwrite stopped',
  actor: { who: 'svc-legacy-deploy', via: 'ARM template deployment', changedBy: 'svc-legacy-deploy (service principal)', clientType: 'ARM template deployment', op: 'Microsoft.Network/virtualNetworks/write', caller: 'svc-legacy-deploy', corr: 'b81d07c3-2e6f-4a95-8c1a-f0e4d9a6b352', at: '09:40' },
  found: { by: 'poll', at: '09:40', ago: '1 h ago' },
  diff: [['NSG', 'nsg-app0921-wes-web', '—']],
  fx: [{ dir: 'opens', text: 'What the Azure default rules allow into app0921-web: VirtualNetwork, AzureLoadBalancer' }],
  overwrite: 'Re-associate', removeZone: true, loop: true, state: 'open',
  inbox: 'Automatic Overwrite stopped in Sandbox: svc-legacy-deploy keeps removing the association of app0921-web.',
};

export const SEED: DriftItem[] = [
  // ---------- Production (ARM)
  { id: 'dr-01', env: 'prod', sev: 'high', kind: 'rule-add', res: 'nsg-app0117-wes-jump', resKind: 'Managed NSG', zones: ['z0117-jump'], vnet: 'vnet-app0117-wes',
    what: 'NSG rule added: allow-rdp-temp, priority 310, inbound',
    actor: { who: 'j.doe', via: 'Azure portal', changedBy: 'j.doe@example.org', clientType: 'Azure portal', op: op.rule, caller: 'j.doe@example.org', corr: '9a2c6f10-4b3e-47d8-a1f5-2e8b7c0d9f63', at: '10:27' },
    found: { by: 'poll', at: '10:30', ago: '11 min ago' },
    diff: added('allow-rdp-temp', '310', 'Allow', '203.0.113.0/24', '10.29.94.0/26', 'TCP 3389'),
    fx: [{ dir: 'opens', text: '203.0.113.0/24 → app0117-jump, TCP 3389' }],
    overwrite: 'Overwrite', adopt: { what: 'A new Rule “allow-rdp-temp” from the NSG rule, placed by the constraint merge.', fx: 'opens' },
    state: 'open', inbox: 'High Drift on nsg-app0117-wes-jump: an NSG rule added in the Azure portal opens tcp/3389 from 203.0.113.0/24.' },
  { id: 'dr-03', env: 'prod', sev: 'medium', kind: 'rule-del', res: 'nsg-app0042-wes-web', resKind: 'Managed NSG', zones: ['z0042-web'], vnet: 'vnet-app0042-wes', rule: 'R90002',
    what: 'NSG rule deleted: nsgfw-r90002-in-1, priority 1010, inbound',
    actor: { who: 'sp-platform-tf', via: 'Terraform', changedBy: 'sp-platform-tf (service principal)', clientType: 'Terraform', op: op.ruleDel, caller: 'sp-platform-tf', corr: '5e7b2d94-c0a1-4f36-b8e2-7d1c9a4f0b85', at: '10:02' },
    found: { by: 'poll', at: '10:05', ago: '36 min ago' },
    diff: [['NSG rule', 'nsgfw-r90002-in-1', '—'], ['Priority', '1010', '—'], ['Access', 'Allow', '—'], ['Source', 'AzureFrontDoor.Backend', '—'], ['Destination', '10.10.128.0/26', '—'], ['Port', 'TCP 443', '—']],
    fx: [{ dir: 'closes', text: 'AzureFrontDoor.Backend → app0042-web, TCP 443' }],
    overwrite: 'Overwrite', adopt: { what: 'Turns off the Rule “Web tier from Front Door”. It lands only on this NSG, inbound.', fx: 'closes' }, state: 'open' },
  { id: 'dr-04', env: 'prod', sev: 'high', kind: 'rule-chg', res: 'nsg-app0042-wes-db', resKind: 'Managed NSG', zones: ['z0042-db'], vnet: 'vnet-app0042-wes', rule: 'R90004',
    what: 'NSG rule changed: nsgfw-r90004-in-1, port 1433 → 1433-1434',
    actor: { who: 'm.ray', via: 'Azure CLI', changedBy: 'm.ray@example.org', clientType: 'Azure CLI', op: op.rule, caller: 'm.ray@example.org', corr: 'd4f0a8b2-61c7-4e9d-93b5-0a2f6e8c1d47', at: 'yesterday 17:48' },
    found: { by: 'poll', at: 'yesterday 17:50', ago: 'yesterday' },
    diff: [['NSG rule', 'nsgfw-r90004-in-1', 'nsgfw-r90004-in-1'], ['Priority', '1020', '1020'], ['Source', '10.10.131.0/26', '10.10.131.0/26'], ['Port', 'TCP 1433', 'TCP 1433-1434']],
    fx: [{ dir: 'opens', text: 'app0042-api → app0042-db, TCP 1434' }],
    overwrite: 'Overwrite', adopt: { what: 'Adds TCP 1434 to the Rule “DB from API”. It lands only on this NSG, inbound.', fx: 'opens' },
    state: 'adopt', cs: 'CHG-5129', adoptBy: 'alex' },
  { id: 'dr-05', env: 'prod', sev: 'medium', kind: 'rule-chg', res: 'nsg-app0042-wes-batch', resKind: 'Managed NSG', zones: ['z0042-batch'], vnet: 'vnet-app0042-wes', rule: 'R90006',
    what: 'NSG rule changed: nsgfw-r90006-out-1, access Allow → Deny',
    actor: { who: 'k.lee', via: 'Azure portal', changedBy: 'k.lee@example.org', clientType: 'Azure portal', op: op.rule, caller: 'k.lee@example.org', corr: '0b6e3f71-8d2a-4c59-a7e4-3f9d1b5c2a08', at: '08:41' },
    found: { by: 'poll', at: '08:45', ago: '2 h ago' },
    diff: [['NSG rule', 'nsgfw-r90006-out-1', 'nsgfw-r90006-out-1'], ['Direction', 'Outbound', 'Outbound'], ['Access', 'Allow', 'Deny'], ['Destination', 'Storage.WestEurope', 'Storage.WestEurope'], ['Port', 'TCP 443', 'TCP 443']],
    fx: [{ dir: 'closes', text: 'app0042-batch → Storage.WestEurope, TCP 443' }],
    overwrite: 'Overwrite', noAdopt: 'The NSG rule nsgfw-r90006-out-1 belongs to the Rule “Backups to storage”, which also lands on 19 other Managed NSGs. Changing the Rule would change them too.', state: 'open' },
  { id: 'dr-06', env: 'prod', sev: 'medium', kind: 'member', res: 'vm-app0042-web-03-nic1', resKind: 'Managed ASG membership', zones: ['z0042-web'], vnet: 'vnet-app0042-wes', scope: 'vnet',
    what: 'Left the Managed ASG asg-webservers-app0042-wes',
    actor: { who: 'j.doe', via: 'Azure portal', changedBy: 'j.doe@example.org', clientType: 'Azure portal', op: op.nic, caller: 'j.doe@example.org', corr: '7f1a9c35-e2b8-4d60-9c3f-5b0e8a2d7c19', at: '09:58' },
    found: { by: 'poll', at: '10:00', ago: '41 min ago' },
    diff: [['Network interface', 'vm-app0042-web-03-nic1', 'vm-app0042-web-03-nic1'], ['Managed ASGs', 'asg-webservers-app0042-wes', '—']],
    fx: [{ dir: 'closes', text: 'What the Rules with asg-webservers allow for vm-app0042-web-03 (10.10.128.10)' }],
    overwrite: 'Overwrite', adopt: { what: 'Takes vm-app0042-web-03-nic1 out of the ASG object asg-webservers.', fx: 'closes' }, state: 'open' },
  { id: 'dr-07', env: 'prod', sev: 'medium', kind: 'prefix', res: 'vnet-app0311-ger/app0311-app', resKind: 'Subnet prefix', zones: ['z0311-app'], vnet: 'vnet-app0311-ger',
    what: 'Subnet prefix changed: 10.77.198.0/26 → 10.77.198.0/25',
    actor: { who: 'r.stone', via: 'Azure PowerShell', changedBy: 'r.stone@example.org', clientType: 'Azure PowerShell', op: op.subnet, caller: 'r.stone@example.org', corr: 'e93b5a07-1c4f-4d82-b6a0-8f2e7d3c5b91', at: '07:55' },
    found: { by: 'poll', at: '08:00', ago: '3 h ago' },
    diff: [['Address prefix', '10.77.198.0/26', '10.77.198.0/25']],
    fx: [{ dir: 'closes', text: 'The new addresses 10.77.198.64/26 → what the Rules with app0311-app allow' }],
    adopt: { what: 'The Zone app0311-app gets the prefix 10.77.198.0/25. Every Rule that names it then covers the new addresses.', fx: 'opens' }, inventory: true, state: 'open' },
  { id: 'dr-08', env: 'prod', sev: 'low', kind: 'extasg', res: 'asg-aks-0042-nodes', resKind: 'External ASG membership', zones: ['z0042-aks'], vnet: 'vnet-app0042-wes', scope: 'vnet',
    what: '2 network interfaces joined the External ASG',
    actor: { who: 'AKS', via: 'node pool scale-out', changedBy: 'AzureContainerService (first-party app)', clientType: 'Microsoft.ContainerService', op: op.nic, caller: 'aks-resourceprovider', corr: '2c8e4b6a-9f05-4d17-8e3b-c6a1f0d4e927', at: '06:20' },
    found: { by: 'poll', at: '06:25', ago: '4 h ago' },
    diff: [['Members', '3', '5'], ['Joined', '—', 'aks-nodepool1-04-nic, aks-nodepool1-05-nic']],
    fx: [], why: 'Low: no effect on traffic. The NSG rules reference the ASG, so Azure applies its members already.',
    adopt: { what: 'The External ASG object ext-asg-aks-0042-nodes lists the 2 new members, and its Coverage follows.', fx: 'none' }, inventory: true, state: 'open' },
  { id: 'dr-r1', env: 'prod', sev: 'high', kind: 'memberdel', res: 'vm-app0107-web-01-nic1', resKind: 'ASG member', zones: ['z0107-web'], vnet: 'vnet-app0107-ger',
    what: 'ASG member deleted: vm-app0107-web-01',
    actor: { who: 'sp-vm-decom', via: 'Azure CLI', changedBy: 'sp-vm-decom (service principal)', clientType: 'Azure CLI', op: 'Microsoft.Network/networkInterfaces/delete', caller: 'sp-vm-decom', corr: '6a0d3e8f-b4c2-4197-a5d6-1e9f8c2b0a73', at: '2026-11-07 14:02' },
    found: { by: 'poll', at: '2026-11-07 14:05', ago: '3 days ago' },
    diff: [['Network interface', 'vm-app0107-web-01-nic1, 10.26.192.6', 'deleted'], ['ASG object', 'asg-webservers', '—']],
    fx: [{ dir: 'opens', text: 'Whatever gets 10.26.192.6 next, where an NSG holds the address as IP fallback' }], why: 'High: a deleted ASG member.',
    auto: 'Removed the member from the ASG object asg-webservers, deny Rules included. No Approval; audit entry.', inventory: true, state: 'resolved' },
  { id: 'dr-r2', env: 'prod', sev: 'medium', kind: 'memberip', res: 'vm-app0107-web-02-nic1', resKind: 'Member IP on an IP-fallback NSG', zones: ['z0107-web'], vnet: 'vnet-app0107-ger',
    what: 'Member IP changed: 10.26.192.8 → 10.26.192.21',
    actor: { who: 'p.nagy', via: 'Azure portal', changedBy: 'p.nagy@example.org', clientType: 'Azure portal', op: op.nic, caller: 'p.nagy@example.org', corr: 'c5b9e2d0-7a31-4f8c-9e6b-4d0a2f7e1c58', at: '2026-11-06 11:30' },
    found: { by: 'poll', at: '2026-11-06 11:35', ago: '4 days ago' },
    diff: [['Private IP', '10.26.192.8', '10.26.192.21']],
    fx: [{ dir: 'closes', text: '10.26.192.21 → what asg-webservers reaches through NSGs that hold its members as IP fallback' }],
    auto: 'Adopted on its own: the ASG object asg-webservers holds the new address. No Approval; audit entry.', inventory: true, state: 'resolved' },
  { id: 'dr-r3', env: 'prod', sev: 'high', kind: 'objauto', res: 'vm-app0469-etl-07-nic1', resKind: 'Managed ASG membership', zones: ['z0469-etl'], vnet: 'vnet-app0469-nor', scope: 'vnet',
    what: 'Joined the Managed ASG asg-scanners-004-app0469-nor',
    actor: { who: 'sp-scanner-rollout', via: 'Terraform', changedBy: 'sp-scanner-rollout (service principal)', clientType: 'Terraform', op: op.nic, caller: 'sp-scanner-rollout', corr: '1f4c7a9e-3d58-4b20-8a6f-e0b3d5c9a214', at: '2026-11-05 09:10' },
    found: { by: 'poll', at: '2026-11-05 09:10', ago: '5 days ago' },
    diff: [['Managed ASGs', '—', 'asg-scanners-004-app0469-nor']],
    fx: [{ dir: 'opens', text: 'What the Rules with asg-scanners-004 allow, for vm-app0469-etl-07' }],
    auto: 'Adopted on its own: the ASG object asg-scanners-004 is set to “Adopt member changes automatically”. The Approval of that setting covers it.', state: 'resolved' },

  // ---------- Non-production (Terraform): found by the daily reconcile, because polling is off there
  { id: 'dr-11', env: 'nonprod', sev: 'high', kind: 'assoc', res: 'vnet-app0614-ger/app0614-web', resKind: 'Subnet association', zones: ['z0614-web'], vnet: 'vnet-app0614-ger', root: 'sub-nonprod-03',
    what: 'Subnet re-created with the same ID, without its Managed NSG',
    actor: { who: 'sp-app0614-deploy', via: 'Terraform', changedBy: 'sp-app0614-deploy (service principal)', clientType: 'Terraform', op: op.subnet, caller: 'sp-app0614-deploy', corr: '8d2f6b0c-5e19-4a73-b4c8-9a1e3f7d2b06', at: 'yesterday 22:14' },
    found: { by: 'reconcile', at: '02:00', ago: '9 h ago' },
    diff: [['Subnet', 'app0614-web', 'app0614-web, re-created'], ['NSG', 'nsg-app0614-ger-web', '—']],
    fx: [{ dir: 'opens', text: 'What the Azure default rules allow into app0614-web: VirtualNetwork, AzureLoadBalancer' }],
    overwrite: 'Re-associate', removeZone: true, state: 'open',
    inbox: 'High Drift on app0614-web in Non-production: the subnet was re-created without its Managed NSG. Only the Azure default rules filter it now.' },
  { id: 'dr-12', env: 'nonprod', sev: 'medium', kind: 'rule-add', res: 'nsg-app0614-ger-api', resKind: 'Managed NSG', zones: ['z0614-api'], vnet: 'vnet-app0614-ger', root: 'sub-nonprod-03',
    what: 'NSG rule added: deny-maintenance, priority 105, inbound',
    actor: { who: 'b.kraus', via: 'Azure portal', changedBy: 'b.kraus@example.org', clientType: 'Azure portal', op: op.rule, caller: 'b.kraus@example.org', corr: '4b7e0a2d-c893-4f15-a0d7-6e2c8b5f9a30', at: 'yesterday 19:30' },
    found: { by: 'reconcile', at: '02:00', ago: '9 h ago' },
    diff: added('deny-maintenance', '105', 'Deny', 'any', 'any', 'any'),
    fx: [{ dir: 'closes', text: 'any → app0614-api, every port' }],
    overwrite: 'Overwrite', adopt: { what: 'A new deny Rule “deny-maintenance” from the NSG rule, placed by the constraint merge.', fx: 'closes' }, state: 'open' },
  { id: 'dr-13', env: 'nonprod', sev: 'low', kind: 'space', res: 'vnet-app0702-wes', resKind: 'VNet address space', zones: [], vnet: 'vnet-app0702-wes', scope: 'vnet',
    what: 'VNet address space added: 10.176.0.0/16',
    actor: { who: 'sp-nonprod-network', via: 'Terraform', changedBy: 'sp-nonprod-network (service principal)', clientType: 'Terraform', op: 'Microsoft.Network/virtualNetworks/write', caller: 'sp-nonprod-network', corr: 'a6c1d9f4-0e72-4b38-95ad-2f8b4e6c0d15', at: 'yesterday 16:05' },
    found: { by: 'reconcile', at: '02:00', ago: '9 h ago' },
    diff: [['Address space', '10.175.0.0/16', '10.175.0.0/16, 10.176.0.0/16']],
    fx: [], why: 'Low: no effect on traffic. No subnet uses the new range yet, and no Rule names the VNet.',
    adopt: { what: 'The VNet object vnet-app0702-wes gets the range 10.176.0.0/16.', fx: 'none' }, inventory: true, state: 'open' },

  // ---------- Sandbox (ARM)
  { id: 'dr-21', env: 'sandbox', sev: 'high', kind: 'nsg-del', res: 'nsg-app0950-ger-db', resKind: 'Managed NSG', zones: ['z0950-db'], vnet: 'vnet-app0950-ger',
    what: 'Managed NSG deleted',
    actor: { who: 'aa-sandbox-cleanup', via: 'Azure PowerShell', changedBy: 'aa-sandbox-cleanup (automation account)', clientType: 'Azure PowerShell', op: 'Microsoft.Network/networkSecurityGroups/delete', caller: 'aa-sandbox-cleanup', corr: 'f2a8c4e6-1b90-4d37-8c5e-7a3d0b9f6e21', at: '10:10' },
    found: { by: 'poll', at: '10:15', ago: '26 min ago' },
    diff: [['Managed NSG', 'nsg-app0950-ger-db', 'deleted'], ['Subnet association', 'nsg-app0950-ger-db', '—']],
    fx: [{ dir: 'opens', text: 'What the Azure default rules allow into app0950-db: VirtualNetwork, AzureLoadBalancer' }],
    overwrite: 'Re-create', removeZone: true, state: 'open',
    inbox: 'High Drift on nsg-app0950-ger-db: the Managed NSG was deleted. The subnet has no NSG.' },
  { id: 'dr-02', env: 'sandbox', sev: 'low', kind: 'tag', res: 'nsg-app0961-nor-web', resKind: 'Marker tag', zones: ['z0961-web'], vnet: 'vnet-app0961-nor',
    what: 'Marker tag changed: nsgfw-zone',
    actor: { who: 'runbook-tag-cleanup', via: 'Azure CLI', changedBy: 'runbook-tag-cleanup (managed identity)', clientType: 'Azure CLI', op: 'Microsoft.Resources/tags/write', caller: 'mi-runbook-tag-cleanup', corr: '3e5d7b9a-2c04-4f61-b8e9-0d6a4c2f8b73', at: '09:12' },
    found: { by: 'poll', at: '09:15', ago: '1 h ago' },
    diff: [['Tag nsgfw-instance', 'nsgfw-01', 'nsgfw-01'], ['Tag nsgfw-zone', 'app0961-web', 'APP0961-WEB']],
    fx: [], why: 'Low: no effect on traffic. The marker tags say which Instance and Zone own the NSG.',
    overwrite: 'Overwrite', overwriteOnly: 'Marker tags belong to the tool: Overwrite only.', state: 'open' },
  { id: 'dr-r4', env: 'sandbox', sev: 'high', kind: 'assoc', res: 'vnet-app0921-wes/app0921-web', resKind: 'Subnet association', zones: ['z0921-web'], vnet: 'vnet-app0921-wes',
    what: 'Subnet association removed',
    actor: { who: 'svc-legacy-deploy', via: 'ARM template deployment', changedBy: 'svc-legacy-deploy (service principal)', clientType: 'ARM template deployment', op: 'Microsoft.Network/virtualNetworks/write', caller: 'svc-legacy-deploy', corr: '9c3a1f7e-6d24-4b85-a0e2-5f8c7b1d3a96', at: '2026-11-03 08:00' },
    found: { by: 'poll', at: '2026-11-03 08:00', ago: '7 days ago' },
    diff: [['NSG', 'nsg-app0921-wes-web', '—']],
    fx: [{ dir: 'opens', text: 'What the Azure default rules allow into app0921-web: VirtualNetwork, AzureLoadBalancer' }],
    auto: 'Overwritten automatically: re-associated nsg-app0921-wes-web with one subnet write. Audit entry.', state: 'resolved' },
];

// Main session, issue 37: the Zone overview's "Drift" flag follows these items instead of the random flags of data.ts,
// so the chip count, the Zone detail and the Emergency Commit dialog (issue 36) agree with the Drift tab.
for (const z of zones) { const i = z.flags.indexOf('drift'); if (i >= 0) z.flags.splice(i, 1); }
for (const id of new Set(SEED.filter(x => x.state !== "resolved").flatMap(x => x.zones))) { const z = zoneById.get(id); if (z && !z.flags.includes('drift')) z.flags.push('drift'); }
