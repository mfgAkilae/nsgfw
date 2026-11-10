---
title: "To watch an ASG swap on a private endpoint, tell the two ASGs apart by source IP, because NSG rules on private endpoints ignore source ports"
author: MfgAkilae
date: 2026-11-10
branch: research/empirical-checks
id: l-ae8f5ded
scope: repo
status: active
src: agent
touches:
  - docs/research/empirical-checks.md
  - docs/research/empirical-checks/run.py
  - docs/research/empirical-checks/checker.py
---

## Decided
The probe sends from two IPs of the prober VM. One NSG rule admits the first IP to the first ASG, the other rule admits the second IP to the second ASG, both on port 443. A swap of the private endpoint between the two ASGs is then visible as one source IP losing access and the other gaining it. Microsoft documents that NSG rules for traffic to a private endpoint treat the source port as `*` (private endpoint overview, Limitations, page date 2026-08-11). The page also says connection failures may occur when an ASG on the private endpoint subnet's NSG has more than 50 IP configurations. The design does not count that limit yet.

## Tried and ruled out
- Telling the ASGs apart by source port range: NSGs on private endpoints ignore it.
- Telling them apart by destination port 80 vs 443 on a blob private endpoint: Microsoft documents no port list for storage private endpoints, so port 80 is a guess.
- A Private Link Service with a load balancer in front of a VM: full port control, but more resources, cost and failure points for one check.

## Watch out
- The subnet needs `privateEndpointNetworkPolicies: Enabled`, otherwise no NSG rule applies to the private endpoint.
- The second IP must also be configured inside the VM. The run command adds it when cloud-init did not.
- A subnet PUT must leave out the read-only lists (`ipConfigurations`, `privateEndpoints` and others) when it changes only the NSG association.

In the code: docs/research/empirical-checks/checker.py (T7, T8, Prober with source-IP pairs), run.py (template: subnet pe, pe-blob, nic-a ipconfig2, nsg-swap-a/b).
