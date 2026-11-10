---
title: Write-order edges cross Environments and point at the other NSG; a Deployment that waits only for another Environment releases its lease
author: T3dev
date: 2026-11-10
branch: wayfinder/40-crossing-flows-between-environments
id: l-6735e751
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/architecture.md
  - docs/design/console.md
  - docs/design/translation-engine.md
---

## Decided
- The map owner decided on 2026-11-10 in Grilling: Crossing flows between Environments (issue 40) that Crossing-flow edges and ASG member-step boundaries order writes across Environments. A Commit still starts one Deployment per Environment with its own result; a write waits for another Environment's write (Succeeded, or Azure shows the Terraform step) plus the Settle time.
- The engine compares every pair of Zones whose NSGs differ between the Deployed state and the latest Version, in every Environment, also where the Commit changes nothing. Reason: Version 1290 opens a flow in Production (Deployment unfinished), 1291 closes it in Non-production only; supersede works only inside one Environment, so without this the flow opens for a moment.
- An edge into another Environment points at the NSG, not at a Deployment. Every Commit plans again the edges of unfinished Deployments in other Environments (they keep Version and writes; the view notes it), after the writes in flight on the paired NSGs end.
- A failure or Drift stop on the other side leaves the write waiting: no time limit, no override. A Deployment that waits only for other Environments takes the state "waiting", releases the Environment write lease, resumes on its own and waits the full Settle time.
- A member-step boundary holds back only NSG writes in the VNet of the step's network interfaces (NSG rules there reference the ASG) and writes that change a flow of their IPs. In other VNets, and so other Environments, the IP test is exact.

## Tried and ruled out
- Edges only inside one Environment (cross-Environment crossing not orderable): the second Commit waits until the first is deployed, and closing or Emergency Commits fail while another Environment has a crossing unfinished Deployment.
- Ordering whole Environments: waits for whole Deployments and creates false cycles.
- Holding the lease while waiting: a Terraform pull request can take days and automatic Overwrite would stall.
- The IP test alone inside the network interface's own VNet: an added deny above an existing allow for the ASG lets a join open a flow for a moment.

## Watch out
- Before this decision every NSG write sat between the member steps; one failed NIC write would have held back every NSG write of the Commit, also in other Environments.

In the code: docs/adr/0018-write-order-from-dominance-gaps.md (amendment), docs/design/translation-engine.md "Plan: the write order", docs/design/architecture.md "Edges across Environments", docs/design/console.md "The Deployment view".
