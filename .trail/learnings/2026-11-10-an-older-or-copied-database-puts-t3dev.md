---
title: "An older or copied database puts the Instance into Recovery mode, and an open Re-translation holds back only Commits in its Environments"
author: T3dev
date: 2026-11-10
id: l-641131c8
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0014-operator-grants-azure-roles-tool-verifies.md
  - docs/adr/0019-instance-identity-in-the-database-and-recovery-mode.md
  - docs/design/architecture.md
  - docs/design/translation-engine.md
---

## Decided
- The Instance ID lives in the database and travels with backups. NSGs and ASGs of another Instance are taken over through a Handover at onboarding; there is no release step at exit.
- A version tag on every Managed NSG and Managed ASG (the Version that last changed its content) shows that the database is older than Azure. A Tool identity or app registration that differs from the recorded one shows a moved or copied database (admin picks Move or Copy). Both put the Instance into Recovery mode: only InstanceAdmin signs in, no Commits, Deployments or automatic Overwrite/Adopt, ID sequences jump past Azure's highest values plus 10,000, and the audit chain continues with a recovery entry (a fork in the export).
- While a Re-translation is open, other Commits wait only in Environments where it changes something. Emergency Commits, expiry of allow Rules and automatic Adopt take it along and get Approval afterwards. Other Previews compare against the base translated by the new engine.
- Flow-data workspace outside Environments: Reader assigned on the workspace alone; log reads through the data action with a condition on NTANetAnalytics, no legacy table action.

## Tried and ruled out
- Instance ID as a Terraform variable (silent takeover, copies look like the original); a release step (fails when the old Instance is lost); detection only by an operator flag; detection through resourcechanges (keeps 14 days); rebuilding lost Rules from NSG rule names; random IDs.
- The next Commit carrying the Re-translation with all its Approvals; skipping Approval for behaviour-preserving re-translations (needs an equivalence check over all flows).

## Watch out
- Call a database recovery "recovery", never "restore": Restore is a Change set in the glossary.
- The version tag must change only when the content changes, or every Version rewrites every NSG and every Terraform root module shows a diff.
- Microsoft does not document whether Container Apps probes pass through ingress; the separate health port needs a nightly test, with status-only probes on the app port as fallback.

In the code: docs/adr/0019-instance-identity-in-the-database-and-recovery-mode.md, docs/adr/0014-operator-grants-azure-roles-tool-verifies.md (amended), docs/design/architecture.md (No self-lockout, Engine upgrades, Backup and recovery, Exit, Health endpoint, Image source), GLOSSARY.md (Instance, Handover, Recovery mode, Tool path, Re-translation).
