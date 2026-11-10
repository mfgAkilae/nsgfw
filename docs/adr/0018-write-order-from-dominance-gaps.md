# The order of writes follows dominance gaps, not Tighten and Loosen phases

Status: accepted (2026-11-10, [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22)). Supersedes [ADR 0009](0009-tighten-then-loosen-deployments.md). Amends [ADR 0010](0010-terraform-mode-data-contract-and-azure-observation.md) and [ADR 0011](0011-import-preserves-behaviour.md).

[ADR 0009](0009-tighten-then-loosen-deployments.md) wrote every Deployment in a Tighten phase and a Loosen phase, with interim contents and holds, because a one-sided deny Rule could move between the source and the destination side. [ADR 0016](0016-destination-enforced-egress-and-deny-rules-on-both-sides.md) puts deny Rules on both sides. The engine prototype checked whether the order of writes still matters (prototype on the throwaway branch [`prototype/translation-engine-order-check`](https://github.com/mfgAkilae/nsgfw/tree/prototype/translation-engine-order-check/prototypes/translation-engine-order-check), result in the ticket).

**The argument (destination dominance).** A flow between two Zones passes the source Zone's outbound and the destination Zone's inbound NSG rules. Suppose that in a Version the destination's inbound denies every flow that the source's outbound denies. Then any mix of NSG contents of two such Versions allows a flow only if one of them allows it: if the mix allows it, the destination's inbound allows it at its Version, so the source allows it there too. A flow with one Zone endpoint passes one Managed NSG, which one PUT replaces as a whole.

**What the check found.** Over random Change sets with every mix of old and new NSG contents per Zone, the argument holds for Zones, CIDRs, hosts, any, ASG objects with fixed members, both Egress postures, posture changes, IPv6 Zones outside the Internal address space, outbound Inherited defaults and three Versions in flight. Destination dominance breaks in five cases, each with a worked example: a Rule with a service tag on one side (it lands on one side only), the Inherited default "inbound from `VirtualNetwork`" with a strict source, a removed Zone (its Retired NSG denies outbound), a legacy NSG before onboarding, and ASG membership, which is a write to a network interface and not part of any NSG. As a control, ADR 0009's own deny-flip example opens traffic under ADR 0004's placement and stays closed under ADR 0016.

We decided:

- **Writes have no phases.** A Deployment writes in dependency order (a new NSG or Managed ASG before a reference to it, an association after its NSG) and otherwise in any order, in parallel where the limits allow.
- **Dominance gaps add edges.** A **Dominance gap** is a flow between two Zones that the destination's inbound NSG rules allow and the source's outbound NSG rules deny. The engine computes the gaps of the Deployed state and of the target. A gap only in the target means: write the source Zone's NSG first. A gap only in the Deployed state means: write the destination Zone's NSG first. A gap in both needs no edge, because the source denies the flow in both states.
- **ASG membership is written in three steps.** First, the member changes that only close traffic under the Deployed NSG contents. Then the NSG writes, with their edges computed against the members as they are after that first step. Last, the remaining member changes, each of which must only open traffic under the target NSG contents.
- **A Change set that cannot be ordered fails validation.** This happens when the edges between two Zones point both ways, or when a member change neither only closes under the old contents nor only opens under the new ones. The Preview names the flows, and the fix is to split the Change set into two Commits, like a limit breach.
- **A failed write delays only the writes that depend on it.** It is retried on its own. Writes with an edge from it wait, in later Deployments too, because every Deployment plans its edges from the Deployed state. There is no hold on Affected Zones and no override.

## Considered Options

- **Keep ADR 0009.** Rejected. Interim contents cost a second write per NSG and count against the limits, holds block unrelated opening changes, and a Terraform Deployment needs two pull requests. Most Change sets need none of it.
- **No order at all.** Rejected. The five cases above open traffic that both the old and the new Version deny.
- **Close the gaps through placement,** for example by letting the `VirtualNetwork` tag cover every Zone, or by letting a Retired NSG pass outbound traffic to the Internal address space. Rejected for now. It removes some gaps, but legacy NSGs and Inherited defaults still need the order, and it changes behaviour that ADR 0011 decided.
- **An interim content only for the Change sets that cannot be ordered.** Rejected. These are rare, and splitting the Change set needs no second algorithm.
- **An admin override for Change sets that cannot be ordered.** Rejected. An Emergency Commit of the closing part is the way out, as before.
- **ASG membership changes and Rule changes in separate Commits.** Rejected. Most Change sets that change members are safe in three steps.
- **Member IPs in the NSGs while membership changes.** Rejected. It costs two writes per NSG and runs into the address limits per side.

## Consequences

- Most Deployments write each NSG once, in any order. The Preview shows the edges and the number of steps.
- In a Terraform Environment a Deployment is one pull request when its plan has no edges and no member steps. Otherwise each step of the order is its own pull request, opened after Azure shows the previous target. The repository's HCL needs no `depends_on` for this.
- The first Commit to an NSG adopted in place has the legacy NSG as its Deployed state. Its gaps put the onboarded Zone's NSG before the NSGs of Zones that reach it. The interim content through the Import mapping of ADR 0011 is no longer needed.
- The engine computes gaps, edges and member steps as pure functions of the Deployed state and the target. They depend on Azure state such as ASG members, like the NSG contents do.
- Deployed state that is itself a mix of Versions is fine: each Deployment bounds what a state allows by the Deployed state and the target, so no state allows a flow that every Version involved denies.
- The guarantee still assumes that one NSG PUT and one network interface write each take effect as a whole. [Task: Empirical checks of undocumented Azure behaviour](https://github.com/mfgAkilae/nsgfw/issues/24) checks the NSG PUT. The prototype modelled one ASG object; a network interface in several ASG objects changes several memberships in one write, which the classification must take as one change.
