---
title: "Azure swaps a subnet's NSG as a whole, but an ASG write on an automatically approved private endpoint needs the approval right on the target, and all IP config…"
author: MfgAkilae
date: 2026-11-10
branch: research/empirical-checks
id: l-f03e1706
scope: repo
status: active
src: agent
touches:
  - docs/research/empirical-checks.md
  - docs/research/empirical-checks/checker.py
  - docs/research/empirical-checks/run.py
---

## Decided
Measured on 2026-11-10 (North Europe, B1s, 30 swaps per series):
- One subnet PUT that swaps the NSG: the subnet never stood without an NSG (0 connects on a port both NSGs deny, about 62,000 probes at 10 ms), source and destination side. Effect 0.07 to 0.74 s after `Succeeded`. ADR 0003's one-write swap holds; no fog entry needed.
- Private endpoint ASG swap: LRO 13 s to 143 s, effect about 10 s after the PUT response and always before `Succeeded`. One of 30 swaps was in both ASGs for 0.37 s.
- An ASG-only PUT on a private endpoint whose connection was approved automatically fails with 403 `LinkedAuthorizationFailed` unless the writer holds `<provider>/<type>/privateEndpointConnectionsApproval/action` on the target resource. Manual connections, approved or pending, need network rights only. Undocumented.
- Azure rejects a NIC whose IP configurations reference different ASG sets (`AllIpConfigurationsOnANicMustBelongToTheSameApplicationSecurityGroups`). Undocumented. An ASG member is a whole NIC.
- Documented: more than 50 IP configurations per ASG on a private endpoint subnet's NSG may cause connection failures.

## Watch out
`nsgfw ASG Writer` (ADR 0014) lacks the approval actions, and ADR 0018 calls one IP configuration an atom. Both went to a grilling ticket before the design review.

In the code: docs/research/empirical-checks.md (T7, T8, T9 and the two ASG sections), results 20261110-083643 and 20261110-085103.
