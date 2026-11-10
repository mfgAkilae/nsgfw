---
title: "A write that waits for another waits a Settle time after Succeeded, and ASG membership is planned as single joins and leaves that Azure may apply in any combin…"
author: T3dev
date: 2026-11-10
branch: wayfinder/32-settle-time-and-membership-atoms
id: l-3d4cc2b1
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/architecture.md
  - docs/design/translation-engine.md
---

## Decided
- Writes behind a Crossing-flow edge or a member-step boundary start a Settle time after the earlier write reports Succeeded (Terraform: after Azure shows the previous step's target). Instance setting, 10 s by default. Dependency edges (ASG before reference, association after NSG, delete after last leave) wait for Succeeded only, because they concern the control plane. After a crash the full Settle time starts again.
- Membership is planned as atoms: one IP configuration or private endpoint joining or leaving one ASG. An atom goes into the first member step if, applied alone, it only closes under the Deployed NSG contents; every other atom goes last. Every combination of a step's atoms, across parallel writes on different network interfaces too, must pass the step's test, otherwise validation fails. At most two writes per network interface or private endpoint.
- Private endpoints get the same treatment whatever a measurement shows. The nightly test re-measures T1 to T5, subnet swaps and private endpoints, and fails when a lag exceeds half the Settle time.

## Tried and ruled out
- Succeeded as barrier: closed traffic still passed 0.22 s (NSG) and 0.75 s (NIC) after it. Effective security rules and IP flow verify read the configuration, not the data plane.
- One atom per write: parallel writes on different network interfaces still combine, so the combination test is needed anyway.
- Fixed leave-first, join-last: a move between two ASG objects that both deny opens traffic in the "in neither" interim. By own effect, leave-first still comes out in the common case.

## Watch out
- The worked-examples prototype classifies each network interface's change as a whole with the others at their Deployed members. That misses combinations: deny src ASG A (100), deny dst ASG B (110), allow (200); p leaves A and q leaves B in parallel; each alone keeps the flow closed, both together open it.
- A subnet write that swaps the NSG is not measured. If Azure detaches before it attaches, the subnet is briefly open and no order helps. Issue 33 measures it before the design review.

In the code: docs/adr/0018-write-order-from-dominance-gaps.md (member steps, Settle time bullets, consequences); docs/design/translation-engine.md "Plan: the write order" and Example 13; docs/design/architecture.md Deployment section; GLOSSARY.md "Settle time".
