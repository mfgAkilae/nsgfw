# An engine upgrade is a Re-translation that approvers cannot reject

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). First decided on 2026-11-10 in [Grilling: Operations: restore, exit, upgrades and exposure](https://github.com/mfgAkilae/nsgfw/issues/29) and [Prototype: Change set review, conflicts and Version history](https://github.com/mfgAkilae/nsgfw/issues/36).

Every Version stores the version of the Translation engine that generated its NSG rules, and one image holds one engine version. An upgrade of the tool can change what the engine writes for an unchanged Rule base. The next unrelated Commit would then change NSGs that nobody decided on and no approver saw.

We decided:

- **An upgrade that changes the engine's output produces a Re-translation.** It is a Change set that the tool prepares. It holds no edits, only the new output, and its Affected Zones are the Zones whose resources it changes. Admins and the approvers of those Zones get an alert.
- **Other Commits wait while it is open,** but only in the Environments where the Re-translation changes something. Other Change sets can still be edited, submitted and approved there, and Commits that change only other Environments go ahead. A Commit behind an open Re-translation waits in line. It runs right after the Re-translation commits, with a Rebase, validation and the pre-checks, like a scheduled Commit; if one of them fails, the Change set stays Approved.
- **Some Commits take it along:** an Emergency Commit, the tool's own Commit that disables an expired allow Rule, and an automatic Adopt. The Re-translation's Affected Zones in those Environments then need Approval afterwards, as for an Emergency Commit.
- **An approver cannot reject a Re-translation.** A rejection would hold back the Commits in its Environments for good, because the tool prepares the same Re-translation again. Whoever disagrees asks the operator to go back to the previous image.
- **The tool commits it once its Approval is complete.** At the Approval level none it does not commit on its own: it waits in the inbox until a person who holds the editor Role in every Affected Zone commits it.
- **Other Previews compare with the base Version as the new engine translates it.** They show only their own changes and stay the same at the Rebase.

## Considered Options

- **Changing the NSGs with the next Commit.** Rejected. NSGs would change without Approval.
- **The next Commit carries the Re-translation with all its Approvals.** Rejected. An unrelated change would suddenly need many approvers ([architecture](../design/architecture.md#engine-upgrades)).
- **A Re-translation that keeps every decision needs no Approval.** Rejected. It needs an equivalence check over all flows.

## Consequences

- An upgrade can hold back ordinary Commits in the Environments it changes, until the Approvals of the Re-translation are complete, or at the level none until a person commits it.
- A disagreement with a Re-translation is settled outside the tool: the operator goes back to the previous image.
- A Change set that holds only Folder edits never waits for an open Re-translation ([ADR 0021](0021-folders-are-layout-outside-approval-and-rule-conflicts.md)).
- A Commit queued behind a Re-translation is stored with the Change set, like a schedule.
