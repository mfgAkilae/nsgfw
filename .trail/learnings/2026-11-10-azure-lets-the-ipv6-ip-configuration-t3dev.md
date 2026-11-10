---
title: "Azure lets the IPv6 IP configuration of a network interface carry other ASGs, but an IPv6 leave stays in the effective rules"
author: T3dev
date: 2026-11-10
id: l-55d26e68
scope: repo
status: active
src: agent
touches:
  - docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
---

Measured on 2026-11-10 in the test subscription (issue 41, T10): one dual-stack network interface, control-plane writes only.

## Decided
- Azure accepts the IPv6 IP configuration with no ASG, the same ASGs or other ASGs than the IPv4 one. The "all IP configurations reference the same ASGs" rejection (issue 33) holds within IPv4 only.
- The azurerm NIC–ASG association (5.13.0) writes the IPv4 IP configurations only and applies cleanly on a dual-stack network interface, so point 13 of the Terraform mode workflow (IPv6 addresses through the IP fallback) stands.
- Microsoft documents that one NSG rule cannot combine IPv4 and IPv6 prefixes (IPv6 overview, Limitations), so the engine keeps one address family per NSG rule without a nightly test.

## Tried and ruled out
- Reading ASG membership from the effective security rules: after an IPv6 leave the view kept the IPv6 membership for 150 s in 3 of 3 tries, although the GET of the network interface no longer showed it. It cleared only when the IPv4 IP configuration left the same ASG. Use the GET, not the effective view, as the source of membership.

## Watch out
- Whether an IPv6 leave takes effect on the data plane is untested. If it behaves like the effective view, a leave on an IPv6 IP configuration does not take effect within any Settle time. Whether the tool writes ASGs onto IPv6 IP configurations at all is decided in the grilling ticket on ASG membership on IPv6 IP configurations (issue 42).
- Writes that touch the IPv6 IP configuration took 6 to 8 s against 1 to 3 s for IPv4 alone.
- The effective view lists ASG rules with `0.0.0.0/0`, `::/0` or both in the plural prefix fields, depending on which IP configurations are members; the singular field shows only the first. It never lists member IPs.

In the code: docs/research/empirical-checks.md (section T10), t10.py and t10-tf/main.tf on the branch research/empirical-checks; the ADRs this touches are docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md and docs/adr/0018-write-order-from-dominance-gaps.md.
