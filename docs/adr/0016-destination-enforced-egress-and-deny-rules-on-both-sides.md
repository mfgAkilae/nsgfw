# The destination decides: Egress posture, and deny Rules on both sides

Status: accepted (2026-11-09, [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27)). Amends [ADR 0004](0004-place-rules-by-coverage.md) and [ADR 0008](0008-approval-by-affected-zones.md). Amended on 2026-11-10 by [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22): fc00::/7 joins the default Internal address space, the egress allow has fixed priorities, and the Affected Zones of a posture change and of an Internal address space change are set.

[ADR 0004](0004-place-rules-by-coverage.md) put every allow Rule on the Coverage of its source and of its destination, and every deny Rule on one side that it chose by object type. The brief gives every Zone Deny-all rules in both directions. A review of the design package showed three effects.

- **Broad sources do not scale.** "any → Zone B" puts one outbound NSG rule into every Managed NSG, and the engine never merges the NSG rules of several Rules. An NSG holds 2,000 NSG rules, so one instance can hold at most about 2,000 Rules with a broad source, however many Zones it has. The design target is 10,000 Rules. Import creates such Rules in bulk, because `*` is the default source in the portal: 300 subnets with three such inbound rules each put 900 outbound NSG rules into every Managed NSG.
- **Broad sources need everyone's Approval.** Their Affected Zones are all Zones, at the strictest level of all Environments ([ADR 0008](0008-approval-by-affected-zones.md)).
- **One-sided deny Rules move.** Editing a deny Rule can move it from the destination side to the source side. This is the only reason why [ADR 0009](0009-tighten-then-loosen-deployments.md) needs a Tighten phase, a Loosen phase, interim contents and holds.

Most NSG estates avoid the first two effects: they leave outbound traffic inside the network open and filter inbound at the destination.

We decided:

- **Every Zone has an Egress posture.** `destination-enforced`, the default, allows outbound traffic to the Internal address space, below the Rules and above the Deny-all rules (priority 4094 for IPv4 and 4095 for IPv6, in the band 4090–4095 that also holds the Inherited defaults at 4090 and 4091). For a flow between two Zones, the inbound NSG rules of the destination Zone then decide. `strict` has no such allow: the Zone's own outbound NSG rules must allow the flow too, as ADR 0004 decided for every Zone. In both postures the outbound Deny-all rule stays, so traffic to the Internet and to service tags needs allow Rules, and every Zone enforces inbound. The posture is chosen at onboarding and changed through a Change set.
- **The Internal address space is one instance-wide list of prefixes,** by default the RFC 1918 ranges and the IPv6 unique local addresses fc00::/7. Without an IPv6 prefix, IPv6 between dual-stack Zones behaved as if every Zone were strict, and "any → Zone" landed outbound on every dual-stack Zone, the cost this ADR removes for IPv4 (worked examples, 2026-11-10). The list changes through a Change set whose Affected Zones are every destination-enforced Zone, because their egress allow uses it.
- **Deny Rules land where allow Rules land:** inbound on the Coverage of the destination and outbound on the Coverage of the source. The rule of ADR 0004 that chose one side by object type is dropped. The inbound NSG rules of a Zone then hold every Rule that can match a flow into it.
- **A destination-enforced Zone gets no outbound NSG rule without effect.** The engine leaves out an allow NSG rule whose destination lies inside the Internal address space, unless a deny NSG rule below it in the same NSG overlaps it. It leaves out a deny NSG rule whose destination lies entirely inside Zones, because the same deny lands inbound there. A strict Zone gets every NSG rule. Every NSG rule still belongs to exactly one Rule.
- **Affected Zones follow the NSG that decides.** The Coverage of a Rule's destination always counts. A Zone in the Coverage of the source counts only when its Egress posture is strict, or when the destination reaches outside Zones. A change of a Zone's Egress posture affects only that Zone; the Rules that use it do not count as changed through it. This amends ADR 0008.

## Considered Options

- **Strict as the default, destination-enforced as an option per Zone.** Rejected. It keeps the brief's wording, but the default case keeps both problems.
- **The brief unchanged; the engine only leaves out NSG rules without effect.** Rejected. It helps where Inherited defaults keep outbound open, not on Zones with Deny-all rules outbound.
- **The `VirtualNetwork` service tag instead of a list of prefixes.** Rejected. The tag differs from NSG to NSG, no API returns its content for a subnet, and Microsoft writes that it "might also contain default routes". The engine could not tell which destinations a Zone lets out. If a destination Zone lay outside the tag, the flow would be closed and no Rule could open it.
- **An Internal address space per Environment.** Rejected. One Rule would then mean different things for source Zones in different Environments.
- **Deny Rules on one side, as in ADR 0004.** Rejected for the third effect above.
- **Approval from both sides for every Rule, as in ADR 0008.** Rejected. A destination-enforced Zone has handed its decision about internal egress to the destination, and its NSG does not change.

## Consequences

- This changes the brief, which asked for explicit deny-all rules in both directions. The Deny-all rules stay, but by default an allow for the Internal address space sits above the outbound one.
- A destination-enforced Zone can reach every internal address that is not in a Zone, such as on-premises networks and subnets that are not Zones, unless a deny Rule closes it. A Zone that must not do that is set to strict.
- A Rule with a broad source costs one inbound NSG rule per destination Zone, plus one outbound NSG rule on every strict Zone in its source.
- A deny Rule with a broad destination costs more than before: "deny Zone A → any" lands inbound on every Zone.
- The Rule base evaluation function, and later the packet tracer, must evaluate the Egress posture of the source Zone together with the Intra-zone default and the Inherited defaults ([ADR 0011](0011-import-preserves-behaviour.md)). Inherited defaults stay as they are: flags per Zone that use service tags and keep Azure's old behaviour at Import. Imported Zones start destination-enforced.
- Where the source side has no NSG rule, the hits of a flow between two Zones are counted on the destination side only.
- With every deny on the destination side, the inbound NSG rules of the destination Zone compute the Rule base's verdict for every flow into it. A state in which some NSGs hold the old and some the new content should then allow a flow only if the old or the new Version allows it, whatever the order of writes. [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22) checks this argument first. If it holds, a new ADR replaces ADR 0009. Result (2026-11-10): it holds except for Crossing flows and for ASG membership, and [ADR 0018](0018-write-order-from-dominance-gaps.md) replaces ADR 0009.
