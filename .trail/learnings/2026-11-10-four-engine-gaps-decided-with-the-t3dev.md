---
title: "Four engine gaps decided with the design doc: load-balancer tag as documented, stricter left-out denies, NSGs depend on ASGs in HCL, 8-character name hash"
author: T3dev
date: 2026-11-10
id: l-11ac1e42
scope: repo
status: active
src: agent
touches:
  - docs/adr/0005-stable-nsg-rule-identity.md
  - docs/adr/0010-terraform-mode-data-contract-and-azure-observation.md
  - docs/adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/architecture.md
---

The Translation engine design doc (issue 31) was written from the ADRs and the engine prototype. Four gaps showed up while writing, and the map owner decided each on 2026-11-10. ADRs 0005, 0010, 0016 and 0018 hold the detail.

## Decided

- AzureLoadBalancer counts as the documented address 168.63.129.16, so no Zone address is inside it. The two VirtualNetwork and Internet facts stay, and every other tag is still evaluated both ways.
- A deny is left out on a destination-enforced Zone only when the Zones' addresses cover its destination and no subnet that is not a Zone overlaps it, in any VNet. The same test decides "the destination reaches outside Zones" for Affected Zones.
- In the default HCL the NSG resource depends on the Managed ASG resources. This is the third rule that every replacement HCL must keep.
- NSG rule names end in 8 hex characters, not 6. Two equal names within one Rule are a validation error.

## Tried and ruled out

- AzureLoadBalancer evaluated both ways: the Platform exception sits above every Rule, so every inbound flow that no Rule allows read "depends on the tag", and Import notes listed flows as opening that cannot open.
- Leaving out a deny whenever Zone prefixes cover its destination: with 10.1.4.0/24 as a Zone in one VNet and an unmanaged subnet in an unconnected one, the flow to that subnet stayed open although the Rule base denies it. Never leaving out a deny brings back one outbound NSG rule per Zone for "deny any to Zone B".
- A pull request of its own for new Managed ASGs: one more pull request per Deployment.
- A 6-character hash: about 1 in 14,000 that a Rule with 50 NSG rules in one NSG and direction gets two equal names, which Azure rejects.

## Watch out

- The Rule base evaluation function is the evaluation of the generated NSG rules per side, mapped back to Rules through the Rule ID. It is not one first-match pass over the Rule base: tag Rules land on one side only, and a destination-enforced source leaves the decision to the destination.
- Where an unmanaged subnet reuses a Zone's prefix, a deny to that Zone lands outbound on every Zone in its source Coverage. The test is by prefix, so it also hits Rules whose destination is the Zone itself.
- The prototype puts the deletion of a Managed ASG into the first pull request step. The decided rule is the last pull request.

In the code: docs/design/translation-engine.md, docs/adr/0005, 0010, 0016 and 0018, the HCL sketch in docs/design/architecture.md; on the branch prototype/translation-engine-worked-examples, engine.js (h6, insideZones, knownTag). `node run.mjs <key>` there reproduces the tables of the doc.
