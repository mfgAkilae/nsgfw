---
title: "Private endpoints are carried by their IPs and never written into ASGs, and an ASG member is a whole network interface"
author: T3dev
date: 2026-11-10
branch: wayfinder/39-asg-membership-private-endpoints
id: l-30c83813
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0006-asg-objects-one-managed-asg-per-vnet.md
  - docs/adr/0014-operator-grants-azure-roles-tool-verifies.md
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/design/architecture.md
  - docs/design/console.md
  - docs/design/translation-engine.md
---

## Decided
- The map owner decided on 2026-11-10 (issue 39) that the tool never writes private endpoint ASG membership. Private endpoint members of an ASG object reach every NSG as IPs through the IP fallback, also inside their VNet. Reason: an ASG-only write on an automatically approved private endpoint needs `privateEndpointConnectionsApproval/action` on the linked resource (empirical check T9), a right on other teams' resources that would also let the tool approve new connections to them.
- A membership atom is one network interface joining or leaving one Managed ASG, written on all its IP configurations at once: Azure rejects a NIC whose IP configurations reference different ASGs (undocumented). The combination test stays exact because a flow touches one IP of the NIC.
- Every Zone that holds at least one private endpoint gets the IP fallback for all ASG objects and External ASG objects, so Microsoft's 50-members-per-ASG limit on private endpoint subnets is never reached. The first or last private endpoint in a subnet switches the NSG content without changing a flow, and the tool adopts that on its own.
- An Unmanaged ASG that holds a private endpoint cannot be adopted in place; Import offers it as an External ASG object.
## Tried and ruled out
- Approval right in nsgfw ASG Writer; only auto-approved endpoints by IP; forbidding auto-approved endpoints; IP configurations as atoms; the 50 limit as a blocking ASG limit or as a threshold switch (External ASGs grow past it outside any Change set).
## Watch out
- Whether Azure accepts ASGs on IPv6 IP configurations is open and checked before the design review (issue 41). It may overturn the Terraform mode decision that the azurerm NIC-ASG association writes IPv4 IP configurations only.
In the code: docs/adr/0006, 0014, 0018 amendments; docs/design/translation-engine.md Step 3, Step 9 limits, Step 10, member steps; docs/design/architecture.md ASG Writer table; docs/design/console.md ASG object editor.
