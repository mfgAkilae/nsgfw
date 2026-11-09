# Place Rules by Coverage, and Deny Rules on one side only

Status: accepted (2026-11-09, [Grilling: Rule placement and default posture](https://github.com/mfgAkilae/nsgfw/issues/12))

The brief turns a Rule "A → B" into an outbound NSG rule on A's NSG and an inbound NSG rule on B's NSG. It does not say what happens when a source or destination is not a Zone. Every Managed NSG ends with Deny-all rules in both directions. So if a Rule "10.1.0.5 → Zone B" landed only on Zone B, and 10.1.0.5 sits inside Zone A, Zone A's outbound Deny-all would drop the traffic and the Rule would never work. We decided that a Rule lands on the Coverage of its source as outbound NSG rules and on the Coverage of its destination as inbound NSG rules. The Coverage of a Zone is the Zone itself. The Coverage of a VNet is the Zones inside it. An IP or CIDR range (including the built-in any) covers every Zone whose prefixes it overlaps, an ASG covers the Zones that hold its member NICs, and an Address group covers the union of its members. Service tags and subnets that are not Zones cover no Zone. Allow Rules land on both sides. The NSGs then reach the same result for every flow as first-match evaluation of the Rule base on a single firewall, which the later packet tracer reuses.

Traffic must pass both NSGs, so a deny on one end of the path is enough. A deny Rule lands only on the destination side when its destination consists only of Zones. Otherwise, it lands only on the source side when its source consists only of Zones. In every other case it lands on both sides. The choice depends on the object types in the Rule, not on prefixes, so it does not change when Zones are onboarded or removed.

## Considered Options

- **Literal placement: endpoints that are not Zones produce no NSG rule.** Rejected. The footprint is smaller, but host objects inside Zones, and Rules like "10.0.0.0/8 → Zone B", would silently fail for traffic that starts in a Zone.
- **Coverage, but any stands only for addresses outside Zones.** Rejected. It breaks what firewall administrators expect any to mean.
- **Deny Rules on both sides, like allow Rules.** Rejected. It is symmetric, but "deny any → Zone B" would write an outbound NSG rule into every Managed NSG. The design target is 20,000 Zones.
- **Deny on the destination side, and on the source side only when the destination also holds addresses outside Zones.** Rejected. The footprint is smallest, but the placement would depend on prefixes and change whenever Zones change.

## Consequences

- Broad allow Rules are expensive. "any → Zone B" puts one outbound NSG rule into every Managed NSG, and the engine never merges NSG rules of several Rules. How limits per NSG are enforced is open in [Grilling: Priority assignment and rule packing](https://github.com/mfgAkilae/nsgfw/issues/13).
- The content of a Managed NSG depends on Azure state as well as on the Rule base: subnet prefixes, VNet address spaces and ASG membership. When such a state changes outside the tool, the tool flags it like Drift, and an administrator adopts it through a Change set.
- VNets that are not connected but use the same prefixes get NSG rules that never match traffic. This is accepted as harmless. The object editor shows the Coverage of every Address object.
- Switching a Rule between allow and deny can change the NSGs it touches. The Preview shows the change.
- The object picker does not offer the VirtualNetwork service tag, because its meaning differs from NSG to NSG.
