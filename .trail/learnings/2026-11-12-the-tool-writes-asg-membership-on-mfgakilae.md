---
title: The tool writes ASG membership on IPv4 IP configurations only; IPv6 addresses always go through the IP fallback
author: MfgAkilae
date: 2026-11-12
branch: wayfinder/42-ipv6-asg
cost: { minutes: 9, tokens: 86299 }
id: l-18178b82
scope: repo
status: active
src: agent
touches:
  - docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/translation-engine.md
  - GLOSSARY.md
---

## Decided
- The map owner decided on 2026-11-12 (issue 42) that ARM mode writes Managed ASGs on the IPv4 IP configurations only, like Terraform mode. A member's IPv6 addresses go through the IP fallback on every NSG, also inside the ASG's VNet, so an ASG reference stands for IPv4 only and both modes translate the same Rule base the same way.
- External ASG objects: a network interface is a member when its IPv4 IP configuration is in the Unmanaged ASG, whatever its IPv6 IP configuration holds. One that is in the ASG only through IPv6 is no member and gets a warning, because the reference still matches its IPv6 address.
- Where the reference already lets a new member in over IPv4 without Approval (inside the ASG's VNet, on a Zone without a private endpoint), the tool adopts its IPv6 addresses on its own, so dual-stack autoscaling needs no Approval per node.
- An Unmanaged ASG that holds an IPv6 IP configuration cannot be adopted in place; Import offers it as an External ASG object. A Managed ASG found on an IPv6 IP configuration is Drift, resolved by Overwrite only, with a Preview warning that the leave may take effect late.

## Tried and ruled out
- Managed ASGs on every IP configuration: an IPv6 leave stayed in the effective rules for 150 s until IPv4 left too (T10), so member steps could wait for a leave that never applies, and ARM and Terraform output would differ.
- External ASG objects mirroring Azure per IP configuration: IPv6 reachability would hang on how another team's IaC sets the IPv6 IP configuration.
- Adopting an ASG with IPv6 members and taking them out (needs an unproven IPv6 leave and a special order) or leaving them in (the reference keeps allowing IPv6 after the NIC leaves the object).

## Watch out
- The tool's network interface write must send the IPv6 IP configurations back with the ASGs they hold.
- Microsoft documents that one NSG rule cannot mix IPv4 and IPv6, so the prototype key engine-version shows only the mechanics of a Re-translation, not a possible engine change.

In the code: docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md, docs/adr/0018-write-order-from-dominance-gaps.md, docs/design/translation-engine.md (Step 3 IP fallback, dual-stack special case, Step 10, member steps, Engine version, Open points), GLOSSARY.md (External ASG object, ASG member, Managed ASG).
