# Place Rules by Coverage

Status: accepted (2026-11-09, [Grilling: Rule placement and default posture](https://github.com/mfgAkilae/nsgfw/issues/12)). Amended on 2026-11-09 by [ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md) and [ADR 0017](0017-extra-prefixes-and-vnet-bindings.md). Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): rewritten in place, without the one-sided placement of deny Rules that ADR 0016 replaced and without the consequences that later decisions settled.

The brief turns a Rule "A → B" into an outbound NSG rule on A's NSG and an inbound NSG rule on B's NSG. It does not say what happens when a source or destination is not a Zone. Every Managed NSG ends with Deny-all rules in both directions. So if a Rule "Zone A → 10.2.0.5" landed only on Zone A, and 10.2.0.5 sits inside Zone B, Zone B's inbound Deny-all rule would drop the traffic and the Rule would never work. We decided that a Rule lands on the Coverage of its source as outbound NSG rules and on the Coverage of its destination as inbound NSG rules. Coverage is the set of Zones that a Zone, an Address object or an Address group stands for. The [glossary](../../GLOSSARY.md) lists what each kind covers, and [ADR 0017](0017-extra-prefixes-and-vnet-bindings.md) adds Extra prefixes and VNet bindings to it. The NSGs then reach the same result for every flow as first-match evaluation of the Rule base on a single firewall, which the later packet tracer reuses.

Deny Rules land where allow Rules land. [ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md) decides that, and also which outbound NSG rules a Zone gets under its Egress posture.

## Considered Options

- **Literal placement: endpoints that are not Zones produce no NSG rule.** Rejected. The footprint is smaller, but a Rule whose destination is a single IP or a CIDR range inside a Zone would silently fail at that Zone's inbound Deny-all rule. So would a Rule like "10.0.0.0/8 → Zone B" for traffic that starts in a Zone with a strict Egress posture.
- **Coverage, but any stands only for addresses outside Zones.** Rejected. It breaks what firewall administrators expect any to mean.

## Consequences

- What a broad Rule costs depends on the Egress posture of the Zones it covers; [ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md) states the cost. The engine never merges NSG rules of several Rules. A Change set that breaks a limit of an NSG fails validation ([Grilling: Priority assignment and rule packing](https://github.com/mfgAkilae/nsgfw/issues/13)).
- The content of a Managed NSG depends on Azure facts as well as on the Rule base: subnet prefixes, VNet address spaces and ASG membership. Every Version records them as its Azure inventory, and a change in Azure that alters the translation enters through Adopt ([ADR 0020](0020-versions-record-the-azure-inventory.md)).
- A single IP or CIDR range covers every Zone whose addresses it overlaps, also in VNets that are not connected but use the same prefixes. A VNet binding limits the Address object to the VNets it names ([ADR 0017](0017-extra-prefixes-and-vnet-bindings.md)). The object editor shows the Coverage of every Address object.
- Switching a Rule between allow and deny can change the NSGs it touches. The Preview shows the change.
- The object picker does not offer the VirtualNetwork service tag, because its meaning differs from NSG to NSG.
