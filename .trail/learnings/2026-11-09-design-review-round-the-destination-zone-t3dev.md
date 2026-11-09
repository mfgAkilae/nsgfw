---
title: "Design review round: the destination Zone decides a flow, and the Tighten and Loosen phases are under review"
author: T3dev
date: 2026-11-09
branch: main
cost: { minutes: 1, tokens: 2471 }
id: l-65c90d71
scope: repo
status: active
src: agent
touches:
  - docs/adr/0009-tighten-then-loosen-deployments.md
  - docs/adr/0004-place-rules-by-coverage.md
  - GLOSSARY.md
---

An independent review of the design package ran before the engine prototype. The map owner decided every finding in one grilling round (issue 27). ADRs 0016 and 0017 hold the detail.

## Decided

- Every Zone has an Egress posture. Destination-enforced is the default: outbound to the Internal address space (an instance-wide prefix list) is open, and the inbound NSG rules of the destination Zone decide. Strict is the old behaviour, per Zone.
- Deny Rules land on both sides, like allow Rules.
- A Zone can carry Extra prefixes, and an IP or CIDR object can carry a VNet binding.

## Tried and ruled out

- Deny-all outbound on every Zone with Rules on both Coverages: a Rule with a broad source puts one outbound NSG rule into every Managed NSG, so one instance holds at most about 2,000 such Rules.
- One-sided deny Rules: they change sides when edited, which is the only reason for the Tighten and Loosen phases.
- Coverage from subnet prefixes only: an AKS overlay pod range covered no Zone, so no Rule could allow pod traffic.

## Watch out

- ADR 0009 is still accepted. It is replaced only if the engine prototype shows, with worked examples, that the order of writes no longer matters. Do that check first, before building interim contents or holds.
- An allow NSG rule must stay on a destination-enforced Zone when a deny NSG rule below it overlaps it. Leaving it out would block traffic that the Rule base allows.
- The current limits are 2,000 rules per NSG and 6,000 addresses per side (checked 2026-11-09). The older 1,000 and 4,000 are out of date.
- The brief stays verbatim. The map's Notes record the two brief decisions that were reopened.

In the code: docs/adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md, docs/adr/0017-extra-prefixes-and-vnet-bindings.md, the review note at the top of docs/adr/0009-tighten-then-loosen-deployments.md, and the new terms in GLOSSARY.md.
