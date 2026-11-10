---
title: "The console shows access, audit, health and settings under one Admin entry, keeps global Rule numbers under the read filter and makes viewers read-only"
author: MfgAkilae
date: 2026-11-10
branch: wayfinder/38-access-audit-settings-health
id: l-8881460c
scope: repo
status: active
src: agent
touches:
  - docs/design/console.md
  - docs/adr/0012-access-follows-coverage.md
---

## Decided
The map owner decided on 2026-11-10, in Prototype: Access, audit, settings and health views (issue 38), before the prototype was built:
- One Admin entry in the rail with a sub-navigation (Setup, Access, Audit log, Health, Environments, Instance, Alert channel). Each part shows only to the Roles that may use it; someone who may only read sees just the audit log, so the entry reads "Audit". A dot on the entry reports Health.
- Access is a Scope tree with a detail per Scope: its Approval level (effective, where it comes from) and its Role assignments, plus a check of one principal's Role; a second tab lists every assignment flat.
- Under the read filter by Coverage (ADR 0012), Rule numbers stay global, so gaps show; one hint line says how many of all Rules the person sees. No markers at the gaps.
- A person without the editor Role in any Scope gets a read-only console (no edit affordances at all). An editor sees Commit and Emergency Commit locked, with the reason in the commit bar. If the server still refuses, a dialog names the Role, the Scope and what the person holds.
- Step-up asks only on click, with a lock on the buttons that will ask; the action continues after the new sign-in.
- Health: one status per check, then only the problems, grouped by the missing action.
- Setup: a checklist page for an instance admin that stays until done; each step opens the normal settings page.

## Tried and ruled out
- Audit as its own rail entry, or four rail entries: the rail would grow for pages people use rarely.
- A flat assignment table only, or variants: the Scope tree carries both Roles and Approval levels, which hang on the same Scopes.
- Gap markers ("12 Rules outside your Scopes") cost a row per gap; local renumbering makes numbers differ between people.
- All buttons active with a message on click: every attempt would be audited as a denied action. Hiding everything: nobody learns why a button is missing.
- A health matrix: weak at Zone detail. A one-time setup wizard: a second UI for the same settings.
- A banner that warns ahead of step-up: interrupts people who are not about to approve.

## Watch out
- Open for the map owner after the first pass: German Role names (Leser, Bearbeiter, Freigebender, Admin), an "access contact" instance setting on the no-access page, step-up also for Approval-level changes, and the Zone overview filtered to the person's Scopes.

In the code: docs/design/console.md (section "Not covered yet" lists this ticket; the decisions go there), docs/adr/0012-access-follows-coverage.md (the read filter). The prototype is on branch prototype/console-ui-38 under prototypes/console-ui/src (Admin.tsx, AccessPage.tsx, AuditPage.tsx, SettingsPages.tsx, session.tsx).
