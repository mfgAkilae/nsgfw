---
title: "Azure applies one NSG PUT as a whole, but Succeeded is not a data-plane barrier and one NIC write that swaps ASGs is not applied as a whole"
author: T3dev
date: 2026-11-10
branch: main
cost: { minutes: 1, tokens: 3022 }
id: l-8fceeee8
scope: repo
status: active
src: agent
touches:
  - docs/adr/0018-write-order-from-dominance-gaps.md
---

Measured on 2026-11-10 in the test subscription (issue 24): 60 NSG swaps and 60 NIC ASG swaps with TCP probes every 20 ms per port.

## Decided

- Priority uniqueness is per direction. One NSG PUT can swap, rotate and shift priorities. Collisions are rejected synchronously with 400 SecurityRuleConflict.
- One whole-NSG PUT switched old to new rules as a whole (0 of 60 observations had both ports open, up to 302 rules). Rejected PUTs (duplicate priority, bad prefix, missing or foreign-region ASG, over 2,000 rules) all failed synchronously and applied nothing.

## Tried and ruled out

- Treating Succeeded as "in effect": traffic that an NSG write closed still passed up to 0.22 s after Succeeded, 0.75 s for NIC writes. One NIC PUT reported Succeeded 11 s after its data-plane effect.
- Assuming one NIC write is atomic: a PUT that replaced one ASG with another left the IP configuration in both ASGs or in neither for 0.27 to 0.44 s in 14 of 60 swaps. "Neither" can fall through to rules without ASGs.

## Watch out

- These facts break two assumptions of the write order (ADR 0018). The decision on settle time and on splitting membership writes belongs to a design ticket, not to the engine code.
- The probe sees a port opening up to 0.12 s late, so "both closed" gaps under 0.15 s mean nothing.

In the code: docs/adr/0018-write-order-from-dominance-gaps.md (the assumptions); evidence in docs/research/empirical-checks.md and docs/research/empirical-checks/results/ on the branch research/empirical-checks.
