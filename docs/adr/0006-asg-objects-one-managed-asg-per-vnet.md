# ASG objects: one Managed ASG per VNet, member IPs everywhere else

Status: accepted (2026-11-09, [Grilling: ASG model and NIC membership](https://github.com/mfgAkilae/nsgfw/issues/14)). Amended on 2026-11-09 by [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27): the tool adopts member changes that only close traffic on its own, an admin can set an object to adopt all member changes automatically, and tool-written membership needs the optional role `nsgfw ASG Writer` ([ADR 0014](0014-operator-grants-azure-roles-tool-verifies.md)).

The brief says the tool creates and manages ASGs, including NIC membership. Azure restricts ASGs more than firewall administrators expect. All members of one ASG must sit in one VNet. An NSG rule with ASGs on both sides needs all their members in one VNet. Microsoft's troubleshooting page also says that an NSG and the members of the ASGs it references must be in the same VNet. Whether a reference across a peering works is not documented ([Research: NSG and ASG rule semantics and limits](https://github.com/mfgAkilae/nsgfw/issues/2), U11). In hub-and-spoke networks, most flows cross VNets. Membership is also hard to write for some resource types. Scale sets keep it in the model, and existing instances pick it up only through the upgrade policy. AKS accepts it only through the AKS API. In Terraform, both exist only inline in resources that other repositories own ([Research: ARM and Resource Graph behaviour for NSG deployment](https://github.com/mfgAkilae/nsgfw/issues/4), [Research: Terraform azurerm modeling of NSGs, associations and ASGs](https://github.com/mfgAkilae/nsgfw/issues/6)).

We decided on two kinds of Address objects backed by ASGs:

- An **ASG object** has a static list of ASG members (network interfaces and private endpoints) that administrators change only through Change sets. The tool writes the members into one Managed ASG per VNet that holds members, so one object such as "WebServers" can span many spokes.
- An **External ASG object** stands for exactly one Unmanaged ASG. Others own its membership. The tool reads the members, for example scale-set or AKS node interfaces, but never writes them.

On the NSG of a Zone, the Translation engine references an ASG only when the ASG's members are in that Zone's VNet. Everywhere else, it writes the members' private IPv4 and IPv6 addresses as a prefix list in its own partition. It does the same on Zones whose service does not support ASGs in NSG rules (PostgreSQL flexible server). It keeps this fallback even if an empirical check shows that references across a peering work, because that behaviour is undocumented and depends on the peering.

## Considered Options

- **One ASG object is exactly one ASG, in one VNet.** Rejected. It maps 1:1 to Azure and makes Import trivial. But administrators would need one object per spoke and an Address group to combine them, so they would have to know VNet boundaries the tool is meant to hide.
- **Forbid ASG objects in Rules whose other side is in another VNet.** Rejected. In hub-and-spoke networks this makes ASG objects almost useless.
- **Reference the ASG across a peering where Azure accepts it.** Rejected. It would avoid member IPs on far-side NSGs, but it rests on undocumented behaviour, and the NSG content would depend on peering state.
- **Dynamic membership by Azure tag or rule.** Rejected for the MVP. The tool would either write memberships without Approval or put every match change into a Change set. External ASG objects cover dynamic cases such as autoscaling and application teams that manage membership in their own IaC.
- **Only tool-managed ASGs, as the brief literally says.** Rejected. Import would have to take over every existing ASG and fight its owner's IaC. Scale sets and AKS node pools could never be members.

## Consequences

- NSGs outside an ASG's VNet depend on its members' IPs. A changed IP, a deleted member or a change in an External ASG object's ASG makes them stale. The tool flags this like Drift.
  - What only closes traffic, the tool adopts on its own: the IP of a deleted or changed member leaves allow Rules without Approval, with an audit entry, as an expired allow Rule is disabled ([ADR 0008](0008-approval-by-affected-zones.md)). Azure can reuse the IP, so it must not stay allowed until someone approves.
  - What opens traffic (a new member, a new IP, an IP that leaves a deny Rule) goes into a Change set that the tool prepares for Approval.
  - An admin can set an ASG object or an External ASG object to adopt all member changes automatically. The Approval of that setting then covers future members, like a dynamic address group on a firewall. Without it, autoscaling across VNets would need an Approval for every new instance.
- Inside the ASG's VNet, a changed member IP needs no NSG change, and a new member in a Zone that is already covered works without one.
- Managed ASGs get their name from an Environment's ASG naming pattern when the tool creates them, and keep it when the object is renamed. Their marker tags carry the instance ID and the Object ID.
- An Unmanaged ASG whose members are all network interfaces or private endpoints in an Environment can be adopted in place as a Managed ASG. An ASG that another tool instance manages can be neither adopted nor referenced.
- A Version stores the ASG members of every ASG object, so a rollback restores membership.
