# Every Version records the Azure inventory it was translated against

Status: accepted (2026-11-10, [Grilling: Server internals at the design target](https://github.com/mfgAkilae/nsgfw/issues/30)).

The Translation engine needs facts about Azure besides the Rule base: the address spaces and peerings of VNets, the prefixes of subnets (also of subnets that are not Zones), the IPs of network interfaces and private endpoints, the members of External ASG objects, and the Environment of each subscription ([ADR 0004](0004-place-rules-by-coverage.md), [ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)). These facts change outside the tool. If the engine read them live, a Commit could write NSG rules that differ from the Preview an approver saw ([ADR 0008](0008-approval-by-affected-zones.md)), and a new subnet prefix would change NSGs without anyone deciding it.

We decided:

- **Every Version records its Azure inventory.** The Preview, the Commit and the write plan translate against the Azure inventory of the Version they work on, never against live Azure. A Change set uses the Azure inventory of its base Version, and a Rebase moves it to the latest one.
- **A change in Azure enters only through Adopt.** The tool keeps an observed Azure inventory per Environment, refreshed by the Drift poll and the daily reconcile. When the observed Azure inventory changes the translation of the latest Version, the tool prepares a Change set. It commits on its own what only closes traffic, as [Grilling: Import and drift handling](https://github.com/mfgAkilae/nsgfw/issues/18) decided for Adopt; everything else needs the usual Approval.
- **An open Adopt blocks nothing.** Other Commits and Deployments go ahead with the Azure inventory of their Version, because the NSGs already in Azure have the same gap. The Preview marks the Zones concerned with "Azure differs, Adopt open".
- **The write plan trusts a peering only when both agree.** A documented tag fact (a directly peered VNet lies inside `VirtualNetwork`, [ADR 0018](0018-write-order-from-dominance-gaps.md)) counts only when the Version's Azure inventory and the observed Azure inventory both hold the peering. Otherwise the engine evaluates both cases. A peering removed in Azure after the Commit would otherwise hide a Crossing flow.

Whether a Version stores its Azure inventory as a full copy or as changes is part of the data model.

## Considered Options

- **Live Azure at the Commit.** Rejected. The NSG rules written could differ from the approved Preview, and Azure changes would reach NSGs without Approval.
- **Live Azure in the Preview, pinned at the Commit.** Rejected. The Preview of an ordinary Change set would show changes it did not cause, with Affected Zones that do not include them.
- **Block Commits while an Adopt is open.** Rejected. The Commit does not widen the gap, and blocking would stall unrelated work behind an Approval for a change made in Azure.
- **Only the Version's peerings in the write plan.** Rejected for the reason in the last point above.

## Consequences

- What an approver saw is what the Deployment writes.
- Each Version is reproducible: the Rule base, its Azure inventory, the NSG rules of the previous Version and the engine version give the same NSG rules.
- An Azure change that alters the translation always produces a Change set, with Approval unless it only closes. A busy estate produces a steady flow of small Adopt Change sets.
- The tool stores two inventories: the observed one per Environment and the one each Version records.
