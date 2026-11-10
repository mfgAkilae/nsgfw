# Import preserves behaviour through a constraint merge and Inherited defaults

Status: accepted (2026-11-09, [Grilling: Import and drift handling](https://github.com/mfgAkilae/nsgfw/issues/18)). Amended on 2026-11-10 by [ADR 0018](0018-write-order-from-dominance-gaps.md) (no interim content on the first Commit) and by [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22) (VNet bindings for new objects, outbound preservation).

Onboarding a brownfield subnet must not cut production traffic. Its existing NSG has two kinds of rules. The first kind are custom NSG rules with their own order per direction. The second kind are the Azure default rules: they allow `VirtualNetwork` inbound and outbound and `Internet` outbound, and they deny everything else. The Rule base is one first-match list across all Zones, and an allow Rule lands on both sides by Coverage ([ADR 0004](0004-place-rules-by-coverage.md)).

Simple ways to import break the old behaviour:

- **A block of imported Rules below the existing Rules.** Broad existing Rules override the subnet's own denies.
- **A block above the existing Rules.** Imported allows open Zones that are already managed before their own denies apply.
- **Rules that reproduce the Azure default rules.** Such a "baseline" Rule, for example "Zone X → VNet space allow any", lands inbound on every managed Zone in the VNet. It opens those Zones to X on every port that their own Rules do not match. It also needs the `VirtualNetwork` tag expanded into prefixes. Azure exposes that expansion only per network interface of a running VM, and the result goes stale when peerings or routes change. It also adds up to three Rules per Zone, against a design target of 20,000 Zones and 10,000 Rules.

We decided:

- **Behaviour is preserved by default.** Each Zone can opt out of this in the onboarding Change set.
- **Constraint merge.** Every imported (NSG, direction) keeps its order. The existing Rule base is one more policy, and its order is fixed. Where Rules from different policies overlap and have different actions, the deny comes first, because traffic must pass both NSGs. So imported Rules can land between existing Rules, but existing Rules never move relative to each other. The tool recomputes the placement on every Rebase until someone moves an imported Rule by hand.
- **Cycles break toward closing.** If the constraints form a cycle, no order keeps the old behaviour exactly. The tool then moves a deny above an allow of its own policy. This only closes flows, never opens them, and a warning Import note lists the closed flows.
- **Inherited defaults instead of baseline Rules.** Inherited defaults is a Zone setting with three flags: inbound from `VirtualNetwork`, outbound to `VirtualNetwork` and outbound to `Internet`. Each flag is an NSG rule in the reserved band 4090–4095 on the Zone's own Managed NSG only. It uses the service tag itself, so it matches the Azure default rule exactly. Import sets only the flags whose Azure default rule took effect in the old NSG. A subnet without an NSG gets all three flags. A flag is removed only through a Change set.
- **New IP objects get a VNet binding where needed.** When Import creates a single IP or CIDR range object for a prefix that also matches Zones in VNets that the onboarded Zone is not connected to, it binds the object to the Zone's VNet and its peered VNets, with an info Import note. The old NSG could see traffic only from those VNets. Without the binding, the worked examples showed the imported Rule landing on a Zone in an unconnected VNet and opening traffic there.
- **Custom NSG rules that use `VirtualNetwork` keep the tag.** A service tag has no Coverage, so such a Rule lands only on the Zone side, as before. It carries a warning Import note.

## Considered Options

- **Imported Rules as a block at the bottom or at the top of the Rule base.** Rejected for the reasons above.
- **Exact preservation by prefix subtraction.** The tool would subtract the prefixes of managed Zones from the far side, and split Rules until a cycle-free order exists. Rejected: it creates unreadable Objects, and `any` turns into thousands of prefixes.
- **A blocking flag for every cycle.** Rejected: large onboardings would stall on conflicts that a restrictive order resolves safely.
- **Baseline Rules that reproduce the Azure default rules at the bottom of the Rule base.** Rejected for the reasons above.
- **Expanding `VirtualNetwork` into VNet objects or prefixes.** Rejected: the result misses on-premises and UDR prefixes, it goes stale, and as Rules with Coverage it opens managed Zones.

## Consequences

- Preservation covers the onboarded subnet's explicit NSG rules and Azure default rules. It has two limits:
  - Imported allows open managed Zones in their Coverage, and Approval of those Affected Zones protects them.
  - Existing Rules apply to the new Zone and can open or close flows that the old NSG handled differently. The Preview flags these flows as warning (opens) or info (closes) Import notes.
  - Imported Zones start destination-enforced ([ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)), so outbound traffic to Internal addresses that the old `VirtualNetwork` tag did not hold opens. A warning Import note lists those flows. This was accepted on 2026-11-10: almost every routable destination is in the tag (peerings, gateway-connected on-premises ranges, UDR prefixes), and the destination Zones still enforce inbound.
- A Zone with Inherited defaults has its own default action for traffic that no Rule matches. The Rule base evaluation function, and later the packet tracer, must evaluate this Zone posture together with the Intra-zone default. The verdict of `VirtualNetwork` Rules and flags is approximate, because the tool does not know what the tag expands to.
- Import records which legacy NSG rule became which Rule, as provenance. The first Commit to a Managed NSG that was adopted in place needs no interim content: the legacy NSG is the Deployed state, and its Crossing flows order the writes ([ADR 0018](0018-write-order-from-dominance-gaps.md), which amended this point on 2026-11-10).
- [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22) checked the merge, the cycle break and the write order of the first Commit on 2026-11-10. Imported Rules without an order constraint go as low in the Rule base as their constraints allow; any place gives the same verdict.
