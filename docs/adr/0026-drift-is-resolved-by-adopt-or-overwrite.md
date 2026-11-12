# Drift is resolved by Adopt or Overwrite

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). First decided on 2026-11-09 in [Grilling: Import and drift handling](https://github.com/mfgAkilae/nsgfw/issues/18), and changed on the same day by [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27) (automatic Overwrite, automatic adoption of member changes).

Drift is a difference between Azure and the Deployed state ([ADR 0022](0022-a-version-exists-from-its-commit-and-deployments-plan-from-the-deployed-state.md)), caused outside the tool. It can be resolved in two directions: the Rule base follows Azure, or Azure is written back. The brief asks that a person decides every Drift. The open question was whether writing back needs an Approval.

We decided:

- **Adopt changes the Rule base to match Azure.** It runs through a Change set that the tool prepares, one per cause and Object. For NSG rule Drift on a Managed NSG, a foreign NSG rule becomes a new Rule through the Import mapping and the constraint merge ([ADR 0011](0011-import-preserves-behaviour.md)). An `nsgfw-` NSG rule that was changed or deleted leads to an edit or a disable of its Rule, if that Rule lands only on this NSG and direction. Everything else is not adoptable automatically: an admin overwrites, or edits a Change set by hand.
- **Overwrite writes the Deployed state back, without Approval and without a Change set.** It restores a state that was approved and written, as a Retry does. The confirmation dialog shows the resources and the flows that reopen or close, and the Overwrite is an audit entry. It is available per resource from the Drift view at any time, and in the Commit dialog. In ARM mode it is one write of the Deployed state. In Terraform mode it is a pull request that changes only the revision value; that pull request reverts all Drift in the root module, and the dialog lists all of it.
- **Each kind of Drift allows one or both:**

  | Drift | Adopt | Overwrite |
  |---|---|---|
  | NSG rules of a Managed NSG, including NSG rules without `nsgfw-` names or with unknown Rule IDs | yes | yes |
  | Marker tags changed or removed | no | yes |
  | Managed NSG or Managed ASG deleted | no | yes (re-create), or remove the Zone |
  | Subnet association removed or changed, including a subnet re-created with the same resource ID | no | yes (re-associate), or remove the Zone |
  | Managed ASG membership on a network interface | yes | yes |
  | Subnet prefix, VNet address space, member IP on an NSG that uses the IP fallback, deleted ASG member, membership of an External ASG object | yes | no |

- **Only the marker tags belong to the tool.** Other tags on a Managed NSG or Managed ASG are never Drift and are kept, in both Deployment modes: ARM mode sends them from the fresh GET, and the default HCL merges the Data contract's marker tags with the tags that exist.
- **An Adopt needs the usual Approval, with the exceptions that [ADR 0008](0008-approval-by-affected-zones.md) lists.** The tool commits on its own an Adopt that only closes traffic and the member changes of [ADR 0006](0006-asg-objects-one-managed-asg-per-vnet.md): a deleted ASG member (deny Rules included), a changed IP of an ASG member, the IPv6 addresses of a new member whose IPv4 is already let in, the switch between ASG references and member IPs when a subnet gets its first or loses its last private endpoint, and every member change of an ASG object or External ASG object set to adopt automatically. These run at every Approval level, also at none, where every other Adopt waits in the inbox for a person to commit it. None of them closes a Tool path on its own: the tool holds that member change back for a person.
- **A person decides every other Drift, with one exception per Environment.** An admin can let the tool Overwrite on its own, only for a removed or changed subnet association and for removed marker tags. The default is off, and the setup of the small profile proposes it. When the same Drift comes back repeatedly, the tool stops and reports the writer.
- **The Drift poll finds it, and a GET confirms it.** The tool polls Resource Graph `resourcechanges` every 5 minutes, an Environment setting, and confirms every hit with a GET from the resource provider, because Resource Graph is eventually consistent. A full reconcile of all tool resources runs every 24 hours. Each Drift poll also queries the Resource Graph table `ComputeResources` for the network interfaces of External ASG objects with scale-set or AKS members, because `resourcechanges` does not cover that table ([Resource Graph changes](https://learn.microsoft.com/en-us/azure/governance/resource-graph/changes/resource-graph-changes), retrieved 2026-11-12). It also reads the NSG reference of the subnet of every Zone from `resources`, because it is undocumented whether an association change appears in `resourcechanges`. Both get a nightly test.

## Considered Options

- **Approval for an Overwrite that opens traffic, or for every Overwrite.** Rejected. An Overwrite restores a state that was approved and written, as a Retry does.
- **Adopt by full reverse translation.** Rejected. It would synthesize Rules.
- **Event Grid, or only periodic full scans, to detect Drift.** Rejected. With Event Grid the tool would create Azure resources in every subscription. Full scans alone are expensive and name no actor.

## Consequences

- An Overwrite can reopen or close flows without an approver. The confirmation dialog and the audit entry are the record.
- In a Terraform Environment an Overwrite cannot target one resource: every apply of a root module reverts the Drift on all tool resources in it.
- Automatic Overwrite and the automatic Adopt of member changes are deliberate departures from the brief, which the map owner confirmed in the review.
- An alert channel (e-mail or a webhook) is part of the setup, and Health warns while none is configured.
- A Data contract file edited by hand on the base branch is flagged, and the next pull request of the tool restores it. Adopt always reads Azure, never the file.
