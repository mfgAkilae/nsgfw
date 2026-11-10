# Console

Status: confirmed by the map owner in [Prototype: Console UI][t25], 2026-11-10, after seven passes over a clickable prototype. It records how the console looks and behaves for the surfaces that prototype covers: the Rule base, Folders, the Change set from the first edit to Submit, the Zone overview and the object library. The prototype on the branch [`prototype/console-ui`][proto] is the primary source; it is throwaway code with mock data and is never merged. The surfaces it does not cover are listed under [Not covered yet](#not-covered-yet) with the ticket that holds each.

## One console

The console is one design in a light and a dark mode, in English and German. Three alternative shells were built first (a classic console, a Change set workspace, a Zone-first view) and dropped: the console keeps the Rule base as home from the first, the always visible consequence of a Change set from the second, and the Zone view from the third.

- A rail on the left: Rules, Zones, Objects, Change sets, then inbox, mode, language and a keyboard help.
- One sheet per page that holds the table.
- A side panel on demand, with two tabs: the Rule editor and the Change set.
- A commit bar at the bottom that appears with the first edit.
- A jump palette on Ctrl K that reaches every Rule (by name, number or Rule ID), every Zone and the main actions.

## Principles

- Colour carries meaning only. Green is allow, red is deny or blocking, amber is pending or needs attention, one accent colour is interaction. Everything else is neutral, in both modes.
- Shapes say what a thing is. Pills filter. Rounded rectangles are Objects, with a glyph for the kind (Zone, VNet, host, network, service tag, ASG object, group). Hatched, locked bands are what sits above and below the Rules.
- Flags are words, not icons: "Policy finding", "Import note", "in another Change set".
- Every main function takes one click or none. Filter chips carry counts on every page.
- The typeface keeps look-alike characters apart (0 and O, 1 and l), because a misread address opens a port. The prototype uses Atkinson Hyperlegible Next and Mono (OFL, see ADR 0002).

## Rule base

The table has the columns of the brief: number, name, source, destination, service, action, hits, comment. A row reads as a flow from left to right, and its left edge shows the action (hatched when the Rule is disabled). Under the name a second line carries the change marker, the flags, the Rule ID, the ticket and the owner. Hits show a number and a small bar, "—" where no flow data exists, and how old the data is.

- Platform exceptions, the Intra-zone default, Inherited defaults, the Deny-all rules and the Azure default rules are locked bands above and below the Rules, in the whole Rule base and per Zone.
- Filter chips: deny, disabled, expiring, with findings, no hits, changed. A text filter searches name, Objects, Rule ID, ticket and owner.
- The Zone view is a lens on the Rule base: it shows the Rules that land on one Zone's Managed NSG, inbound or outbound, in Rule base order with their numbers, with the Zone's limits and its own bands.
- An overview ruler beside the table marks where changed and flagged Rules sit among all Rules and jumps there on a click.
- One Rule: buttons on the row (details, disable, clone, delete) and a context menu on right click (the same, plus new Rule below, move to top or bottom, move to a Folder, and "Rules with this Object").
- Several Rules: ticking them turns the chip row into the action row.
- Order: drag by the handle, also several ticked Rules; "Move to…" for long distances. A filtered table still allows dragging and drops next to the visible neighbour. A sorted table does not.
- Cells edit in place on a double click; source, destination and service open the object picker.

### Rule editor

The side panel edits every field of one Rule: name, allow or deny, enabled, Folder, source, destination and service with an inline object picker, ticket, owner, expiry and comment. It shows where the Rule lands in Azure, as a source side and a destination side with the reason ("the destination decides", "strict Egress posture", "Deny Rules land on both sides"), and the number of Managed NSGs and NSG rules. This is where Rule cost is shown; it is not a table column. "Before you submit" lists what to fix: the Rule allows everything, opens a management port from the Internet, lands on very many Managed NSGs, or writes nothing. `any` covers every Zone, so the editor says that an any Rule lands on every Managed NSG.

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
- Review is one wide screen before Submit: what was edited; one Rule before and after with the NSG rules it writes; and the write order, the Approval per Environment and Affected Zones, and the Policy findings, with the action.
- The Preview groups by Managed NSG and puts NSG rules that only get a new priority into one line.
- The write order is a picture of the Crossing flows: the Managed NSG that closes a flow, then the one that opens it, and the rest "in any order". A Change set that cannot be ordered names its Crossing flows and says to split it.
- A Rule that another open Change set also changes carries the flag "in another Change set", in the table, in the editor and in the list of edits.
- The Change sets page shows first what waits for the person (Approval requests, Emergency Commits without Approval, expiring Rules, rejections), then every Change set on the workflow track.

## Zones and Objects

- The Zone overview is a table of every Zone with its Managed NSG's use of each limit (NSG rules, source and destination addresses, ASGs), the Egress posture and its flags. Chips filter it: flagged, near a limit, Drift, Policy finding, missing permission, Import notes, strict egress, Inherited defaults. A second tab lists candidates and the reason where a subnet is not onboardable. A click on a Zone opens the lens.
- The object library lists Zones, addresses, service tags, VNets, ASG objects, groups and Service objects with their Coverage and "used in N Rules", marks unused Objects, and shows members and covered Zones for one Object. "Show these Rules" filters the Rule base by it.
- The object picker searches all of them by name, address or port and says what an Object covers ("covers 3 Zones", "covers no Zone").

## German terms

Regelwerk (Rule base), Regel, Ordner (Folder), Zone, Objekt, Änderungspaket (Change set), Vorschau (Preview), Prüfen (Review), Einreichen (Submit), Freigabe (Approval), Vier-Augen, Betroffene Zonen (Affected Zones), Schreibreihenfolge (write order), Kreuzende Flüsse (Crossing flows), Notfall-Commit, Treffer (Hits), Quelle, Ziel, Dienst, Verantwortlich (owner), Ablauf (expiry), Ausgangsverhalten (Egress posture) with "Ziel entscheidet" and "strikt", Plattform-Ausnahmen, Intra-Zonen-Standard, Geerbte Standards, Deny-all-Regeln, Azure-Standardregeln. Commit stays Commit.

## The table component

AG Grid Community carries the Rule base at the design target; the fallback to TanStack Table is not needed. Measured in the prototype with 10,000 Rules and 20,000 Zones: first render in 100 to 240 ms, a filter in about 110 ms, smooth scrolling to the last Rule.

- Used from Community: row virtualisation, own row dragging including several rows, in-place editing where the grid only reports the new value, popup editors, checkbox selection, pinned and full-width rows (bands, Folder rows), flex columns, and the `cellContextMenu` event for an own context menu.
- Enterprise only and built by hand or left out: the built-in context menu, row grouping (Folders are full-width rows of an own flat list), set filters, range selection and clipboard, master/detail, Excel export.
- Rules for building it: give grid option objects and callbacks a stable identity and never redraw rows on a click, or the double click that starts editing is lost; never set `position` on a cell class; one grid theme serves both modes when every colour is a CSS variable that exists before the grid mounts.

## Access, audit, health and settings

Decided with the map owner in [Prototype: Access, audit, settings and health views][t38], 2026-11-10, over the same prototype, in two rounds of questions and two passes.

### One Admin entry

- The rail gets one more entry, Admin, with a sub-navigation: Setup, Access, Audit log, Health, Environments, Instance, Alert channel. Each part shows only to the Roles that may use it. Someone who may only read sees just the audit log, and the entry then reads "Audit". A red or amber dot on the entry reports Health.
- Access is for admins. Everybody else sees their own Roles in the avatar menu: sign-in time, when the session ends, and every Role with its Scope and where it comes from (direct, through a group, or the Entra app role `InstanceAdmin`).

### Access

- A Scope tree on the left: the instance, the Environments, their subscriptions, VNets and Zones. It searches by name, and children render only when opened, so 20,000 Zones stay fast. Each node shows how many Role assignments sit on it and the Approval level set there.
- The detail of one Scope shows its Approval level, its Role assignments and a check of one principal.
- Approval level: the effective level with what it means ("An approver of the Zone who is not an Author approves"), where it comes from (set here, or inherited from a Scope above), and a choice of inherit, none, approver or four-eyes. An admin of the Scope can raise it; lowering it needs an admin of a Scope above, and the choice says so where it is locked ([Grilling: Access, roles and audit][t19], point 13). The instance node holds the instance default, which only an instance admin changes. Scopes below that set their own level are listed.
- Role assignments: those on the Scope, and those inherited from above in grey, each with the principal (user, group, service principal or managed identity), the Role, where it is assigned, who assigned it and when. At the instance, the holders of `InstanceAdmin` show as maintained in Entra. Principals deleted in Entra and groups with hidden membership are flagged, because their assignments give nobody access. Only an admin of the Scope assigns or removes a Role there. Assigning picks the principal from Entra and one of the four Roles, each with one line on what it adds.
- "Check access" takes one principal and shows their Role in this Scope and where it comes from, or that they hold none here.
- A second tab lists every assignment flat, with chips for users, groups, service principals, managed identities, admin, deleted in Entra and hidden membership.

### Reading and missing Roles

- Under the read filter by Coverage ([ADR 0012](../adr/0012-access-follows-coverage.md)) Rule numbers stay global, so gaps show where Rules the person may not read sit, and Rule numbers mean the same for everyone. One line above the table says how many Rules the person sees ("You see 16 of 10,000 Rules: those that land on your Scopes"). Rules visible only because they decide traffic in an Affected Zone of the person's open Change set carry the flag "through your Change set". Folders follow [ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md).
- The Zone overview lists only the Zones in the person's Scopes, because limits and flags are the Azure side. Every Zone name stays in the object picker.
- A person without the editor Role in any Scope gets a read-only console: no New Rule, no Folder, no drag, no edit in place, no checkboxes, and "Read only" in the head.
- An editor sees what they may not do, with the reason. At the level none, Commit is locked when the editor Role is missing in an Affected Zone, and the commit bar names those Zones. Emergency Commit is locked when the admin Role is missing in an Affected Zone whose Approval is missing ([Grilling: Access, roles and audit][t19], points 8 and 11).
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
- People without a Role in the instance Scope see the problems in their own Scopes.

### Setup and settings

- Setup is a checklist for an instance admin that stays until every step is done or the admin hides it: sign in with `InstanceAdmin`, onboard the first Environment, check the Azure role assignments, choose the Approval level (the small profile offers none), set up the alert channel, switch on automatic Overwrite (proposed), assign Roles, the ingress (shown only), onboard the first Zones. Each step opens the normal settings page, so there is no second place for the same setting.
- Environments: a list with the Deployment mode, the Zones, the Approval level and the state of the Azure access check. One Environment shows the access check per role (`nsgfw Reader`, `nsgfw Writer`, `nsgfw ASG Writer`, the Reader on the flow-data workspace) with the missing actions, and "Show what to run" with the `environment-access` module call or a script, for the owner of the management group. Then "Overwrite automatically", limited to lost subnet associations and marker tags; `flushConnection`, off by default, with what off means; the naming and resource group patterns; the Terraform settings in Terraform mode; the flow-data workspace and the hits window. Only an admin of the Environment changes them; every change is audited.
- Adding an Environment (instance admins) is a wizard: name and Scope, Deployment mode (fixed afterwards), the role assignments to create with a check that must find the Reader, settings. A missing Writer lets the wizard go on and keeps Zones there from onboarding.
- The Review notes for each Environment with `flushConnection` off that a connection the Change set closes keeps running until it ends: revoked access does not end running sessions.
- Instance: the Internal address space as a list of prefixes. It belongs to the Rule base, so a change becomes an edit in the current Change set, resets its Approvals like any edit that is not a Folder edit, affects every destination-enforced Zone and needs their Approval. Next to it the Settle time, the Tool paths, the access contact, the ingress (shown only, because the `instance` module sets it and the tool cannot change its own ingress) and the identity facts.
- Alert channel: none, e-mail (SMTP, or Graph with Mail.Send scoped to one mailbox) or a webhook (Teams Workflows or generic JSON, the URL named as a Key Vault secret), with a test alert and the last deliveries.

### German terms for these views

Zugriff (Access), Audit-Log, Zustand (Health), Einrichtung (Setup), Umgebungen (Environments), Instanz, Alarmkanal (alert channel), Rollen Leser, Bearbeiter, Freigebender und Admin (viewer, editor, approver, admin; Freigebender is also the Approval level), Rollenzuweisung (Role assignment), Nur lesen (Read only), Anmeldung bestätigen (step-up), Interner Adressraum (Internal address space), Settle-Zeit, Kontakt für Zugriff (access contact).

## Not covered yet

- Zone detail with the Security layers, the Flow view, the ASG object editor and VNet bindings: [Prototype: Zone detail, Flow view and object editors][t35].
- The approver's view, conflicts after a Rebase, the Pre-check waiver, the Version history with Restore and Revert, the inbox in full: [Prototype: Change set review, conflicts and Version history][t36].
- Deployment and its history, Terraform pull request steps, Drift, onboarding and Import: [Prototype: Deployment, Drift and Import views][t37].

[t25]: https://github.com/mfgAkilae/nsgfw/issues/25
[t34]: https://github.com/mfgAkilae/nsgfw/issues/34
[t35]: https://github.com/mfgAkilae/nsgfw/issues/35
[t36]: https://github.com/mfgAkilae/nsgfw/issues/36
[t37]: https://github.com/mfgAkilae/nsgfw/issues/37
[t38]: https://github.com/mfgAkilae/nsgfw/issues/38
[proto]: https://github.com/mfgAkilae/nsgfw/tree/prototype/console-ui/prototypes/console-ui
[t19]: https://github.com/mfgAkilae/nsgfw/issues/19
