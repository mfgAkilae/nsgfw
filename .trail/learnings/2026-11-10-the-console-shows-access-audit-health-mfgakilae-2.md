---
title: "The console shows access, audit, health and settings under one Admin entry, keeps global Rule numbers under the read filter and makes viewers read-only"
author: MfgAkilae
date: 2026-11-10
branch: wayfinder/38-access-audit-settings-health
id: l-5ba23a38
scope: repo
status: active
replaces: l-8881460c
src: agent
touches:
  - docs/design/console.md
  - docs/adr/0012-access-follows-coverage.md
---

## Decided
The map owner decided on 2026-11-10 in Prototype: Access, audit, settings and health views (issue 38):
- One Admin entry in the rail (Setup, Access, Audit log, Health, Environments, Instance, Alert channel), each part only for the Roles that may use it; a person who may only read sees just the audit log, and the entry reads "Audit". Access stays admin-only; others see their own Roles in the avatar menu.
- Access is a Scope tree with each Scope's Approval level and Role assignments, plus a check of one principal's Role.
- Under the read filter (ADR 0012) Rule numbers stay global, so gaps show; one hint line says how many Rules the person sees. The Zone overview lists only Zones in the person's Scopes; Zone names stay in the object picker for all.
- No editor Role anywhere: a read-only console. Editors see Commit and Emergency Commit locked with the reason in the commit bar.
- Step-up asks only on click and now also covers changes of an Approval level, besides Approval, Emergency Commit and Role assignments.
- Health: one status per check, then the problems grouped by missing action. Setup: a checklist until done.
- The no-access page names an access contact, a new instance setting. German Role names: Leser, Bearbeiter, Freigebender, Admin.

## Tried and ruled out
- Audit or every part as its own rail entry: the rail grows for rarely used pages.
- Gap markers in the Rule base cost a row per gap; local renumbering makes numbers differ between people.
- Active buttons with a message on click audit every attempt as denied; hidden buttons explain nothing.
- Listing the instance admins on the no-access page shows names to everyone in the tenant.

In the code: docs/design/console.md (its "Not covered yet" names this ticket), docs/adr/0012-access-follows-coverage.md. Prototype on branch prototype/console-ui-38, prototypes/console-ui/src (Admin.tsx, AccessPage.tsx, AuditPage.tsx, SettingsPages.tsx, session.tsx).
