---
title: Every Version records the Azure inventory it was translated against; Azure changes reach NSGs only through Adopt
author: T3dev
date: 2026-11-10
branch: wayfinder/30-server-internals
id: l-d8ab2adc
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/design/architecture.md
  - docs/design/translation-engine.md
---

## Decided
- The Preview, the Commit and the write plan translate against the Azure inventory the Version records (VNet address spaces and peerings, subnet prefixes, member IPs, External ASG object members, subscription to Environment), never live Azure. What an approver saw is what gets written.
- An observed Azure inventory per Environment is refreshed by the Drift poll (resourcechanges every 5 minutes) and the daily reconcile. A difference that changes the translation becomes an Adopt Change set; only-closing parts commit on their own.
- An open Adopt blocks no other Commit: the NSGs already in Azure have the same gap. The Preview flags the Zones.
- One Environment write lease per Environment holds the write budget in memory (Environments share no subscription), so no token counter in PostgreSQL.

## Tried and ruled out
- Live Azure at the Commit: written NSG rules could differ from the approved Preview.
- Only the Version's peerings in the write plan: a peering removed in Azure would hide a Crossing flow.

## Watch out
- The write plan is the one place where observed inventory feeds the engine: a peering counts as a documented tag fact only when the Version and the observed inventory both hold it, otherwise both ways.

In the code: docs/adr/0020-versions-record-the-azure-inventory.md; docs/design/architecture.md (Azure inventory, Job queue and jobs); docs/design/translation-engine.md (At the design target).
