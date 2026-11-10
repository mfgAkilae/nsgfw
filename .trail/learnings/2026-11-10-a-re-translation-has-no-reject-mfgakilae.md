---
title: "A Re-translation has no Reject, Commits queue behind it, Folder edits keep a schedule, and the Author picks how a removed Folder comes back"
author: MfgAkilae
date: 2026-11-10
branch: wayfinder/36-change-set-review
id: l-638a60ac
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md
  - docs/design/architecture.md
  - docs/design/console.md
---

## Decided

The map owner decided on 2026-11-10, while judging the console prototype for the Change set review, conflicts and Version history:

- An approver cannot reject a Re-translation. A rejection would hold back every Commit in its Environments for good, because the tool prepares the same Re-translation again. Whoever disagrees asks the operator to go back to the previous image.
- A Commit that changes an Environment with an open Re-translation is not blocked. It waits in line and runs right after the Re-translation commits, with a Rebase, validation and the pre-checks, like a scheduled Commit. If one fails, the Change set stays Approved.
- A Folder edit keeps a scheduled Commit, as it keeps the state and the Approvals (ADR 0021). Only an edit that reopens the Change set clears the schedule.
- When a Revert cannot bring a removed Folder back because its former Rules no longer stand together, the Author chooses: the Folder around the Rules that still stand together and in no other Folder, or leave it removed. Neither moves a Rule.

Layout choices from the same session: the approver decides on the Review screen; conflicts get a Rebase screen of their own; Versions is a page in the rail; the bell leads to the inbox on the Change sets page; Commit always opens a short dialog; the Emergency Commit dialog waives each deny finding with a reason prefilled from the Emergency reason.

## Tried and ruled out

- A Reject on the Re-translation with a comment: it leaves Production waiting with no way forward inside the tool.
- A Commit button that stays disabled until the Re-translation commits: the committer would have to come back by hand, although the ticket on operations said Commits "wait".
- Clearing the schedule on every edit (the first rule from the deployment grilling): a Folder edit changes no Managed NSG.

## Watch out

- The approver's Approve covers every Affected Zone where that person holds the approver Role (ADR 0008). There is no Approve per Zone, only a status per Zone.
- The pre-check runs at Submit, on demand, in the Emergency Commit dialog and before every Deployment, never on every edit. The console shows findings only after a run.

In the code: docs/design/console.md (section "After Submit"), docs/adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md, docs/design/architecture.md (Engine upgrades), GLOSSARY.md (Commit, Re-translation). Prototype: prototypes/console-ui/src/Decide.tsx, Rebase.tsx, Commit.tsx, Policy.tsx, Versions.tsx on the branch prototype/console-ui.
