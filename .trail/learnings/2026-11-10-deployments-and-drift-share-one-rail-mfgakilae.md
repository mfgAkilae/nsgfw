---
title: "Deployments and Drift share one rail entry, onboarding with Import gets a wide screen, and the Author confirms a Handover before Submit"
author: MfgAkilae
date: 2026-11-10
branch: wayfinder/37-deployment-drift-import
id: l-77ce320f
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0011-import-preserves-behaviour.md
  - docs/adr/0019-instance-identity-in-the-database-and-recovery-mode.md
  - docs/design/architecture.md
  - docs/design/console.md
---

## Decided
- The map owner decided on 2026-11-10, in Prototype: Deployment, Drift and Import views, that the console gets one Deployments entry in the rail: a status strip per Environment, the Deployment history, and Drift as a second tab, because Drift is measured against the Deployed state.
- One wide Deployment view per Commit, with a tab per Environment: plan on the left, writes in the middle, one write on the right. In a Terraform Environment the steps are pull request cards.
- Onboarding a candidate with an existing NSG, or several candidates, opens a wide screen with three columns. A candidate without an NSG keeps the side sheet.
- With foreign-IaC evidence, the Author of the onboarding Change set confirms the Handover checklist in the Review before Submit. The Commit dialog only shows it. This settles the contradiction between the Terraform grilling ("the Commit asks the admin") and the access grilling (the Author confirms).
- Preserve behaviour off means no Inherited defaults; the constraint merge still places imported Rules.

## Tried and ruled out
- A Deployments tab on the Versions page with Drift on the Zones page: an Overwrite or a catch-up Deployment has no Version.
- Two rail entries for Deployments and Drift, a wizard for onboarding, Import inside the side sheet.

## Watch out
- Whether write-order edges cross Environments is open in its own grilling ticket (issue 40). The Deployment view shows no waits across Environments until then.

In the code: docs/design/console.md (Deployments, Drift and Import), ADR 0011 and ADR 0019 amended, GLOSSARY.md (Handover, Import snapshot, Deployment history); prototype on prototype/console-ui (Deployments.tsx, DeployView.tsx, Drift.tsx, Onboarding.tsx, ImportNote.tsx).
