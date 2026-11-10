# PROTOTYPE: console UI (throwaway)

Answers part of [Prototype: Console UI](https://github.com/mfgAkilae/nsgfw/issues/25): how should the console look and behave for a firewall administrator who is not an Azure expert, and does AG Grid Community carry the Rule base table at the design target (10,000 Rules)?

This code is throwaway. It lives only on the branch `prototype/console-ui` and is never merged. Mock data only: no Translation engine, no backend, no persistence. The Preview and the write order are shaped like the real thing, but their numbers are made up.

## Run

```sh
cd prototypes/console-ui
pnpm install
pnpm dev          # http://localhost:5199/  (?theme=dark|light, ?lang=de)
```

## History

1. First pass: three structurally different shells (classic console, Change set workspace, Zone lens) on Fluent UI defaults. The map owner found the look too weak. Commit `00fa08b`.
2. Second pass: the same three shells with a new coat of paint. Still not good enough. Commit `2513ff4`.
3. Third pass (current): one console, redesigned from the layout up, in light and dark. It takes the best part of each shell: the classic Rule base as home, the live consequence of a Change set, and the Zone view as a lens on the Rule base. The three shells stay in the two commits above for comparison.

4. Fourth pass: overview and reach in the Rule base. An overview ruler beside the table marks where changed and flagged Rules sit among the 10,000 and jumps there on a click. A right click opens an own context menu. Flags are words in the meta line, not icons. A Zone picker in the head opens the lens, and the commit bar shows the workflow as a track. Commit `9d11e1b`.
5. Fifth pass: the other pages at the same level. Zones filter by chips with counts (flagged, near a limit, Drift, strict egress). Objects are a library with "used in N Rules", unused objects, members, Coverage and one click to the Rules that use an object. Change sets show what waits for you first, then every Change set on the workflow track. The write order is a diagram of the Crossing flows, and the side panel draws on which side a Rule lands in Azure.

6. Folders, at the map owner's request (see below). Commit `83f4fbe`.
7. Sixth design pass: the side panel becomes a Rule editor. Every field in one place, an inline object picker, where the Rule lands in Azure updating live, and "Before you submit" with what to fix. New Rule opens the editor with the name selected. Commit `21402d6`.
8. Seventh design pass: Review, the whole Change set on one wide screen before Submit (what was edited, one Rule before and after with what it writes in Azure, write order, Approval, Policy findings, the action). Also a keyboard help in the rail and the Version in the head.
9. Access, audit, settings and health ([issue 38](https://github.com/mfgAkilae/nsgfw/issues/38)), see the section below.

The map owner called the third pass clearly better and asked for two more, then for Folders and two further passes. The brief for the third pass: much better design, dark and light mode, clear and very pleasant to look at, functional, and as few clicks as possible to the main functions.

## Folders (new, not in the brief)

The map owner asked for Folders in the Rule base, to sort Rules into and to collapse, and decided on 2026-11-10:

- One level, no nesting.
- A Folder carries only its name.
- A Folder edit that changes no Managed NSG needs no Approval.

The prototype adds what follows from the order of Rules and from the Change set model:

- A Folder is a contiguous run of Rules, because the order decides (first match wins). Rules may stand outside Folders, between them.
- A Folder only organises. The Translation engine never sees it.
- Creating, renaming, removing a Folder and moving Rules in or out are edits in the Change set. A Change set that only does this shows "Nothing changes in Azure" and "No Approval needed", commits directly and starts no Deployment. A Rule that changes its position is a move like any other.
- Collapsing is a view setting of the person, not an edit.

In the table a Folder row shows its Rules, the allow and deny mix, and how many are changed or flagged. It renames in place (double click), moves with its Rules by the grip, and takes Rules by drop, from the selection bar ("Move to Folder…") or the context menu. A filter shows the matching Rules under their Folders ("44 of 801 Rules"); a sorted table has no Folders. With the Folders closed, 10,000 Rules fit on one screen.

Still open, for their own design ticket: where imported Rules land, how a Rebase treats two people who change the same Folder, and how a Version stores Folders.

## Access, audit, settings and health (issue 38)

Answers [Prototype: Access, audit, settings and health views](https://github.com/mfgAkilae/nsgfw/issues/38). Decided with the map owner before building, 2026-11-10:

- One rail entry, **Admin**, with a sub-navigation: Setup, Access, Audit log, Health, Environments, Instance, Alert channel. Each part shows only to the Roles that may use it. A person who may only read sees just the audit log, so the entry reads **Audit**. A red or amber dot on the entry reports Health.
- **Access** is a Scope tree (instance, Environments, subscriptions, VNets, Zones; searchable, children render only when open) with a detail per Scope: its Approval level (effective, where it comes from, set here or inherit), its Role assignments (direct, and inherited ones greyed), and "Check access" for one principal. A second tab lists every assignment flat, with chips for kind and for deleted and hidden-membership principals.
- **Rule numbers under the read filter** stay global: a viewer sees gaps (1, 4, 6) and one hint line: "You see 16 of 10,000 Rules: those that land on your Scopes." Rules visible only through the open Change set carry the flag "through your Change set". Folders follow ADR 0021: a Folder shows when it holds a readable Rule, an empty one always, and its count counts only readable Rules.
- **Missing Roles**: a person without the editor Role in any Scope gets a read-only console (no New Rule, no drag, no in-place edit, no checkboxes, a "Read only" mark in the head). An editor sees Commit and Emergency Commit locked, with the reason in the commit bar ("at the level none you need the editor Role in every Affected Zone. Missing in 3: …"). When the server refuses anyway, a dialog names the Role, the Scope and what the person holds, and says the attempt is in the audit log.
- **Step-up** asks only on click: a small lock marks the buttons that will ask (Approval, Emergency Commit, Role assignment changes); the dialog explains why, opens Entra, and the action continues afterwards with what was entered.
- **Health** is a strip with one status per check, then only the problems, grouped by what is missing (one missing action with its Zones, its effect and its fix).
- **Setup** is a checklist page for an instance admin that stays until every step is done; each step opens the normal settings page.

Decided after the first pass, 2026-11-10:

- German Role names: Leser, Bearbeiter, Freigebender (as the Approval level), Admin.
- The no-access page names an **access contact**, a new instance setting that an instance admin sets.
- Changing an **Approval level** also needs a sign-in from the last 15 minutes, like Approval, Emergency Commit and Role assignment changes.
- The **Zone overview** lists only the Zones in the person's Scopes; every Zone name stays available in the object picker.
- The **Access** page is for admins only; everybody else sees their own Roles in the avatar menu.

Built on top, for review:

- **Session**: the avatar opens "your access" (sign-in time, when the session ends, every Role with its Scope and where it comes from, sign in again, sign out). An idle warning five minutes before the 60-minute limit, a warning before the 8-hour end, and a signed-out screen that says nothing is lost because every edit is already in the Change set.
- **No access** page for a principal without a Role: who is signed in, the object ID to copy, a copyable access request, and the access contact.
- **Audit log**: chain status on top (intact, verified at, the accepted fork at a recovery entry; red when broken), chips per kind with counts, a Scope filter, a time range, text search, and a detail panel with Scopes, the hashes and the entry as exported. Automatic actions of the tool (removed ASG members, disabled expired Rules) carry the actor "nsgfw".
- **Environments**: the list with mode, Zones, Approval level and the state of the Azure access check; per Environment the access check with the missing actions and "Show what to run" (Terraform module or script), "Overwrite automatically" (lost subnet associations and marker tags only), `flushConnection` with what off means, patterns, Terraform settings, flow data. "Add Environment" is a wizard: Scope, Deployment mode, the role assignments to create with a check, settings.
- **Instance**: the Internal address space as prefixes; a change goes into the current Change set as an edit, touches every destination-enforced Zone and needs their Approval. Settle time, Tool paths, the access contact, ingress (shown only; Terraform sets it), identity facts.
- **Alert channel**: none, e-mail (SMTP or Graph) or webhook (Teams Workflows or generic JSON, URL as a Key Vault secret name), a test alert and the last deliveries.
- **Review** gets a note when `flushConnection` is off in an Environment the Change set changes: revoked access does not end running sessions.

Prototype controls (flask button) switch the persona (instance admin, Environment admin, approver, editor, viewer of one Zone, no Role), set the sign-in age, trigger the idle warning, the sign-out, the session end and a denied action, and switch to an on-premises runtime or a broken audit chain. URL parameters reach any state directly: `?page=admin&sec=access|audit|health|envs|instance|alert|setup`, `?as=ia|envadmin|approver|editor|viewer|none`.

Simplifications: the Change set's Approval still uses one level per Environment, so a level set on a VNet or Zone shows in Access but not yet in the commit bar. The persona switch keeps the Change set, so every persona is its Author. The Objects and Change sets pages are not filtered by Coverage yet.

## The design

**A Rule reads as a flow.** Every row is one sentence from left to right: source, arrow, destination, service, action. The row's left edge carries the action (green allow, red deny, hatched when disabled), so the eye can run down the edge of 10,000 Rules.

**Colour only means something.** Green is allow, red is deny or blocking, amber is pending or needs attention, iris is interaction. Everything else is neutral. This holds in both modes, which share one token set (`src/theme.tsx`).

**Shapes say what a thing is.** Pills filter, rounded rectangles are objects (with a glyph for the kind: Zone, VNet, host, network, service tag, ASG object, group), hatched bands are what sits above and below the Rules and cannot be edited (Platform exceptions, Intra-zone default, Inherited defaults, Deny-all rules, Azure default rules).

**Type.** Atkinson Hyperlegible Next for the interface, Atkinson Hyperlegible Mono for addresses, Rule IDs and NSG names (both OFL). The family is drawn to keep look-alike characters apart (0 and O, 1 and l), which matters in a console full of addresses where one misread character opens a port.

**Layout.** A dark rail (Rules, Zones, Objects, Change sets; inbox, mode, language), one sheet that holds the table, a side panel on demand, and a commit bar that appears with the first edit.

## Few clicks

| Goal | How | Clicks |
| --- | --- | --- |
| Find a Rule | Type in the filter (`/`), or jump with `Ctrl K` to a Rule name, number or ID | 0 to 1 |
| See only deny, disabled, expiring, flagged, unused or changed Rules | Filter chips with counts | 1 |
| Edit a field | Double-click the cell; source, destination and service open the object picker | 1 |
| Disable, clone or delete a Rule | Buttons that appear on the row | 1 |
| Do the same for many Rules | Tick them; the chip row becomes the action row | 1 |
| Reorder | Drag the handle (also several ticked Rules); "Move to…" for long distances | 1 |
| See everything about a Rule, and what it becomes in Azure | "Open details" on the row; after that one click per Rule | 1 |
| See what the pending edits mean | Nothing: the commit bar shows edits, Managed NSGs, write steps and Approvals | 0 |
| Review the Preview, write order, Approval or Policy findings | Click that part of the commit bar | 1 |
| Submit | "Submit for Approval" in the commit bar | 1 |
| See the Rules that land on one Zone | Zone picker in the head, or click the Zone on the Zones page, in the side panel or in `Ctrl K` | 1 |
| Anything about one Rule | Right click: details, disable, clone, new Rule below, move to top or bottom, delete | 2 |
| See the Rules that use an object | Right click the cell, "Rules with …"; or "Show these Rules" in the object library | 2 |
| Jump to the changed or flagged Rules far down the list | Click the mark in the overview ruler | 1 |
| See what waits for me | Change sets page, "Waiting for you" | 1 |
| See the whole Rule base at a glance | Close all Folders | 1 |
| Put Rules into a Folder | Drop them on it, or tick them and "Move to Folder…" | 1 to 2 |
| Create a Rule completely | New Rule, then the editor: name, objects, action, ticket | 1 |
| Check everything before Submit | "Review" in the commit bar | 1 |
| Switch light and dark, English and German | Rail | 1 |

Editing never asks to start a Change set first: an edit lands in the current Change set.

## What to judge

1. Does this design work, in light and in dark?
2. One console instead of three shells: the Zone view is a lens on the Rule base, the Preview lives in the commit bar and the side panel. Right call?
3. An edit continues the current Change set without asking. Right call?
4. The locked bands above and below the Rules, in the whole Rule base and per Zone. Keep both?
5. Rule cost appears in the side panel ("In Azure") and in the Preview, not as a table column. Enough?
6. German terms (proposals): Regelwerk, Regel, Änderungspaket, Vorschau, Freigabe, Betroffene Zonen, Schreibreihenfolge, Kreuzende Flüsse, Notfall-Commit, Treffer, Dienst, Verantwortlich, Ausgangsverhalten ("Ziel entscheidet" / "strikt"), Plattform-Ausnahmen, Intra-Zonen-Standard, Geerbte Standards.

## Scope

In: Rule base table (10,000 Rules, drag-and-drop, inline editing, filter, clone, disable, bulk actions), Zone lens, Change set list, pending changes with Preview, write order (ADR 0018) including "cannot be ordered", Approval per Affected Zone, Policy findings (rough), Emergency Commit (rough), inbox (rough), Zone overview with limits, candidates and flagged Zones (20,000 Zones), object picker with Azure service tags, English and German, light and dark.

Out (follow-up prototype tickets): Zone detail and Security layers, Flow view, ASG object editor, conflict resolution after a Rebase, Version history with Restore and Revert, Deployment and Drift views, Import, access, audit, settings and health.

The dashed flask button in the rail holds prototype-only controls: it forces Crossing flows or a Change set that cannot be ordered.

## AG Grid Community check (version 33.3.2)

Measured in headless Chromium on the dev machine, dev build:

- 10,000 Rules: first render 100–240 ms; quick filter about 110 ms per keystroke after the debounce; scrolling to Rule 10,000 is smooth. 20,000 Zones render without delay.
- Works in Community: row virtualisation, unmanaged row dragging including several selected rows, inline editing with `readOnlyEdit` (the grid reports the new value, the Change set store records the edit), popup cell editors (the object picker), checkbox selection, quick filter and external filter (the chips), pinned full-width rows (the bands), flex columns, row and cell class rules.
- The `cellContextMenu` event is in Community, so an own context menu works; only the built-in menu is Enterprise.
- Enterprise only, so not used: the built-in context menu (replaced by row buttons and an own menu), row grouping, set filters with value lists, range selection and clipboard, rich select editor, master/detail, Excel export.
- One grid theme serves light and dark when every Theming API colour is a CSS variable. Border parameters need an explicit style and width, and the variables must exist before the grid mounts, or the grid warns that it cannot measure its borders.
- Grid option objects and callbacks need a stable identity. If the console re-renders between two clicks with new option objects, the grid rebuilds its columns and swallows the double click that starts editing. The same holds for `redrawRows`: mark the focused row with a style rule instead.
- Never set `position` on a cell class: cells are absolutely positioned, and one relative cell pushes the rest of the row down.
- The current major is 36; the prototype pins 33.3.2. Check the changes before building.
