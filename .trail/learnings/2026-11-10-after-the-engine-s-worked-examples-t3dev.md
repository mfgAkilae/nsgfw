---
title: "After the engine's worked examples, IPv6 ULA counts as internal, ASG member deletions and IP changes adopt on their own, and a member move becomes two writes"
author: T3dev
date: 2026-11-10
branch: wayfinder/issue-22-docs
id: l-534533d4
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0005-stable-nsg-rule-identity.md
  - docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md
  - docs/adr/0008-approval-by-affected-zones.md
  - docs/adr/0011-import-preserves-behaviour.md
  - docs/adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md
  - docs/adr/0017-extra-prefixes-and-vnet-bindings.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/architecture.md
---

46 worked examples of the Translation engine (issue 22) showed where the decided rules surprise. The map owner decided each point on 2026-11-10. The ADRs listed below hold the detail.

## Decided

- The default Internal address space also holds fc00::/7. Without it, IPv6 between dual-stack Zones behaves as if every Zone were strict.
- A deleted ASG member leaves every Rule of its object on its own, deny Rules included. A changed member IP is adopted on its own too. The tool keeps one IP list per object, so it cannot take an IP out of the allow Rules only.
- A member change that fits neither write-order step is split into two writes on the same network interface: leave ASGs first, join ASGs last.
- Import binds a new IP or CIDR object to the Zone's VNet and its peered VNets when the prefix also matches Zones in unconnected VNets.
- An Egress posture or Inherited defaults change affects only its Zone. An Internal address space change is a Change set that affects every destination-enforced Zone.
- The egress allow sits at 4094 (IPv4) and 4095 (IPv6), next to the Inherited defaults at 4090/4091. New NSG rules of an existing Rule take the free numbers next to their siblings.
- For Crossing flows the engine assumes only documented tag facts: own and directly peered VNets are inside VirtualNetwork and outside Internet. Every other tag is evaluated both ways.
- Imported Zones stay destination-enforced, although that opens outbound traffic to Internal addresses outside the old VirtualNetwork tag. A warning Import note lists it.

## Tried and ruled out

- Failing validation for every member change that fits neither step: moving a VM between ASG objects would always need two Commits.
- Approval for a changed member IP: inside the ASG's VNet the reference follows the network interface without Approval anyway.
- Assuming private addresses are never in Azure service tags: it was undocumented.
- Growing the rebalance window by neighbouring NSG rules: it spread far too widely. The window grows as a priority range, doubling until it is at most half occupied.

## Watch out

- "any" as a destination covers every Zone, so "web → any https" opens web to every Zone. A Rule between two Zones with the same Extra prefix also matches the destination's own pods.
- Tags count as overlapping at Import, which adds harmless "deny first" constraints.

In the code: docs/adr/0005, 0006, 0008, 0011, 0016, 0017, 0018, GLOSSARY.md and docs/design/architecture.md; the prototype is on the branch prototype/translation-engine-worked-examples (prototypes/translation-engine-worked-examples: worked-examples.html, engine.js, examples.js, run.mjs).
