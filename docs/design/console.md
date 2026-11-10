# Console

Status: confirmed by the map owner in [Prototype: Console UI][t25], 2026-11-10, after seven passes over a clickable prototype. It records how the console looks and behaves for the surfaces that prototype covers: the Rule base, Folders, the Change set from the first edit to Submit, the Zone overview and the object library. The prototype on the branch [`prototype/console-ui`][proto] is the primary source; it is throwaway code with mock data and is never merged. The surfaces it does not cover are listed under [Not covered yet](#not-covered-yet) with the ticket that holds each. Extended and confirmed on 2026-11-10 in [Prototype: Zone detail, Flow view and object editors][t35], in the same console: the Zone detail with the Security layers, the Flow view, the Zone settings, the object editor and the part of onboarding that ticket covers. [After Submit](#after-submit) adds what happens to a Change set once its author is done.

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

The table has the columns of the brief: number, name, source, destination, service, action, hits, comment. A row reads as a flow from left to right, and its left edge shows the action (hatched when the Rule is disabled). Under the name a second line carries the change marker, the flags, the Rule ID, the ticket and the owner. Hits show a number and a small bar, "—" where no flow data exists, "no access" where the Reader cannot query the flow data (never 0), and how old the data is.

- Platform exceptions, the Intra-zone default, Inherited defaults, the Deny-all rules and the Azure default rules are locked bands above and below the Rules, in the whole Rule base and per Zone.
- Filter chips: deny, disabled, expiring, with findings, no hits, layer warnings, changed. A text filter searches name, Objects, Rule ID, ticket and owner.
- The Zone view is a lens on the Rule base: it shows the Rules that land on one Zone's Managed NSG, inbound or outbound, in Rule base order with their numbers, with the Zone's limits and its own bands. It is the Rules tab of the [Zone detail](#zone-detail).
- An overview ruler beside the table marks where changed and flagged Rules sit among all Rules and jumps there on a click.
- One Rule: buttons on the row (details, disable, clone, delete) and a context menu on right click (the same, plus new Rule below, move to top or bottom, move to a Folder, and "Rules with this Object").
- Several Rules: ticking them turns the chip row into the action row.
- Order: drag by the handle, also several ticked Rules; "Move to…" for long distances. A filtered table still allows dragging and drops next to the visible neighbour. A sorted table does not.
- Cells edit in place on a double click; source, destination and service open the object picker.

### Rule editor

The side panel edits every field of one Rule: name, allow or deny, enabled, Folder, source, destination and service with an inline object picker, ticket, owner, expiry and comment. It shows where the Rule lands in Azure, as a source side and a destination side with the reason ("the destination decides", "strict Egress posture", "Deny Rules land on both sides"), and the number of Managed NSGs and NSG rules. This is where Rule cost is shown; it is not a table column. "Before you submit" lists what to fix: the Rule allows everything, opens a management port from the Internet, lands on very many Managed NSGs, or writes nothing. `any` covers every Zone, so the editor says that an any Rule lands on every Managed NSG. A Rule warning from a Security layer shows its severity and the admin rule or NIC-level NSG behind it. The name of an Object opens it in the [object editor](#objects).

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

## After Submit

Decided with the map owner in [Prototype: Change set review, conflicts and Version history][t36], 2026-11-10, over the same prototype.

### The approver's view

- An approver decides on the Review screen, the same wide screen the author uses before Submit. A Change set opened from the inbox or the Change sets page shows there, and the right column then starts with "Your decision": every Environment with its Affected Zones, their Approval level and their status (approved by whom, covered by your Approval, needs another approver, you are an Author under four-eyes, not required). Each Environment opens to the list of its Zones.
- One Approve covers every Affected Zone in which the approver holds the approver Role ([ADR 0008](../adr/0008-approval-by-affected-zones.md)), so there is no Approve per Zone. Approve asks for a sign-in that is at most 15 minutes old. Reject needs a comment, returns the Change set to Open and clears its Approvals; its Authors get the comment in their inbox.
- When an earlier Approval was given against an older Preview, because a clean Rebase came since, a banner says so. "Show what changed" lists the NSG rules that differ between the Preview that approver saw and the fresh one. The Approval stays.
- An Emergency Commit opens the same way, with its reason in a banner. "Approve afterwards" closes it. Reject makes the tool prepare a Revert of that Version for normal Approval, which lands in the inbox.
- The tool commits a Change set it prepared (a Revert after a rejected Emergency Commit, a Re-translation) once its Approval is complete.

### Conflicts after a Rebase

- When another Commit leaves conflicts, the commit bar shows "N conflicts after the Rebase" in red, the inbox has an entry, and Submit and Commit stay blocked until every conflict is resolved.
- The Rebase screen is as wide as Review. Left: the conflicts (Rule, Object, Zone, position, Folder) and what rebased cleanly, such as a removed Folder whose Rules now stand outside every Folder. Middle: one conflict. Right: what happens to the Approvals and to the Affected Zones.
- A Rule conflict shows base, theirs (the newer Version and its committer) and yours side by side, with the changed cells marked. The Author takes theirs, keeps their own Rule as a whole, or starts from theirs and applies the own change again; a result column shows the outcome. Fields never merge one by one.
- A position conflict shows the rebased Rule base around the Rule twice: once with the Rule above the overlapping Rule with the other action, once below it, each with what that order means for the traffic. The Author picks one.
- A Folder conflict shows the names on both sides; the Author takes one of them or types another.
- A resolution that moves no Rule keeps the Approvals; a resolved Rule or position conflict resets them ([ADR 0007](../adr/0007-isolated-change-sets-with-optimistic-rebase.md), [ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)). The screen names the Affected Zones that are new after the Rebase and need their own Approval.

### Policy findings and Pre-check waivers

- The pre-check runs at Submit, on demand, when the Emergency Commit dialog opens and before every Deployment, not on every edit. The Policy findings section says when it last ran and whether the Change set changed since. A deny finding stops Submit and opens the section.
- The section lists the deny findings that block Submit and Commit first, then the waived ones, then information (audit and modify, which never block). Deny findings that Azure does not enforce here fold away below, marked "not enforced" (enforcement mode or `notScopes`) or "exempt" (with the exemption and its end date).
- Each finding names the assignment and where it is assigned, its message, the Managed NSG, Zone and Environment, and the Rule ("Rule X violates it on Zone Z"), or the resource where no Rule maps.
- After a run, the Rule editor lists its Rule's findings under "Before you submit".
- "Waive…" on a blocking finding (admins only) opens the Pre-check waiver dialog: the finding, the resource, the Change set, what a waiver does, and a mandatory reason. A waived finding shows who waived it and why, and the waiver can be withdrawn.

### Commit

- Commit always opens a short dialog. It shows what goes out per Environment (written directly in ARM mode, one pull request per write step in Terraform mode, or no Deployment when no Managed NSG changes); when (now, or at a date and time in the Instance's time zone); the Approvals with who gave them and when; what changed since the Approval (Preview differences after a clean Rebase, and the Folder edits made since); the Pre-check waivers in force; and, when the Change set closes a Tool path, the paths with a mandatory reason. Submit asks for that reason too.
- A scheduled Commit shows in the commit bar with Move and Cancel. An edit that reopens the Change set clears the schedule. A Folder edit keeps it, as it keeps the Approvals.
- While a Re-translation is open in an Environment that the Change set changes, the dialog says so and offers "Commit after the Re-translation". The Commit then waits in line and runs right after the Re-translation commits, with a Rebase, validation and the pre-check, like a scheduled Commit. If one of them fails, the Change set stays Approved.
- The commit bar flags "Closes a Tool path" and "Commit waits for the Re-translation".

### Emergency Commit dialog

- A mandatory reason, and a fresh sign-in before it runs.
- The dialog runs the pre-check when it opens. Each blocking deny finding has its own checkbox to waive it, with a reason prefilled from the Emergency Commit's reason and open to change; the Commit stays disabled until every one is waived. Each waiver is its own audit entry.
- A Tool path that closes needs a reason of its own, prefilled the same way. Managed NSGs with Drift offer "Overwrite the Drift"; without it the Deployment stops before its first write in those Environments. An open Re-translation goes out with the Emergency Commit, and the dialog says that its Affected Zones then need Approval afterwards.

### Re-translation

- It opens on the Review screen: the engine upgrade and what holds while it is open on the left, the NSG rules that change in the middle, the decision on the right. It holds no edits, and an approver cannot reject it: an approver who disagrees asks the operator to go back to the previous image. Once its Approval is complete, the tool commits it, and the Commits that wait for it run.

### Version history

- "Versions" is a page in the rail. It lists every Version with its number, Change set, committer (or the tool) and time, marks for Emergency Commit (and "Approval afterwards open"), scheduled, expiry, Re-translation, Restore, Revert and only Folders, and one dot per Environment for its Deployment (deployed, failed, running, not affected). Chips filter Emergency Commits, scheduled Commits, Commits by the tool, Restore and Revert, and only Folders; a search finds a Version, a Change set or a person.
- The detail shows the reason of an Emergency Commit, the Deployment per Environment, the Approvals, and what the Commit changed, Rules and Folder edits. Its actions are "Revert this Commit", "Restore to this Version" (not on the latest Version) and "Export JSON". The Deployment view of a Version belongs to [Prototype: Deployment, Drift and Import views][t37].
- Revert and Restore open a new Change set on the Review screen, with a banner that says what it undoes or brings back, including the Folders a Restore removes or renames. One that differs only in Folders needs no Approval. A Re-translation cannot be reverted, because it holds no edits.
- When a Revert cannot bring a removed Folder back as it was, because its former Rules no longer stand together, the Author chooses: bring the Folder back around the Rules that still stand together and in no other Folder, or leave it removed. Neither moves a Rule.

### Inbox

- The bell in the rail carries the count and leads to the Change sets page, which opens with "Waiting for you". Chips filter by kind: Approval requests, Emergency Commits, conflicts, rejections, expiring Rules and Re-translation. Each row has one action: Review, Resolve, Open or Show Rules.
- The list of all Change sets below shows how many Versions each one is behind and opens each on the Review screen.

### The small profile

- Folders ship after the small profile ([ADR 0021](../adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md)). Until then the table, the Rule editor, the list of edits, the Rebase screen, the Commit dialog and the Versions page show nothing about Folders; nothing else changes.

## Zone detail

The Zone lens is the Zone detail. The Zone picker, the Zones page, the jump palette and every "open Zone" link open it. Its head shows the prefixes and Extra prefixes, VNet, Environment, Egress posture and flags (with "AVNM: n rules" and "NIC NSGs: n"), the limits, a switch between inbound and outbound, and three tabs: Rules, Flows and Settings. Rejected: a separate Zone page beside the lens, and a Zone tab in the side panel.

### Security layers

The Rules tab shows the whole evaluation order of the Zone in one direction. The Security layers sit in it as locked bands, closed by default, and each opens into its rules, read-only:

- Inbound: AVNM security admin rules, Platform exceptions, the Rules, Intra-zone default, Inherited defaults, Deny-all rules, Azure default rules, NIC-level NSGs.
- Outbound: AVNM security admin rules, NIC-level NSGs, Platform exceptions, the Rules, Intra-zone default, Inherited defaults, Egress posture, Deny-all rules, Azure default rules. Microsoft documents the NIC-level NSG before the subnet NSG outbound ([Grilling: Policy and security-layer visibility][t21]).
- AVNM security user rules come last, in a band of their own that says Microsoft does not document where they sit. They raise no Rule warnings.
- The AVNM band names the network manager and the network groups. Each admin rule shows priority, action (Allow, Deny, AlwaysAllow), source, destination, service, and what it does to Rules, with the severity. Where admin rules do not apply to the subnet (Application Gateway, Bastion, Azure Firewall, Route Server, gateways), the band says so.
- The NIC-level NSG band lists each NSG with the interfaces it sits on ("on 5 of 12 interfaces") and its rules, the Azure default rules among them marked as such.

Rule warnings from Security layers are worded tags whose colour is the severity: "bypassed by AVNM" (a deny Rule that an AlwaysAllow admin rule skips) is high and red; "blocked by AVNM" and "blocked on 3 of 12 interfaces in app0042-web" are medium and amber. The chip "Layer warnings" filters them. Rejected: a separate Security layers tab with a stack diagram, because the bands show the same order where the Rules are.

### Flow view

The Flows tab lists the flows that the Zone's Managed NSG or one of its Security layers decided, in the chosen direction. A row is one aggregated flow as `NTANetAnalytics` delivers it: source, destination (the Zone itself reads "this Zone"), service, allowed or denied, the number of flows with a bar, when it was last seen, and what decided it. That is a Rule (number and name, one click to it in the Rules tab), a band (Platform exceptions, Intra-zone default, Inherited defaults with its part, Egress posture, Deny-all rules), an AVNM admin rule, or a NIC-level NSG with its rule and interfaces. Rejected: grouping the flows under their Rules.

- Chips: allowed, denied, by a Rule, by Inherited defaults, by the Egress posture (outbound), by the Deny-all rules, by a Security layer. A text filter takes an address, a Zone or a port. The window is 24 hours, 7 days or 30 days, the hits window; 24 hours is the default.
- The head says how old the newest flow is and that Traffic Analytics processes every 60 minutes, with ingestion taking up to another hour. A band says the data is incomplete: ICMP is never logged, and denied flows are missing where the flow log filters them out ([Research: Traffic Analytics access for the Flow view and hits][t28]).
- No flow data: the tab names the VNet that no VNet flow log with Traffic Analytics covers and links to the instructions. The hits column shows "—".
- No access to flow data: the tab names the actions missing on the workspace. The hits column and the Rule editor show "no access" instead of 0.
- New Rule from a flow, beyond the brief: on a flow that a band decided (Inherited defaults, Egress posture, Deny-all rules), one click creates an allow Rule with the flow's source, destination and service, at the end of the Rule base and outside every Folder, so every deny Rule above it still wins. The editor opens with the name selected, and the comment names the flow. An Internet address becomes a new host Address object in the same Change set. A flow that a Security layer decided says "outside the tool", because no Rule changes it.

### Zone settings

Every setting in the Settings tab is an edit in the current Change set, marked "in your Change set".

- Egress posture: the two choices with what each means, the committed one marked. Before switching to strict, the tab lists the outbound flows of the last 30 days that only the open posture let out, each with New Rule, and says how many allow Rules with the Zone as source then also land on its Managed NSG. Switching back to destination decides says that it opens traffic and needs Approval.
- Inherited defaults: the three parts as switches, each with the number of flows of the last 30 days that relied on it. Switching a part off lists those flows, each with New Rule.
- Extra prefixes: add and remove, with checks. Not a prefix, or already in the subnet: blocked. Overlaps the subnet of another Zone: a warning, not a block, because a load balancer frontend in that subnet is a legitimate Extra prefix; Address objects that overlap it then cover both Zones, and the Intra-zone default counts these addresses as the Zone's own ([ADR 0017](../adr/0017-extra-prefixes-and-vnet-bindings.md) as amended). Also an Extra prefix of other Zones: allowed, with the note that a Rule between these Zones also allows each Zone's own copy of the range.
- DNS: the custom DNS servers of the VNet and where they sit, and the Rule that allows DNS from the Zone to them, or "Add the DNS Rule". Azure-provided DNS at 168.63.129.16 needs no Rule, because NSGs do not filter it ([Research: Special subnets and mandatory platform rules][t3]).
- Managed NSG: name, resource group, subscription, region, Environment with its Deployment mode and Approval level, and the NSG rules against the limit.

## Zones and onboarding

- The Zone overview is a table of every Zone with its Managed NSG's use of each limit (NSG rules, source and destination addresses, ASGs), the Egress posture and its flags. Chips filter it: flagged, near a limit, Drift, Policy finding, missing permission, Import notes, strict egress, Inherited defaults, Security layers. A click on a Zone opens the Zone detail.
- A second tab lists candidates. A click on one opens a side sheet. A subnet that is not onboardable shows the reason and the evidence it was detected from: Azure forbids an NSG on it, a service maintains its NSG rules (SQL Managed Instance, Azure Databricks), a named network interface has IP forwarding enabled, AKS maintains its NSG (its managed resource group), or it holds nsgfw itself. The sheet says that it stays usable as a subnet Address object.
- Onboarding covers here the existing NSG (adopted in place, or a new Managed NSG swapped in for a shared one), the Egress posture (destination decides by default), and the proposed Rules. For a VNet with custom DNS servers that is the DNS Rule (the Zone to the servers, UDP 53 and TCP 53, allow), ticked by default, with where it lands, or that it writes nothing today and keeps name resolution working when the Zone turns strict. It lands in the current Change set. Import and the rest of onboarding belong to [Prototype: Deployment, Drift and Import views][t37].

## Objects

- The object library lists Zones, addresses, service tags, VNets, ASG objects, groups and Service objects with their Coverage and "used in N Rules", marks unused Objects, and shows members and covered Zones for one Object. "Show these Rules" filters the Rule base by it.
- One object editor serves two places: the detail of the object library, and the Object tab of the side panel, which opens from an Object in the Rule editor. Edits land in the current Change set, and the Coverage shows the difference to the committed Version. Rejected: editing only in the library, and editing only in the side panel.
- ASG objects: one search over VMs, network interfaces and private endpoints by name, IP or Zone. A VM brings its network interfaces, each of which can be unticked. Members are grouped by VNet, which is the Managed ASG they land in, named by the Environment's pattern; NSGs in other VNets get the members' IPs ([ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md)). Scale-set interfaces cannot be picked; an External ASG object covers them. Without the optional role nsgfw ASG Writer in an Environment, members there block Submit, and the ASG limits block the Change set: 20 ASGs per IP configuration, 100 ASGs across the rules of one NSG, 4,000 IP configurations per ASG ([Research: NSG and ASG rule semantics and limits][t2]). Rejected: browsing a tree of Zones, VMs and interfaces.
- External ASG objects: the Unmanaged ASG with its resource group, VNet and owner, its members read-only, and another Unmanaged ASG to pick. Without automatic adoption, new members wait in a Change set that the tool prepared for Approval.
- "Adopt member changes automatically", on ASG objects and External ASG objects, says what it covers, that a deleted member and a changed member IP are adopted in any case, and that switching it on needs the Approval of the Zones the Object covers.
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

## Not covered yet

- Deployment and its history, Terraform pull request steps, Drift, onboarding and Import: [Prototype: Deployment, Drift and Import views][t37].
- Roles, the audit log, sign-in edges, health and settings: [Prototype: Access, audit, settings and health views][t38].

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
