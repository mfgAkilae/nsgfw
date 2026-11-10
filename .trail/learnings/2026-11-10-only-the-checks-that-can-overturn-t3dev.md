---
title: Only the checks that can overturn the write order run before the design review; everything else becomes a nightly integration test
author: T3dev
date: 2026-11-10
branch: prototype/translation-engine-worked-examples
cost: { minutes: 1, tokens: 3158 }
id: l-e946f956
scope: repo
status: active
src: agent
touches:
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - docs/adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md
---

The empirical-checks task (issue 24) listed about 60 open Azure behaviours. The map owner decided on 2026-11-10 to run only the ones without a fallback in the design.

## Decided

- Run now: priority uniqueness and swaps in one NSG PUT, one NSG PUT taking effect as a whole, a failed NSG PUT applying nothing, the data-plane effect time after the long-running operation reports Succeeded, one network interface PUT for ASG membership taking effect as a whole (all four are assumptions of ADR 0018), and MSAL Node with a managed identity as federated credential (ADR 0013 asks for it before the increment plan).
- Everything else keeps its conservative default and goes to the backlog as a nightly integration test. A test result may only enable behaviour that has a nightly test and a fallback (map Notes).
- The agent runs the checks itself with a service principal that has Owner on a dedicated test subscription only. The human provides the credential through a private secret card, never in chat or in the repo.

## Tried and ruled out

- Running all 60 checks before the review: several sessions, flow-log and AKS costs, and no result could change the design package.
- Bastion for VM access: billed hourly from deployment until deletion whether used or not (Basic 0.17 EUR/h, about 125 EUR a month if forgotten). Run Command reaches the VMs with no inbound access and has no price meter.
- West Europe: the test subscription gets RequestDisallowedByAzure ("not accepting new customers"). Standard_B2ats_v2: the subscription has 0 cores of Basv2 quota.

## Watch out

- The test subscription allows North Europe, Sweden Central, Germany West Central, France Central and UK South, with 10 cores per VM family (BS family works).
- Error messages and LRO URLs contain the subscription ID. Redact before anything goes into docs or tickets (public repo).

In the code: docs/adr/0018-write-order-from-dominance-gaps.md (the assumptions under test), docs/adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md (the MSAL check); the scripts docs/research/empirical-checks/run.py and checker.py live on the branch research/empirical-checks (defaults --location northeurope --vm-size Standard_B1s).
