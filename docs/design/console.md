# Console

Status: confirmed by the map owner in [Prototype: Console UI][t25], 2026-11-10, after seven passes over a clickable prototype. It records how the console looks and behaves for the surfaces that prototype covers: the Rule base, Folders, the Change set from the first edit to Submit, the Zone overview and the object library. The prototype on the branch [`prototype/console-ui`][proto] is the primary source; it is throwaway code with mock data and is never merged. The surfaces it does not cover are listed under [Not covered yet](#not-covered-yet) with the ticket or the increment that designs each. Extended and confirmed on 2026-11-10 in [Prototype: Zone detail, Flow view and object editors][t35], in the same console: the Zone detail with the Security layers, the Flow view, the Zone settings, the object editor and the part of onboarding that ticket covers. [After Submit](#after-submit) adds what happens to a Change set once its author is done, and [Deployments, Drift and Import](#deployments-drift-and-import) what happens after the Commit, what changes outside the tool, and the way in for existing NSGs. Amended on 2026-11-12 by [Review: Grill review of the complete design package][t23]: it adds [Change set lifecycle](#change-set-lifecycle) and the behaviour decided in that review, which no prototype shows yet.

## One console

The console is one design in a light and a dark mode, in English and German. Three alternative shells were built first (a classic console, a Change set workspace, a Zone-first view) and dropped: the console keeps the Rule base as home from the first, the always visible consequence of a Change set from the second, and the Zone view from the third.

- A rail on the left: Rules, Zones, Objects, Change sets, then inbox, mode, language and a keyboard help.
- One sheet per page that holds the table.
- A side panel on demand, with two tabs: the Rule editor and the Change set.
- A commit bar at the bottom that appears with the first edit.
- A jump palette on Ctrl K that reaches every Rule (by name, number or Rule ID), every Zone and the main actions.

## Principles

- Colour carries meaning only. Green is allow, red is deny or blocking, amber is pending or needs attention, one accent colour is interaction. Everything else is neutral, in both modes.
- Shapes say what a thing is. Pills filter. Rounded rectangles are Zones and Objects, with a glyph for the kind (Zone, VNet, single IP, network, service tag, ASG object, group). Hatched, locked bands are what sits above and below the Rules.
- Flags are words, not icons: "Policy finding", "Import note", "in another Change set".
- Every main function takes one click or none. Filter chips carry counts on every page.
- The typeface keeps look-alike characters apart (0 and O, 1 and l), because a misread address opens a port. The prototype uses Atkinson Hyperlegible Next and Mono (OFL, see ADR 0002).

## Rule base

The table has the columns of the brief: number, name, source, destination, service, action, hits, comment. A row reads as a flow from left to right, and its left edge shows the action (hatched when the Rule is disabled). Under the name a second line carries the change marker, the flags, the Rule ID, the ticket and the owner. Hits show a number and a small bar, "—" where no flow data exists, "no access" where the tool cannot query the flow data (never 0), and how old the data is.

- Platform exceptions, the Intra-zone default, Inherited defaults, the Deny-all rules and the Azure default rules are locked bands above and below the Rules, in the whole Rule base and per Zone.
- Filter chips: deny, disabled, expiring, with findings, no hits, layer warnings, changed. A text filter searches name, Zones, Objects, Rule ID, ticket and owner.
- The Zone view is a lens on the Rule base: it shows the Rules that land on one Zone's Managed NSG, inbound or outbound, in Rule base order with their numbers, with the Zone's limits and its own bands. It is the Rules tab of the [Zone detail](#zone-detail).
- An overview ruler beside the table marks where changed and flagged Rules sit among all Rules and jumps there on a click.
- One Rule: buttons on the row (details, disable, clone, delete) and a context menu on right click (the same, plus new Rule below, move to top or bottom, move to a Folder, and "Rules with this Object").
- Several Rules: ticking them turns the chip row into the action row.
- Order: drag by the handle, also several ticked Rules; "Move to…" for long distances. A filtered table still allows dragging and drops next to the visible neighbour. A sorted table does not.
- Cells edit in place on a double click; source, destination and service open the object picker.

### Rule editor

The side panel edits every field of one Rule: name, allow or deny, enabled, Folder, source, destination and service with an inline object picker, ticket, owner, expiry and comment. It shows where the Rule lands in Azure, as a source side and a destination side with the reason ("the destination decides", "strict Egress posture", "Deny Rules land on both sides"), and the number of Managed NSGs and NSG rules. This is where Rule cost is shown; it is not a table column. "Before you submit" lists what to fix: the Rule allows everything, opens a management port from the Internet, lands on very many Managed NSGs, or writes nothing. `any` covers every Zone, so the editor says that an any Rule lands on every Managed NSG. A Rule warning from a Security layer shows its severity and the admin rule or NIC-level NSG behind it. The name of an Object opens it in the [object editor](#objects).

"Allows everything", "opens a management port from the Internet", "lands on very many Managed NSGs" and "writes nothing" are Rule warnings. With the mark on unused Objects in the [object library](#objects) they are the five Rule warnings of the MVP, an addition beyond the brief like Folders and the flow helpers ([Review: Grill review of the complete design package][t23]). The [engine doc](translation-engine.md#rule-warnings) defines them. The management ports and the threshold for "very many" are instance settings ([Setup and settings](#setup-and-settings)). The rest of rule analysis, shadowed and redundant Rules, stays Later.

The editor warns in four more cases:

- A deny Rule whose source and destination are both any: "the Deny-all rules already do this; this Rule keeps every allow Rule on the outbound side of every Zone". Creating it stays allowed ([ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)).
- A deny Rule that would land outbound on an Application Gateway v2 Zone: the source side says "outbound open, required by Azure" for that Zone. The engine leaves out every outbound deny NSG rule there, because Microsoft forbids outbound NSG rules on that subnet that deny outbound connectivity ([infrastructure configuration](https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure), retrieved 2026-11-12). Where the destination of the deny does not lie entirely inside Zones, the Rule gets the Rule warning "not enforced for Zone X (Application Gateway v2)". Allow Rules land outbound as usual.
- A Rule with an expiry date and an empty owner, or an owner who cannot read the Rule.
- A Rule whose expiry the tool holds back because it would close a Tool path ([Commit](#commit)).

"New Rule" creates the Rule below the selected one, in its Folder, and opens the editor with the name selected.

## Folders

Folders are new, beyond the brief. The map owner decided:

- One level, no nesting.
- A Folder carries only its name.
- A Folder edit that changes no Managed NSG needs no Approval.

It follows from the order of Rules and from the Change set model:

- A Folder is a contiguous run of Rules, and Rules may stand outside Folders, between them.
- Creating, renaming, removing a Folder and moving Rules in or out are edits in a Change set. A Change set that only does this says "Nothing changes in Azure" and "No Approval needed", commits directly and starts no Deployment. A Rule that changes its position is a move like any other; a Rule that joins or leaves a Folder at the same position is not.
- Closing a Folder is a view setting of the person, not an edit.

Decided in [Grilling: Folders in Import, Rebase and Versions][t34] ([ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)):

- Folder names are unique, and a Folder may be empty ("0 Rules").
- Moving a Folder moves each of its Rules: the Review lists them as moves, and their Affected Zones need Approval.
- A Folder edit in a submitted or approved Change set keeps its Approvals. The Commit dialog lists the Folder edits made since the Approval.
- Any editor commits a Change set that only changes Folders.
- Import creates no Folders. Imported Rules stand outside Folders unless the constraint merge forces one inside, which an info Import note says.
- With the read filter by Coverage, a person sees the Folders that hold a Rule they may read, and every empty Folder. The count on a Folder row counts only those Rules.
- Folders ship in a later stage of the MVP, after the small profile.

A Folder row shows the number of its Rules, the mix of allow and deny, and how many are changed or flagged. It renames in place, moves with its Rules by a grip, and takes Rules by drop, from the action row or from the context menu. A filter shows the matching Rules under their Folders ("44 of 801 Rules"). A sorted table has no Folders. With all Folders closed, 10,000 Rules fit on one screen.

## Change sets

An edit lands in the current Change set at once. Nobody has to start a Change set first, and there is no Save. Shaping a new Rule counts as one edit, and repeated edits of one field fold into one.

- The commit bar shows the Change set, its place in the workflow (Edit, Submit, Approval, Commit), the number of edits, the Managed NSGs that change, the write steps and the Approvals. It holds Discard, Review and the next action: "Submit for Approval", or "Commit" when no Approval is needed. A deny Policy finding or a Change set that cannot be ordered blocks the action and says so in the bar.
- Review is one wide screen before Submit: what was edited; one Rule before and after with the NSG rules it writes; and the write order (with the writes that wait for another Environment), the Approval per Environment and Affected Zones, and the Policy findings, with the action.
- The Preview shows the pinned Azure facts of the Change set: the facts of every Azure resource it references that the Azure inventory of its base Version does not hold ([ADR 0020](../adr/0020-versions-record-the-azure-inventory.md)).
- The Preview groups by Managed NSG and puts NSG rules that only get a new priority into one line. For an Application Gateway v2 Zone it says "outbound open, required by Azure" where the engine leaves out an outbound deny NSG rule, and it carries the Rule warning "not enforced for Zone X (Application Gateway v2)" ([Rule editor](#rule-editor)).
- The write order is a picture of the Crossing flows: the Managed NSG that closes a flow, then the one that opens it, and the rest "in any order". A Change set that cannot be ordered names its Crossing flows and says to split it.
- A Rule that another open Change set also changes carries the flag "in another Change set", in the table, in the editor and in the list of edits.
- The Change sets page shows first what waits for the person (Approval requests, Emergency Commits without Approval, expiring Rules, rejections), then every Change set on the workflow track.

## Change set lifecycle

Decided in [Review: Grill review of the complete design package][t23], 2026-11-12. The table gathers the rules that [Grilling: Change sets, concurrency and approval][t15], [Grilling: Deployment execution and failure handling][t16], [Grilling: Access, roles and audit][t19] and [Grilling: Policy and security-layer visibility][t21] decided, with the answers of the review. The screens behind it are in [Change sets](#change-sets) and [After Submit](#after-submit).

A Change set is Open, Submitted, Approved, Committed or Discarded. It is Approved once every Affected Zone has the Approval that its level requires. "An admin" in the table is a person with the admin Role in at least one Affected Zone.

| State | Action | Who | Result |
|---|---|---|---|
| Open | Edit | The Change set owner and the co-editors. Any editor, in any Scope, may draft any edit. | Stays Open. Every person with an edit is an Author. |
| Open | Resolve a conflict after a Rebase | An Author | Stays Open. Submit and Commit are blocked while a conflict is open. |
| Open | Submit | The Change set owner; the tool for a Change set it prepared | Submitted. A validation error, an open conflict, a deny Policy finding without a Pre-check waiver, a blocking Import note or an open Handover blocks it. |
| Open | Commit, when no Affected Zone requires an Approval | As for Commit under Approved | Committed. |
| Submitted | Approve | An approver of an Affected Zone; under four-eyes one who is not an Author | The Approval counts for every Affected Zone in which that person holds the approver Role. With the last Approval the Change set is Approved. A Change set with an open conflict cannot be approved. |
| Submitted, Approved | Reject, with a comment | An approver of an Affected Zone, until the Commit | Open. The Approvals and a schedule are cleared. A Re-translation cannot be rejected. |
| Submitted, Approved | Withdraw an Approval | The approver who gave it, until the Commit | Submitted, and a schedule is cleared. When another approver's Approval still covers the same Affected Zones, the Change set stays Approved and keeps its schedule. |
| Submitted, Approved | Edit | As under Open | Open. The Approvals are reset and a schedule is cleared. A Folder edit changes neither the state nor the Approvals nor the schedule. |
| Submitted, Approved | A pinned Azure fact changes in the observed Azure inventory before the Commit | The tool | The tool pins the new value and resets the Approval of every Affected Zone whose NSG rules change by it. That returns an Approved Change set to Submitted. |
| Submitted, Approved | Rebase after another Commit | The tool | The state stays, with three exceptions. The Approval of an Affected Zone is reset when the NSG rules written for that Zone differ in content from the Preview its approver saw. A new Affected Zone needs its own Approval. Either returns an Approved Change set to Submitted. A resolved Rule or position conflict returns the Change set to Open and resets the Approvals. |
| Approved | Commit: now, at a scheduled time, or right after an open Re-translation | An Author, the Change set owner or an admin. At the level none the committer holds the editor Role in every Affected Zone at that level. The tool for a Change set it prepared, except at the level none. | Committed: the next Version exists and its Deployments start. Roles and Approval levels are evaluated at this moment. When the Rebase, the validation or stage 1 of the pre-check fails, the Change set stays Approved, without a schedule. When an Approval is missing, it returns to Submitted. |
| Approved | Schedule, move or cancel a Commit | The committer, an Author, the Change set owner or an admin | Stays Approved, with or without the schedule. |
| Open, Submitted | Emergency Commit, with a reason | An admin in every Affected Zone whose Approval is missing | Committed. The Approval afterwards stays open per Affected Zone. |
| Open, Submitted, Approved | Grant or withdraw a Pre-check waiver | An admin | The state and the Approvals stay. The waiver survives a Rebase while the finding stays the same. |
| Open, Submitted, Approved | Add co-editors | The Change set owner | The state stays. |
| Open, Submitted, Approved | Hand over to another Change set owner | The Change set owner or an admin; for a Change set without Affected Zones, an instance admin | The state stays. The new Change set owner may submit, commit and discard. |
| Open, Submitted, Approved | Take over a Change set of the tool | Any editor who can see it. Once an approver rejected it or a Rebase left a conflict: an admin of one of its Affected Zones | That person becomes its Change set owner and an Author, and the tool stops regenerating it. The rules for the Commit still apply. |
| Open, Submitted | Dismiss a Change set of the tool that was rejected or has a conflict, with a reason | An admin of one of its Affected Zones | Discarded. The dismissal is audited, and the tool does not prepare the Change set again for the same cause. |
| Open, Submitted, Approved | Discard | The Change set owner or an admin; for a Change set without Affected Zones, an instance admin | Discarded. |
| Committed | Approve afterwards or reject, after an Emergency Commit only | An approver of an Affected Zone | The Approval afterwards counts per Affected Zone like any Approval. One rejection makes the tool prepare a Revert for normal Approval. |
| Committed | Revert this Commit, Restore to this Version | Any editor | A new Change set, Open. The Committed one never changes. |
| Discarded | None | | The end state. Nothing of it reaches a Version. |

Beside the table:

- A Change set that only changes Folders needs no Approval, and any editor commits it ([Folders](#folders)).
- A Change set without Affected Zones, other than one that only changes Folders, needs the Approval of an approver in the instance Scope at the instance default level, and "admin" then means an admin in the instance Scope. At the level none its committer holds the editor Role in the instance Scope.
- The tool submits a Change set it prepared on its own. A deny Policy finding blocks that Submit, and the admins are notified. Who commits it is in [The approver's view](#the-approvers-view). When an approver rejects it, or a Rebase leaves a conflict, it goes to the admins of its Affected Zones ([Inbox](#inbox)).

## After Submit

Decided with the map owner in [Prototype: Change set review, conflicts and Version history][t36], 2026-11-10, over the same prototype.

### The approver's view

- An approver decides on the Review screen, the same wide screen the author uses before Submit. A Change set opened from the inbox or the Change sets page shows there, and the right column then starts with "Your decision": every Environment with its Affected Zones, their Approval level and their status (approved by whom, covered by your Approval, needs another approver, you are an Author under four-eyes, not required). Each Environment opens to the list of its Zones.
- One Approve covers every Affected Zone in which the approver holds the approver Role ([ADR 0008](../adr/0008-approval-by-affected-zones.md)), so there is no Approve per Zone. Approve asks for a sign-in that is at most 15 minutes old. Reject needs a comment, returns the Change set to Open and clears its Approvals; its Authors get the comment in their inbox.
- An approver can reject, or withdraw their own Approval, until the Commit. A withdrawal returns an Approved Change set to Submitted, unless another approver's Approval still covers the same Affected Zones, and both clear a schedule. A Submitted Change set with open conflicts cannot be approved ([Change set lifecycle](#change-set-lifecycle)).
- A Rebase resets the Approval of an Affected Zone when the NSG rules that the Change set writes for that Zone differ in content from the Preview that approver saw. The Zone then needs Approval again, and "Show what changed" lists the NSG rules that differ between that Preview and the fresh one. A change of priorities or names alone does not count: the Approval stays, and a banner says that it was given against an older Preview.
- An Emergency Commit opens the same way, with its reason in a banner. "Approve afterwards" counts per Affected Zone like any Approval, so the Emergency Commit stays open until every Affected Zone has the Approval its level requires. One rejection makes the tool prepare a Revert of that Version for normal Approval, which lands in the inbox.
- At the Approval levels approver and four-eyes, the tool commits a Change set it prepared (an expired deny Rule, an Adopt that is not automatic, a Re-translation, a Revert after a rejected Emergency Commit) once its Approval is complete. At the level none it does not commit on its own: the Change set waits in the inbox until one person who holds the editor Role in every Affected Zone at the level none commits it, which an admin with that Role can do. Where its Affected Zones have several levels, each Zone follows its own level, and the tool commits on its own only when none of them is at the level none. At every level, also at none, the tool commits on its own the expiry of an allow Rule and the automatic Adopt cases that [ADR 0008](../adr/0008-approval-by-affected-zones.md) lists ([Review: Grill review of the complete design package][t23]).
- A Change set of the tool that an approver rejects goes to the inbox of the admins of its Affected Zones, because the tool is its only Author ([Inbox](#inbox)).

### Conflicts after a Rebase

- When another Commit leaves conflicts, the commit bar shows "N conflicts after the Rebase" in red, the inbox has an entry, and Submit and Commit stay blocked until every conflict is resolved.
- The Rebase screen is as wide as Review. Left: the conflicts (Rule, Object, Zone, position, Folder) and what rebased cleanly, such as a removed Folder whose Rules now stand outside every Folder. Middle: one conflict. Right: what happens to the Approvals and to the Affected Zones.
- A Rule conflict shows base, theirs (the newer Version and its committer) and yours side by side, with the changed cells marked. The Author takes theirs, keeps their own Rule as a whole, or starts from theirs and applies the own change again; a result column shows the outcome. Fields never merge one by one.
- A position conflict shows the rebased Rule base around the Rule twice: once with the Rule above the overlapping Rule with the other action, once below it, each with what that order means for the traffic. The Author picks one.
- A Folder conflict shows the names on both sides; the Author takes one of them or types another.
- A resolution that moves no Rule keeps the Approvals; a resolved Rule or position conflict resets them ([ADR 0007](../adr/0007-isolated-change-sets-with-optimistic-rebase.md), [ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)). The screen names the Affected Zones that are new after the Rebase and need their own Approval; a new Affected Zone returns an Approved Change set to Submitted.
- A Rebase without conflicts also resets the Approval of every Affected Zone whose NSG rules now differ in content from the Preview its approver saw, and the right column names those Zones. New priorities or names alone reset nothing ([The approver's view](#the-approvers-view)).
- A Change set of the tool with a conflict goes to the inbox of the admins of its Affected Zones, who take it over or dismiss it with a reason ([Inbox](#inbox)).

### Policy findings and Pre-check waivers

- The pre-check runs at Submit, on demand, when the Emergency Commit dialog opens and before every Deployment, not on every edit. At and after the Commit it runs in two stages ([The Deployment view](#the-deployment-view)). The Policy findings section says when it last ran and whether the Change set changed since. A deny finding stops Submit and opens the section.
- The section lists the deny findings that block Submit and Commit first, then the waived ones, then information (audit and modify, which never block). Deny findings that Azure does not enforce here fold away below, marked "not enforced" (enforcement mode or `notScopes`) or "exempt" (with the exemption and its end date).
- Each finding names the assignment and where it is assigned, its message, the Managed NSG, Zone and Environment, and the Rule ("Rule X violates it on Zone Z"), or the resource where no Rule maps.
- After a run, the Rule editor lists its Rule's findings under "Before you submit".
- "Waive…" on a blocking finding (admins of at least one Affected Zone only) opens the Pre-check waiver dialog: the finding, the resource, the Change set, what a waiver does, and a mandatory reason. A waived finding shows who waived it and why, and the waiver can be withdrawn.

### Commit

- Commit always opens a short dialog. It shows what goes out per Environment (written directly in ARM mode, one pull request per write step in Terraform mode, or no Deployment when no Managed NSG changes, and how many writes wait for another Environment); when (now, or at a date and time in the Instance's time zone); the Approvals with who gave them and when; what changed since the Approval (Preview differences after a clean Rebase, and the Folder edits made since); the Pre-check waivers in force; and, when the Change set closes a Tool path, the paths with a mandatory reason. Submit asks for that reason too.
- A scheduled Commit shows in the commit bar with Move and Cancel. An edit that reopens the Change set clears the schedule, and so does a rejection or a withdrawn Approval. A Folder edit keeps it, as it keeps the Approvals.
- Roles and Approval levels are evaluated at the Commit, not at the Approval and not when the Commit was scheduled. An Approval counts only for the Zones in which its giver holds the approver Role at that moment, and the level that counts is the one in force then. For a scheduled Commit, or one that waits for a Re-translation, the person who scheduled it must hold the needed Roles when it runs. When something is missing, the Commit does not run: the Change set stays Approved, or returns to Submitted when an Approval is missing, loses its schedule and names what is missing.
- A Commit of the tool (a Rule expiry, an automatic Adopt) never closes a Tool path, because nobody confirms it. The tool holds that one Rule or member change back, alerts the admins and the Rule owner with high severity, and [Health](#health) lists it. A person then commits it with the usual confirmation and reason.
- While a Re-translation is open in an Environment that the Change set changes, the dialog says so and offers "Commit after the Re-translation". The Commit then waits in line and runs right after the Re-translation commits, with a Rebase, validation and the pre-check, like a scheduled Commit. If one of them fails, the Change set stays Approved.
- The commit bar flags "Closes a Tool path" and "Commit waits for the Re-translation".

### Emergency Commit dialog

- A mandatory reason, and a fresh sign-in before it runs.
- The dialog runs the pre-check when it opens. Each blocking deny finding has its own checkbox to waive it, with a reason prefilled from the Emergency Commit's reason and open to change; the Commit stays disabled until every one is waived. Each waiver is its own audit entry.
- A Tool path that closes needs a reason of its own, prefilled the same way. Managed NSGs with Drift offer "Overwrite the Drift"; without it the Emergency Commit still creates its Version and deploys everywhere else, and stage 2 of the pre-check stops the Deployment of that Environment before its first write until the admin has decided the Drift ([The Deployment view](#the-deployment-view)). An open Re-translation goes out with the Emergency Commit, and the dialog says that its Affected Zones then need Approval afterwards, which counts per Affected Zone like any Approval.

### Re-translation

- It opens on the Review screen: the engine upgrade and what holds while it is open on the left, the NSG rules that change in the middle, the decision on the right. It holds no edits, and an approver cannot reject it: an approver who disagrees asks the operator to go back to the previous image ([ADR 0028](../adr/0028-an-engine-upgrade-is-a-re-translation-that-approvers-cannot-reject.md)). Once its Approval is complete, the tool commits it, and the Commits that wait for it run. At the Approval level none the tool does not commit it: it waits in the inbox for a person who holds the editor Role in every Affected Zone ([The approver's view](#the-approvers-view)).

### Version history

- "Versions" is a page in the rail, open to every Role and filtered like the Rule base. It lists every Version with its number, Change set, committer (or the tool) and time, marks for Emergency Commit (and "Approval afterwards open"), scheduled, expiry, Re-translation, Restore, Revert and only Folders, and one dot per Environment for its Deployment (deployed, failed, running, waiting for another Environment, not affected). Chips filter Emergency Commits, scheduled Commits, Commits by the tool, Restore and Revert, and only Folders; a search finds a Version, a Change set or a person.
- The detail shows the reason of an Emergency Commit, the Deployment per Environment, the Approvals, and what the Commit changed, Rules and Folder edits. Its actions are "Revert this Commit", "Restore to this Version" (not on the latest Version) and "Export JSON", which needs a Role in the instance Scope. Each Environment opens the [Deployment view](#the-deployment-view).
- Revert and Restore open a new Change set on the Review screen, with a banner that says what it undoes or brings back, including the Folders a Restore removes or renames. One that differs only in Folders needs no Approval. A Re-translation cannot be reverted, because it holds no edits.
- A Revert or a Restore never removes and never re-creates a Zone on its own. Where the older state lacks a Zone or holds one that is gone, the banner lists the Zone as a separate step that the Author must tick, with its effect stated: "subnet X falls to deny-all", or "Zone X is onboarded again and needs a Handover where other IaC manages its NSG". A Zone that is onboarded again warns that its former Role assignments and Approval level are gone.
- When a Revert cannot bring a removed Folder back as it was, because its former Rules no longer stand together, the Author chooses: bring the Folder back around the Rules that still stand together and in no other Folder, or leave it removed. Neither moves a Rule.

### Inbox

- The bell in the rail carries the count and leads to the Change sets page, which opens with "Waiting for you". Chips filter by kind: Approval requests, Emergency Commits, conflicts, rejections, expiring Rules and Re-translation. Each row has one action: Review, Resolve, Open or Show Rules.
- The list of all Change sets below shows how many Versions each one is behind and opens each on the Review screen.
- At the Approval level none, a Change set that the tool prepared waits here for a person who holds the editor Role in every Affected Zone. It opens on the Review screen, where that person commits it ([The approver's view](#the-approvers-view)).
- A Change set of the tool that an approver rejects, or that has a conflict after a Rebase, goes to the inbox of the admins of its Affected Zones. An admin takes it over, and becomes its Change set owner and an Author, or dismisses it with a reason. A dismissal is audited, and the tool does not prepare the Change set again for the same cause.
- The expiry notice, 14 days before the expiry date by default, goes to the Rule owner and to the editors of the Rule's destination Zones. The validation error "expiry date in the past" applies only to enabled Rules that the Change set adds or edits, so Rules that have already expired do not block later Change sets.

### The small profile

- Folders ship after the small profile ([ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)). Until then the table, the Rule editor, the list of edits, the Rebase screen, the Commit dialog and the Versions page show nothing about Folders; nothing else changes.

## Zone detail

The Zone lens is the Zone detail. The Zone picker, the Zones page, the jump palette and every "open Zone" link open it. Its head shows the prefixes and Extra prefixes, VNet, Environment, Egress posture and flags (with "AVNM: n rules" and "NIC NSGs: n"), the limits, a switch between inbound and outbound, and three tabs: Rules, Flows and Settings. Rejected: a separate Zone page beside the lens, and a Zone tab in the side panel.

Two flags in the head are permanent warnings. An Application Gateway v2 Zone shows "outbound open, required by Azure", because the engine writes no outbound deny NSG rule there ([Rule editor](#rule-editor)). A Zone whose private endpoints NSGs do not filter warns: "NSGs do not filter the private endpoints of this subnet; denies are enforced on the source side only, and only for Zones". That is a Zone whose subnet has `privateEndpointNetworkPolicies` set to `Disabled` or `RouteTableEnabled`, or lies in a region where Microsoft lists NSG support for private endpoints as unavailable; the [engine doc](translation-engine.md) says how the engine then places deny Rules. The Preview of every Rule toward such a Zone carries the same warning.

### Security layers

The Rules tab shows the whole evaluation order of the Zone in one direction. The Security layers sit in it as locked bands, closed by default, and each opens into its rules, read-only:

- Inbound: AVNM security admin rules, Platform exceptions, the Rules, Intra-zone default, Inherited defaults, Deny-all rules, Azure default rules, NIC-level NSGs.
- Outbound: AVNM security admin rules, NIC-level NSGs, Platform exceptions, the Rules, Intra-zone default, Inherited defaults, Egress posture, Deny-all rules, Azure default rules. Microsoft documents the NIC-level NSG before the subnet NSG outbound ([Grilling: Policy and security-layer visibility][t21]).
- AVNM security user rules have no band in the MVP. The band the prototype shows for them is Later ([Review: Grill review of the complete design package][t23]).
- Where a right to read a Security layer is missing, its band says "cannot read" instead of "none", as the hits column says "no access" and never 0.
- The AVNM band names the network manager and the network groups. Each admin rule shows priority, action (Allow, Deny, AlwaysAllow), source, destination, service, and what it does to Rules, with the severity. Where admin rules do not apply to the subnet (Application Gateway, Bastion, Azure Firewall, Route Server, gateways), the band says so.
- The NIC-level NSG band lists each NSG with the interfaces it sits on ("on 5 of 12 interfaces") and its rules, the Azure default rules among them marked as such.

Rule warnings from Security layers are worded tags whose colour is the severity: "bypassed by AVNM" (a deny Rule that an AlwaysAllow admin rule skips) is high and red; "blocked by AVNM" and "blocked on 3 of 12 interfaces in app0042-web" are medium and amber. The chip "Layer warnings" filters them. Rejected: a separate Security layers tab with a stack diagram, because the bands show the same order where the Rules are.

### Flow view

The Flows tab lists the flows that the Zone's Managed NSG or one of its Security layers decided, in the chosen direction. A row is one aggregated flow as `NTANetAnalytics` delivers it: source, destination (the Zone itself reads "this Zone"), service, allowed or denied, the number of flows with a bar, when it was last seen, and what decided it. That is a Rule (number and name, one click to it in the Rules tab), a band (Platform exceptions, Intra-zone default, Inherited defaults with its part, Egress posture, Deny-all rules), an AVNM admin rule, or a NIC-level NSG with its rule and interfaces. Rejected: grouping the flows under their Rules.

- Chips: allowed, denied, by a Rule, by Inherited defaults, by the Egress posture (outbound), by the Deny-all rules, by a Security layer. A text filter takes an address, a Zone or a port. The window is 24 hours, 7 days or 30 days, the hits window; 24 hours is the default.
- The head says how old the newest flow is and names the processing interval of Traffic Analytics, which the tool reads from the VNet flow log (`trafficAnalyticsInterval`: 60 minutes by default, 10 where the operator chose it), with ingestion taking up to another hour ([research notes](../research/traffic-analytics-flow-view.md)). A band says the data is incomplete: ICMP is never logged, and denied flows are missing where the flow log filters them out ([Research: Traffic Analytics access for the Flow view and hits][t28]).
- No flow data: the tab names the VNet that no VNet flow log with Traffic Analytics covers and links to the instructions. The hits column shows "—".
- No access to flow data: the tab names the actions missing on the workspace. The hits column and the Rule editor show "no access" instead of 0.
- New Rule from a flow, beyond the brief: on a flow that a band decided (Inherited defaults, Egress posture, Deny-all rules), one click creates an allow Rule with the flow's source, destination and service, at the end of the Rule base and outside every Folder, so every deny Rule above it still wins. The editor opens with the name selected, and the comment names the flow. An Internet address becomes a new single IP Address object in the same Change set. A flow that a Security layer decided says "outside the tool", because no Rule changes it.

### Zone settings

Every setting in the Settings tab is an edit in the current Change set, marked "in your Change set".

- Egress posture: the two choices with what each means, the committed one marked. Before switching to strict, the tab lists the outbound flows of the last 30 days that only the open posture let out, each with New Rule, and says how many allow Rules with the Zone as source then also land on its Managed NSG. Switching back to destination decides says that it opens traffic and needs Approval.
- Inherited defaults: the three parts as switches, each with the number of flows of the last 30 days that relied on it. Switching a part off lists those flows, each with New Rule. Switching "outbound to Internet" off also shows the outbound warning ([Zones and onboarding](#zones-and-onboarding)).
- Extra prefixes: add and remove, with checks. Not a prefix, or already in the subnet: blocked. Overlaps the subnet of another Zone: a warning, not a block, because a load balancer frontend in that subnet is a legitimate Extra prefix; Address objects that overlap it then cover both Zones, and the Intra-zone default counts these addresses as the Zone's own ([ADR 0017](../adr/0017-extra-prefixes-and-vnet-bindings.md) as amended). Also an Extra prefix of other Zones: allowed, with the note that a Rule between these Zones also allows each Zone's own copy of the range.
- DNS: the custom DNS servers of the VNet and where they sit, and the Rule that allows DNS from the Zone to them, or "Add the DNS Rule". Azure-provided DNS at 168.63.129.16 needs no Rule, because NSGs do not filter it ([Research: Special subnets and mandatory platform rules][t3]).
- Managed NSG: name, resource group, subscription, region, Environment with its Deployment mode and Approval level, and the NSG rules against the limit.

## Zones and onboarding

- The Zone overview is a table of every Zone with its Managed NSG's use of each limit (NSG rules, source and destination addresses, ASGs), the Egress posture and its flags. Chips filter it: flagged, near a limit, Drift, Policy finding, missing permission, Import notes, strict egress, Inherited defaults, Security layers. A click on a Zone opens the Zone detail.
- A second tab lists candidates. A click on one opens a side sheet. A subnet that is not onboardable shows the reason and the evidence it was detected from: Azure forbids an NSG on it, a service maintains its NSG rules (SQL Managed Instance, Azure Databricks), a named network interface has IP forwarding enabled, AKS maintains its NSG (its managed resource group), or it holds nsgfw itself. The sheet says that it stays usable as a subnet Address object.
- Onboarding covers here the existing NSG (adopted in place, or a new Managed NSG swapped in for a shared one), the Egress posture (destination decides by default), and the proposed Rules. For a VNet with custom DNS servers that is the DNS Rule (the Zone to the servers, UDP 53 and TCP 53, allow), ticked by default, with where it lands, or that it writes nothing today and keeps name resolution working when the Zone turns strict. It lands in the current Change set. Import and the rest of onboarding: [Onboarding and Import](#onboarding-and-import).
- The outbound warning of the brief stays in the MVP ([Review: Grill review of the complete design package][t23]). At onboarding with Preserve behaviour off, and when the Inherited default "outbound to Internet" is switched off, the console warns that outbound traffic to the Internet and to Azure services then needs allow Rules. The Zone overview shows the badge "outbound restricted" or "outbound open, required by Azure"; the first marks a Zone whose Inherited default "outbound to Internet" is off, the second an Application Gateway v2 Zone. The catalog of ready-made Rules (Application Gateway v2, Azure Bastion, Windows activation and update) is Later.

## Objects

- The object library lists Zones, addresses, service tags, VNets, ASG objects, groups and Service objects with their Coverage and "used in N Rules", marks unused Objects (one of the five Rule warnings, see the [Rule editor](#rule-editor)), and shows members and covered Zones for one Object. "Show these Rules" filters the Rule base by it.
- One object editor serves two places: the detail of the object library, and the Object tab of the side panel, which opens from an Object in the Rule editor. Edits land in the current Change set, and the Coverage shows the difference to the committed Version. Rejected: editing only in the library, and editing only in the side panel.
- ASG objects: one search over VMs, network interfaces and private endpoints by name, IP or Zone. A VM brings its network interfaces, each of which can be unticked. Network interfaces are grouped by VNet, which is the Managed ASG they land in, named by the Environment's pattern; NSGs in other VNets get the members' IPs ([ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md)). Private endpoints form a group of their own, marked "by IP", because the tool writes their IPs on every NSG and never puts them into a Managed ASG ([Grilling: ASG membership of private endpoints and multi-IP network interfaces](https://github.com/mfgAkilae/nsgfw/issues/39)). Scale-set interfaces cannot be picked; an External ASG object covers them. Without the optional role nsgfw ASG Writer in an Environment, network interface members there block Submit, and the ASG limits block the Change set: 20 ASGs per IP configuration, 100 ASGs across the rules of one NSG, 4,000 IP configurations per ASG ([Research: NSG and ASG rule semantics and limits][t2]). Rejected: browsing a tree of Zones, VMs and interfaces.
- External ASG objects: the Unmanaged ASG with its resource group, VNet and owner, its members read-only, and another Unmanaged ASG to pick. Without automatic adoption, new members wait in a Change set that the tool prepared for Approval.
- "Adopt member changes automatically", on ASG objects and External ASG objects, says what it covers, that a deleted member and a changed member IP are adopted in any case, and who approves the switch. Switching it on or off is an Object edit in the current Change set that any editor may draft; no admin Role is needed. Its Affected Zones are those of every Rule that uses the Object ([ADR 0008](../adr/0008-approval-by-affected-zones.md)) plus the Zones that hold its members.
- IP and CIDR objects: the VNet binding offers the own VNet, the peered VNets and every unconnected VNet whose Zones the prefix overlaps, each with its number of Zones. While the object is unbound and reaches an unconnected VNet, a warning says so. The Coverage below follows the binding.
- The object picker searches all of them by name, address or port and says what an Object covers ("covers 3 Zones", "covers no Zone").

## German terms

Regelwerk (Rule base), Regel, Ordner (Folder), Zone, Objekt, Änderungspaket (Change set), Vorschau (Preview), Prüfen (Review), Einreichen (Submit), Freigabe (Approval), Vier-Augen, Betroffene Zonen (Affected Zones), Schreibreihenfolge (write order), Kreuzende Flüsse (Crossing flows), Notfall-Commit, Treffer (Hits), Quelle, Ziel, Dienst, Verantwortlich (owner), Ablauf (expiry), Ausgangsverhalten (Egress posture) with "Ziel entscheidet" and "strikt", Plattform-Ausnahmen, Intra-Zonen-Standard, Geerbte Standards, Deny-all-Regeln, Azure-Standardregeln, Flüsse (the Flow view tab), Sicherheitsebenen (Security layers), Zusätzliche Präfixe (Extra prefixes), VNet-Bindung (VNet binding), Verwaltete ASG (Managed ASG), Externes ASG-Objekt (External ASG object), "Mitgliederänderungen automatisch übernehmen", Kandidat (candidate subnet), Einstellungen (Settings). Commit stays Commit.

From [Prototype: Change set review, conflicts and Version history][t36]: Versionen, Neuübersetzung (Re-translation), Pre-Check-Verzicht (Pre-check waiver; "Ausnahme" is Azure's exemption), Tool-Pfad (Tool path), nachträgliche Freigabe (Approval afterwards), nicht erzwungen (not enforced), ausgenommen (exempt). Rebase, Restore and Revert stay English, like Commit.

## The table component

AG Grid Community carries the Rule base at the design target; the fallback to TanStack Table is not needed. Measured in the prototype with 10,000 Rules and 20,000 Zones: first render in 100 to 240 ms, a filter in about 110 ms, smooth scrolling to the last Rule.

- Used from Community: row virtualisation, own row dragging including several rows, in-place editing where the grid only reports the new value, popup editors, checkbox selection, pinned and full-width rows (bands, Folder rows), flex columns, and the `cellContextMenu` event for an own context menu.
- Enterprise only and built by hand or left out: the built-in context menu, row grouping (Folders are full-width rows of an own flat list), set filters, range selection and clipboard, master/detail, Excel export.
- Rules for building it: give grid option objects and callbacks a stable identity and never redraw rows on a click, or the double click that starts editing is lost; never set `position` on a cell class; one grid theme serves both modes when every colour is a CSS variable that exists before the grid mounts.

## Access, audit, health and settings

Decided with the map owner in [Prototype: Access, audit, settings and health views][t38], 2026-11-10, over the same prototype, in two rounds of questions and two passes.

### One Admin entry

- The rail gets one more entry, Admin, with a sub-navigation: Setup, Access, Audit log, Health, Environments, Instance, Alert channel. Each part shows only to the Roles that may use it. Someone who may only read sees the audit log and [Health](#health). A red or amber dot on the entry reports Health.
- Recovery mode gets a view of its own, which the prototype ticket "Recovery mode and Change set management views" designs ([Not covered yet](#not-covered-yet)). One point is fixed: after a Copy, the Handover is one confirmation per Environment by a holder of `InstanceAdmin` in that view, and it is audited ([ADR 0019](../adr/0019-instance-identity-in-the-database-and-recovery-mode.md)).
- Access is for admins. Everybody else sees their own Roles in the avatar menu: sign-in time, when the session ends, and every Role with its Scope and where it comes from (direct, through a group, or the Entra app role `InstanceAdmin`).

### Access

- A Scope tree on the left: the instance, the Environments, their subscriptions, VNets and Zones. It searches by name, and children render only when opened, so 20,000 Zones stay fast. Each node shows how many Role assignments sit on it and the Approval level set there.
- The detail of one Scope shows its Approval level, its Role assignments and a check of one principal.
- Approval level: the effective level with what it means ("An approver of the Zone who is not an Author approves"), where it comes from (set here, or inherited from a Scope above), and a choice of inherit, none, approver or four-eyes. An admin of the Scope can raise it; lowering it needs an admin of a Scope above, and the choice says so where it is locked ([Grilling: Access, roles and audit][t19], point 13). The instance node holds the instance default, which only an instance admin changes. Scopes below that set their own level are listed.
- Role assignments: those on the Scope, and those inherited from above in grey, each with the principal (user, group, service principal or managed identity), the Role, where it is assigned, who assigned it and when. At the instance, the holders of `InstanceAdmin` show as maintained in Entra. Principals deleted in Entra and groups with hidden membership are flagged, because their assignments give nobody access. Only an admin of the Scope assigns or removes a Role there. Assigning picks the principal from Entra and one of the four Roles, each with one line on what it adds.
- "Check access" takes one principal and shows their Role in this Scope and where it comes from, or that they hold none here.
- A second tab lists every assignment flat, with chips for users, groups, service principals, managed identities, admin, deleted in Entra and hidden membership.

### Reading and missing Roles

- Under the read filter by Coverage ([ADR 0012](../adr/0012-access-follows-coverage.md)) Rule numbers stay global, so gaps show where Rules the person may not read sit, and Rule numbers mean the same for everyone. One line above the table says how many Rules the person sees ("You see 16 of 10,000 Rules: those that land on your Scopes"). Folders follow [ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md).
- While a Change set is Open, its Authors see more than their Scopes give, but only the Rules whose source, destination and service overlap a Rule they added or edited in it. That is what placement needs to judge order and shadowing. These Rules carry the flag "through your Change set". The Preview of Zones outside an Author's Scopes shows only once the Change set is Submitted, and an approver sees the Preview of the Zones they approve ([Review: Grill review of the complete design package][t23]).
- A Rule that covers no Zone is readable by every Role in the instance Scope and by its Authors.
- The Zone overview lists only the Zones in the person's Scopes, because limits and flags are the Azure side. Every Zone name stays in the object picker.
- The other surfaces follow the table in [ADR 0012](../adr/0012-access-follows-coverage.md). Every editor, in every Scope, reads the onboarding candidates, the onboarding screen with the existing NSG, and the search over VMs, network interfaces and private endpoints that picks members. The Flows and Settings tabs of a Zone show to the Roles whose Scope holds the Zone. The Versions page shows to every Role, filtered like the Rule base, and "Export JSON" of a Version needs a Role in the instance Scope. "Used in N Rules" and every other count follow the read filter.
- A person without the editor Role in any Scope gets a read-only console: no New Rule, no Folder, no drag, no edit in place, no checkboxes, and "Read only" in the head.
- An editor sees what they may not do, with the reason. At the level none, Commit is locked when the editor Role is missing in an Affected Zone, and the commit bar names those Zones. A Change set without Affected Zones, other than one that only changes Folders, needs the Approval of an approver in the instance Scope at the instance default level; at the level none, Commit is locked when the editor Role in the instance Scope is missing. Emergency Commit is locked when the admin Role is missing in an Affected Zone whose Approval is missing ([Grilling: Access, roles and audit][t19], points 8 and 11).
- When the server refuses an action anyway, for example because a Role ended a moment ago, a dialog names the action, the Role and Scope it needs, and what the person holds, and says that the attempt is in the audit log.

### Sign-in edges

- Step-up asks only when the action is clicked. A small lock marks the buttons that will ask: Approval, Emergency Commit, Role assignment changes and, decided here, changes of an Approval level ([ADR 0013](../adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md)). The dialog says why and opens Entra in a small window; what the person entered stays, and the action continues after the sign-in.
- Five minutes before the 60-minute idle limit, a warning counts down with "Stay signed in". Before the 8-hour end, a warning offers to sign in again now. The signed-out screen says that nothing is lost, because every edit is already in the Change set.
- A principal without any Role sees a page instead of the console: who is signed in, the object ID to copy, a copyable access request, and the access contact. The access contact is a new instance setting, a short text an instance admin writes. The attempt is in the audit log.

### Audit log

- The chain status sits on top: intact, when it was last verified and over how many entries, and an accepted fork at a recovery entry ([ADR 0019](../adr/0019-instance-identity-in-the-database-and-recovery-mode.md)). A broken chain turns it red and names the entry. Admins can verify now.
- Chips by kind with counts: Change sets, Approvals, Commits, Emergency Commits, settings, Role assignments, denied actions, Deployments, Drift, automatic actions, Import notes, recovery. A Scope filter (Environment, VNet or Zone), a time range and a text search over person, object, ticket and text.
- A row reads as time, who, what, Scopes and result. The tool's own actions, such as removing an ASG member that was deleted in Azure or disabling an expired Rule, carry the actor "nsgfw".
- A side panel shows one entry in full: its Scopes, the hashes of the entry and of the one before, and the entry as the export writes it.
- A reader sees the entries that touch their Scopes; entries in the instance Scope are visible to every admin ([Grilling: Access, roles and audit][t19], point 21).

### Health

- A strip with one status per check: Azure permissions, Microsoft Graph, the certificate (on-premises), the alert channel, the database schema, the audit chain and Recovery mode, each with when it runs.
- Below it, only the problems, grouped by what is missing: one missing action with the role that should hold it, its Zones, the effect ("Deployments to these Zones stop before their first write") and the fix (run `environment-access` again, or update the role definitions). Graph problems name the group with hidden membership or the deleted principal and link to Access.
- Every Role in the instance Scope, viewer and up, sees Health in full. A person without a Role in the instance Scope sees the problems of their own Scopes.
- Health lists every Rule expiry and member change that the tool holds back because its Commit would close a Tool path ([Commit](#commit)).
- Health flags a missing `auth_time` claim, without which the tool refuses every step-up ([ADR 0013](../adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md)), and shows the warning that follows a failed nightly test of the write-order assumptions ([ADR 0023](../adr/0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md)).
- In Recovery mode Health lists the Rules past their expiry date. An allow Rule that expires in the mode stays as it is, and the expiry Commits run when the mode ends ([ADR 0019](../adr/0019-instance-identity-in-the-database-and-recovery-mode.md)).

### Setup and settings

- Setup is a checklist for an instance admin that stays until every step is done or the admin hides it: sign in with `InstanceAdmin`, onboard the first Environment, check the Azure role assignments, choose the Approval level (the small profile offers none), set up the alert channel, switch on automatic Overwrite (proposed), assign Roles, the ingress (shown only), onboard the first Zones. Each step opens the normal settings page, so there is no second place for the same setting.
- Environments: a list with the Deployment mode, the Zones, the Approval level and the state of the Azure access check. One Environment shows the access check per role (`nsgfw Reader`, `nsgfw Writer`, `nsgfw ASG Writer`, `nsgfw Flow Reader` on the flow-data workspace) with the missing actions, and "Show what to run" with the `environment-access` module call or a script, for the owner of the management group. Then "Overwrite automatically", limited to lost subnet associations and marker tags; `flushConnection`, off by default, with what off means; the naming and resource group patterns; the Terraform settings in Terraform mode; the flow-data workspace and the hits window. Only an admin of the Environment changes them; every change is audited.
- Adding an Environment (instance admins) is a wizard: name and Scope, Deployment mode (fixed afterwards), the role assignments to create with a check that must find the Reader, settings. A missing Writer lets the wizard go on and keeps Zones there from onboarding. For a GitHub repository in Terraform mode, the wizard checks whether the repository allows auto-merge and flags it when not ([The Deployment view](#the-deployment-view)).
- The Review notes for each Environment with `flushConnection` off that a connection the Change set closes keeps running until it ends: revoked access does not end running sessions.
- Instance: the Internal address space as a list of prefixes. It belongs to the Rule base, so a change becomes an edit in the current Change set, resets its Approvals like any edit that is not a Folder edit, affects every destination-enforced Zone and needs their Approval. Next to it the Settle time, the Settle time for private endpoint Zones, the Tool paths, the access contact, the ingress (shown only, because the `instance` module sets it and the tool cannot change its own ingress) and the identity facts. Two settings feed the Rule warnings of the [Rule editor](#rule-editor): the management ports, by default TCP 22, 3389, 5985 and 5986, a list that an admin of the instance Scope can change, and the threshold for "lands on very many Managed NSGs", by default 100 Managed NSGs.
- Alert channel: none, e-mail (SMTP, or Graph with Mail.Send scoped to one mailbox) or a webhook (Teams Workflows or generic JSON, the URL named as a Key Vault secret), with a test alert and the last deliveries.

### German terms for these views

Zugriff (Access), Audit-Log, Zustand (Health), Einrichtung (Setup), Umgebungen (Environments), Instanz, Alarmkanal (alert channel), Rollen Leser, Bearbeiter, Freigebender und Admin (viewer, editor, approver, admin; Freigebender is also the Approval level), Rollenzuweisung (Role assignment), Nur lesen (Read only), Anmeldung bestätigen (step-up), Interner Adressraum (Internal address space), Settle-Zeit, Kontakt für Zugriff (access contact).

## Deployments, Drift and Import

Decided with the map owner in [Prototype: Deployment, Drift and Import views][t37], 2026-11-10, over the same prototype: four questions before building and six after the first pass.

### The Deployments page

- The rail gets one more entry, Deployments, after Versions. Drift sits on the same page, because Drift is measured against the Deployed state, and both answer whether Azure matches what was decided. A red dot on the entry reports a failed Deployment or open high Drift, an amber one a Deployment that runs or a pull request that waits. Rejected: a Deployments tab on the Versions page with Drift on the Zones page, because an Overwrite or a catch-up Deployment has no Version; and two rail entries.
- A status strip shows one card per Environment with its Deployment mode: what failed ("Failed · Version 1289, 1 write"), what runs or waits ("Deploying Version 1290 · 10 of 14 writes", "step 1 of 2 · pull request open #418", the open pull request of an Emergency Commit with its age, "Waiting for Non-production · 1 write" in amber), or "In sync with Version 1290 · last write today 08:12", and its open Drift with the number of high items. A click filters the page by that Environment. "Settings" opens the Environment in Admin > Environments, so there is no second settings page.
- Two tabs, Deployments and Drift, each with its count.
- The Deployments tab is the Deployment history: one row per Deployment, also those without a new Version (an Overwrite, an automatic Overwrite, a catch-up after a re-home) and every Retry. A row shows the Version or "—", what started it (the Change set, tagged Emergency Commit, Scheduled, Retry, Overwrite, automatic Overwrite, catch-up, Expiry, Re-translation or Restore), the Environment, the state (also "not orderable", see the [Deployment view](#the-deployment-view)), the writes done of all with a bar while it runs, the start, the duration and who. Chips with counts: Running, Waiting, Failed, Superseded, Skipped Zones, By the tool, Terraform. A search finds a Version, a Change set, a resource or a person. A row opens the Deployment view.

### The Deployment view

- One wide screen per Commit, like Review, with a tab per Environment of that Commit. It opens from the Deployments page, the Version detail, the banner above the Rule base, the Rule editor and the inbox. The head shows the state, the Change set and who committed it, and the actions Retry failed writes, Revert this Commit and In the audit log. On an onboarding Commit, Revert this Commit shows the banner of [Version history](#version-history): the Revert does not remove the Zone on its own, and removing it is a separate step that says "subnet X falls to deny-all".
- A superseded Deployment says which Version superseded it, that it stopped after its writes in flight, and that the newer one plans from the Deployed state and also delivers what this one did not. A write in retry backoff counts as in flight only while its request is running, and the superseding Deployment cancels the backoff. A Deployment that stopped before its first write names the Drift, the Policy finding or the limit.
- The pre-checks run in two stages ([ADR 0022](../adr/0022-a-version-exists-from-its-commit-and-deployments-plan-from-the-deployed-state.md), [Review: Grill review of the complete design package][t23]). Stage 1 is a gate before the Version, for a Commit that a person makes or scheduled: when Drift, a deny Policy finding without a Pre-check waiver or a live limit fails it, no Version is created, no Deployment starts and the Change set stays Approved. Stage 2 runs at the start of every Deployment and stops only that Deployment before its first write; "Before the first write" shows its result. A Commit of the tool that only closes traffic (a Rule expiry, a closing Adopt) skips stage 1, and in its stage 2 an NSG with Drift fails on its own while the rest deploys.
- A Deployment stops in the state "not orderable" when its write plan becomes not orderable after the Commit, for example because a peering disappears and the new tag cases close a cycle ([ADR 0023](../adr/0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md)). The view names the flows. The ways out are a Change set that fixes the cause, or Revert this Commit, which an admin may make an Emergency Commit.
- Left, the plan. "Before the first write" lists four checks with their result: the Drift pre-check (a fresh GET, in Terraform mode over every tool resource in the touched root modules), the Policy pre-check with the Pre-check waivers in force and the information findings, the live limits, and the Azure permissions with the skipped Zones and the missing action. Then the write order: "One step: every write in any order, nothing waits", or the steps with the Settle time between them, each boundary with its reason ("Crossing flow app0042-web → app0042-api: the NSG of app0042-web closes it, the NSG of app0042-api opens it") and a countdown while it runs. Below them the budget (the writes against 500 per 5 minutes per subscription and region, one write in flight per resource, Retry-After honoured) and the expected wait, the step boundaries times the Settle time.
- Middle, the writes: resource, kind, Zone, step and state. The states are waiting (for a named write and the Settle time, also a write in another Environment), writing, done, retrying (with the attempt and Retry-After), failed (with the error code), changed by Azure Policy on write, and skipped (with the reason: a missing action, a Zone whose subnet is deleted in Azure, or a subscription that left its Environment). A write that waits for a skipped write keeps waiting and shows "skipped" as the state of the other side, until a person resolves the flag (remove the Zone, re-home, forget). Chips with counts: waiting, failed, done, skipped.
- Right, one write: what it changes (NSG rules added and removed, priorities, the hash before and after), its times, attempts and Azure correlation ID. A waiting write says what it holds back ("Holds back: allow app0042-app → app0042-db tcp/1433, which opens") and that an NSG that waits for another waits as a whole. A failed write lists the writes that wait for it. "Changed by Azure Policy on write" shows the fields as requested and as Azure stored them, the policy and whether the pre-check predicted it, that the Deployed state takes what Azure stored, and the ways out: an exemption or a policy change and then Retry, a fixing Change set, or Revert this Commit, which an admin may make an Emergency Commit. Retry needs the editor Role in the resource's Scope and no Approval, and the policy pre-check runs again for the retried writes.
- In a Terraform Environment each step is a pull request card: its number and branch, auto-merge requested, the Data contract files it changes, the revision value and head commit, how many of its resources Azure shows at the target, and a link to the pull request. The states are pull request open; merged and awaiting apply, with the apply timeout; deployed, once Azure shows the target; apply failed: policy, from the merge commit's check, with the assignment, while observation goes on; merged, not applied, where Retry opens a pull request that changes only the revision value; closed without merge by a named person, where Retry opens a new pull request; and superseded, closed with a link to the newer pull request. A later step says that it opens once Azure shows the previous step and the Settle time has passed.
- The tool merges a pull request itself when it is mergeable at once, with no required review or check pending; that bypasses no protection. It does so only when the Environment setting "merge pull requests automatically" is on, which is off until the operator switches it on. Otherwise the pull request waits for a person, and the view says so. Otherwise it requests auto-merge, and Environment onboarding flags a repository that does not allow it ([Setup and settings](#setup-and-settings)).
- A newer Deployment plans only after a merged step has been observed to its end, with the apply timeout as the limit, and the tool keeps watching a superseded step, so its Deployed state stays current. The tool batches its own Commits per Terraform Environment, at most one every 30 minutes, so that a run of Adopts does not close the open pull request again and again; a Commit that only closes traffic goes at once. The Version exists from the Commit at once; only the pull request is batched.
- A write can wait for a write in another Environment ([Grilling: Crossing flows between Environments][t40], [ADR 0025](../adr/0025-the-write-order-spans-environments.md)). The waiting write says "Waits for nsg-… in Non-production" with that write's Version and state (waiting, failed with its error code, skipped, stopped over Drift, the Policy finding or a limit) and the flow it orders. The other end says "Production waits for this write" and what it holds back there. Everyone who sees the waiting write sees this, because the other Zone already stands in the Rule they can read; the link into the other Deployment view opens only with read access there. The boundary counts in the expected wait. A Deployment whose remaining writes wait only for other Environments shows "Waiting for Non-production", not failed; it has released its write lease and resumes on its own, with the full Settle time, once the other write is done. When a Commit plans its edges again, the view notes "Edges planned again after Version 1291". There is no time limit and no override: the ways out are on the other side (Retry, a fixing Change set, Revert this Commit). No alert of its own, because the failure there raises one.

### Deployments elsewhere in the console

- A banner above the Rule base stays while a Deployment failed ("Version 1289 is not fully in Production: 1 write failed, changed by Azure Policy on write. 2 Managed NSGs do not have its NSG rules yet.") or waits for another Environment ("Version 1290 is not fully in Production: 1 write waits for Non-production.") and while the pull request of an expiry or Emergency Commit is open in a Terraform Environment, with its age. Each line opens the Deployment view.
- The Rule editor lists the Managed NSGs where the Rule's NSG rules are not deployed yet, with the reason.
- The inbox gets a row for a failed Deployment, for the committer, the Change set owner and the admins, and one for an open expiry or Emergency Commit pull request.
- The Versions page keeps its Deployment dots, and the Version detail opens the Deployment view.
- When a Change set touches a Terraform Environment, the Commit dialog says that each step of the write order is a pull request. It asks to confirm that the next pull request restores a hand-edited Data contract file, and that the apply overwrites Drift in a touched root module.
- Admin > Environments > a Terraform Environment lists its Data contract files with the revision, when nsgfw last wrote them and when Azure last showed them. A hand edit is flagged with its commit, author and age: the next pull request restores the file after the confirmation in the Commit dialog, and Adopt reads Azure, never the file.

### Drift

- The Drift tab is a list beside one item in full, like the Versions page. Its head says how Drift is found (Resource Graph every 5 minutes and a full reconcile daily) and names an Environment where polling is off because a read is missing.
- Chips with counts: Open, High, Medium, Low, Not adoptable automatically, Adopt open, and Resolved by the tool (automatic Overwrites and automatic Adopts of the last 30 days). A search finds a resource, a Zone or an actor.
- A row shows the severity as a word (high in red, medium in amber, low in neutral), what changed with the resource, Zone and Environment, the actor ("j.doe via Azure portal"), when it was found and that a GET confirmed it, and the state: open, Adopt open in a named Change set, overwriting or resolved.
- One item shows the Deployed state beside Azure with the changed cells marked, the effect on traffic that sets the severity ("Opens: 203.0.113.0/24 → app0117-jump, TCP 3389"), the actor in full (changedBy, clientType, operation, caller and correlation ID), how it was found, and what it blocks.
- The actions follow the kind of Drift ([Grilling: Import and drift handling][t18], point 20). Overwrite opens a dialog that lists every resource the write puts back and the flows that reopen or close, and says that it needs no Approval, needs the editor Role in the Zone, and goes into the audit log. In ARM mode it is one write of the Deployed state. In a Terraform Environment it is a pull request that changes only the revision value, and the dialog lists every Drift in that root module, because the apply reverts all of it. Adopt says what the prepared Change set holds, and whether it needs Approval ("Opens traffic on app0042-web: needs the Approval of app0042-web") or commits on its own because it only closes traffic. An item that is not adoptable automatically says why, for example that its NSG rule belongs to a Rule that also lands on other Managed NSGs, and offers Overwrite and Open the Rule. A deleted Managed NSG or a lost association offers Re-create or Re-associate, and Remove the Zone. A change of the Azure inventory offers Adopt only.
- Drift that keeps coming back under automatic Overwrite shows how often the tool overwrote it, that the tool stopped, and the writer, with a link to the Environment's switch.
- The Drift flag in the Zone overview follows the open Drift.

### Onboarding and Import

- The candidates tab of the Zone overview gets checkboxes on onboardable subnets, "All in this VNet", "All in this subscription" and "Onboard n subnets". A single candidate without an existing NSG keeps the side sheet of [Prototype: Zone detail, Flow view and object editors][t35]. A candidate with an NSG, or several ticked candidates, open the onboarding screen. Rejected: a wizard in steps, and Import inside the side sheet.
- The onboarding screen is wide, like Review.
  - Left, the subnets with their status (ready, the number of blocking notes, a Handover to confirm in the Review) and "Same for all": Import or start empty, Preserve behaviour and the Egress posture, which every subnet follows unless it is changed there.
  - Middle, one subnet: the Zone name (the subnet name, or `{vnet}-{subnet}` on a collision, editable); the existing NSG with its actual name and rules, adopted in place or swapped, with the subnets that share it; the foreign-IaC evidence and the Handover checklist; Import or start empty; Preserve behaviour; each referenced ASG as an External ASG object (the default) or adopted in place, which is locked without `nsgfw ASG Writer`; the Egress posture; each of the Inherited defaults, set or not, with why; the proposed DNS Rule; and the warnings this subnet has (Application Gateway v2, a private endpoint subnet with network policies off, the AKS pod range, and for a subnet that was a Zone before, that its former Role assignments and Approval level are gone).
  - Right, the result for all subnets or for this one: the Rules imported with their provenance; the Import notes by level; the merge proposals with Accept per group, where the merged Rule keeps all provenance; where the Rules land among the Folders ([ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)); the flows that open on Zones already managed; the Preview lines (the NSG adopted or created, the swap, the Deny-all rules, "the subnet loses all traffic that no Rule allows"); that the first Commit replaces the legacy NSG rules in one write; and, in a Terraform Environment, the import entries in the Data contract.
  - "Add to Change set" puts all of it into the current Change set. Blocking notes do not stop that; they stop Submit, and also a Commit that needs no Submit at the Approval level none.
- Preserve behaviour off sets no Inherited defaults, so traffic that only the Azure default rules allowed stops at onboarding, and the screen shows the outbound warning ([Zones and onboarding](#zones-and-onboarding)). The constraint merge still places the imported Rules, because their order decides what they do ([ADR 0011](../adr/0011-import-preserves-behaviour.md) as amended).
- The Rule base gets a chip "Import notes". The Rule editor of an imported Rule shows its provenance (NSG, NSG rule, priority, direction), whether the constraint merge places it or a person pinned it, and each note with its level. An admin of the Zone acknowledges a warning or info note there, as an audit entry without a Change set. A blocking note says what resolves it.
- When a legacy NSG changes in Azure after its Import snapshot and imported Rules from it were edited, the commit bar shows "Import snapshot out of date" in red and Commit waits. The dialog behind it shows what changed in Azure and who changed it, the edits that a Re-import would discard, and the choice of Re-import or Keep snapshot. An Author who holds the editor Role in the Zone makes that choice. Without edits the tool imports again on its own and resets the Approvals.
- Handover: with foreign-IaC evidence, the Author of the onboarding Change set confirms the checklist in the Review before Submit, and the commit bar names the open Handover until then. The approver sees the evidence and the confirmation. The Commit dialog shows the confirmation in one line and does not ask again. This settles the earlier wording "the Commit asks the admin" ([Grilling: Terraform mode workflow][t17], point 25) in favour of [Grilling: Access, roles and audit][t19], point 14.

### German terms for issue 37

Übernehmen (Adopt), Überschreiben (Overwrite), Import-Hinweis (Import note), Schritt (step), ersetzt (superseded), Deployter Stand (Deployed state), Datenvertrag (Data contract), Übergabe (Handover), nicht automatisch übernehmbar (not adoptable automatically), Import-Snapshot, Neu importieren (Re-import), Snapshot behalten (Keep snapshot), leer beginnen (start empty), Verhalten erhalten (Preserve behaviour). Deployment, Drift, Pull Request and Apply stay English.

## Not covered yet

Decided in [Review: Grill review of the complete design package][t23].

A new prototype ticket, "Recovery mode and Change set management views", designs two surfaces before the increment plan:

- The Recovery mode view: the differences, Move or Copy, and ending the mode.
- Change set management: the description and the ticket reference, a second Change set, co-editors, the hand-over, and taking over a Change set of the tool.

The remaining surfaces are each designed in their increment:

- Removing a Zone ("remove from all Rules").
- The flags "subscription left its Environment" and "Zone lost its subnet", with re-home and forget.
- Offboarding an Environment.
- The Terraform bootstrap pull request.
- The instance time zone and the expiry lead time as settings.
- Folder conflicts beyond name against name.

[t2]: https://github.com/mfgAkilae/nsgfw/issues/2
[t3]: https://github.com/mfgAkilae/nsgfw/issues/3
[t21]: https://github.com/mfgAkilae/nsgfw/issues/21
[t25]: https://github.com/mfgAkilae/nsgfw/issues/25
[t28]: https://github.com/mfgAkilae/nsgfw/issues/28
[t34]: https://github.com/mfgAkilae/nsgfw/issues/34
[t35]: https://github.com/mfgAkilae/nsgfw/issues/35
[t36]: https://github.com/mfgAkilae/nsgfw/issues/36
[t37]: https://github.com/mfgAkilae/nsgfw/issues/37
[t38]: https://github.com/mfgAkilae/nsgfw/issues/38
[proto]: https://github.com/mfgAkilae/nsgfw/tree/prototype/console-ui/prototypes/console-ui
[t19]: https://github.com/mfgAkilae/nsgfw/issues/19
[t17]: https://github.com/mfgAkilae/nsgfw/issues/17
[t18]: https://github.com/mfgAkilae/nsgfw/issues/18
[t40]: https://github.com/mfgAkilae/nsgfw/issues/40
[t15]: https://github.com/mfgAkilae/nsgfw/issues/15
[t16]: https://github.com/mfgAkilae/nsgfw/issues/16
[t23]: https://github.com/mfgAkilae/nsgfw/issues/23
