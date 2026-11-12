# Zones carry Extra prefixes, and IP objects can be bound to VNets

Status: accepted (2026-11-09, [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27)). Amends [ADR 0004](0004-place-rules-by-coverage.md). Amended on 2026-11-10 by [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22): how Import uses VNet bindings. Amended on 2026-11-10 by [Prototype: Zone detail, Flow view and object editors](https://github.com/mfgAkilae/nsgfw/issues/35): an Extra prefix may overlap the subnet of another Zone, with a warning. Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): the AKS pod range is a manual entry in the MVP, and any editor may draft Extra prefixes.

[ADR 0004](0004-place-rules-by-coverage.md) derives Coverage from prefixes: an IP or CIDR range covers every Zone whose subnet prefixes it overlaps. Two assumptions behind that do not hold.

- **A Zone's NSG also sees addresses outside the subnet's prefixes.** In an AKS cluster with Azure CNI Overlay, "Pod-to-pod traffic with Azure CNI Overlay isn't encapsulated, and subnet network security group (NSG) rules are applied", and Microsoft requires allow rules between the pod range and itself ([Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay), page date 2026-07-31, retrieved 2026-11-09). The pod range is part of no subnet, so a Rule with it covered no Zone and landed nowhere: the Deny-all rules would break the cluster, and no Rule could repair it. An Application Gateway v2 whose public and private listeners share a port needs its frontend IPs as the destination of the inbound rule ([Application Gateway infrastructure configuration](https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure), page date 2026-08-18, retrieved 2026-11-09). A subnet with an appliance that forwards traffic sees any source and any destination.
- **The same prefix in two unconnected VNets is not harmless.** ADR 0004 accepted NSG rules "that never match traffic" there. They do match in the other VNet, and they open traffic there when the far side is not a Zone.

We decided:

- **Extra prefixes.** An editor can add prefixes to a Zone, through a Change set. They count as part of the Zone for Coverage, own-side pruning and the Intra-zone default. Several Zones can have the same Extra prefixes, for example the same pod range in several clusters.
- **VNet binding.** A single IP or CIDR range Address object can be bound to one or more VNets. It then covers only Zones in those VNets. The NSG rule still carries the object's own prefix.
- **Two more kinds of subnet never become Zones:** a subnet with a network interface that has IP forwarding enabled, and a subnet whose NSG a service maintains, such as the NSG that AKS manages for a cluster. They are shown read-only and can be used as subnet Address objects, like SQL Managed Instance and Databricks subnets.

## Considered Options

- **Extra prefixes without VNet bindings,** with a warning for overlapping address spaces. Rejected. Default address ranges repeat across VNets in many estates, and a warning does not close the traffic.
- **Excluding AKS overlay subnets from onboarding.** Rejected. Azure CNI Overlay is a common network model for AKS, so the tool would miss a common workload.
- **Onboarding forwarding subnets with a warning.** Rejected. Their Extra prefixes would be every address, and every Rule would land on them.
- **The name "VNet scope".** Rejected. Scope is reserved for access.

## Consequences

- Coverage now depends on what administrators declare, not only on Azure. A wrong Extra prefix places Rules on a Zone that never sees the traffic. A missing one leaves the traffic to the Deny-all rules. The pod range of an AKS cluster is a manual entry in the MVP: the onboarding warning for a subnet with AKS nodes asks for it, and an editor enters it as an Extra prefix. Reading it from the cluster needs one more read action and is Later.
- An Extra prefix may overlap the subnet of another Zone, for example the frontend IP of a load balancer in that subnet. The console warns and does not block: Address objects that overlap the prefix then cover both Zones, and the Intra-zone default of the Zone counts these addresses as its own. Decided on 2026-11-10 in [Prototype: Zone detail, Flow view and object editors](https://github.com/mfgAkilae/nsgfw/issues/35).
- An object without a VNet binding behaves as before and covers every Zone its prefix overlaps. The object editor shows the Coverage, so an administrator sees Zones in VNets they did not mean.
- The two new kinds of subnet are detected with reads the Reader already has: `enableIPForwarding` on network interfaces, and the managed resource group or the writer of the NSG.
- Import binds a new single IP or CIDR range object to the onboarded Zone's VNet and its peered VNets when the prefix also matches Zones in VNets that the Zone is not connected to ([ADR 0011](0011-import-preserves-behaviour.md), decided 2026-11-10 after the worked examples).
- The same Extra prefix on two Zones also matches the destination's own addresses: in the worked examples, a Rule from one AKS cluster's Zone to another's allowed the destination cluster's own pods too, because both carry 10.244.0.0/16 and pod traffic leaves a cluster through the node IPs.
