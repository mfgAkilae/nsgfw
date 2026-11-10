# PROTOTYPE: console UI (throwaway)

Answers part of [Prototype: Console UI](https://github.com/mfgAkilae/nsgfw/issues/25): how should the console look and behave for a firewall administrator who is not an Azure expert, and does AG Grid Community carry the Rule base table at the design target (10,000 Rules)?

Three structurally different console variants on one page, switchable via `?variant=A|B|C` (also `&lang=de`), with the floating bar at the bottom or the ← → keys. Edits survive a variant switch, so you can compare the same Change set in all three.

This code is throwaway. It lives only on the branch `prototype/console-ui` and is never merged. Mock data only: no Translation engine, no backend, no persistence. The Preview and the write order are shaped like the real thing, but their numbers are made up.

## Run

```sh
cd prototypes/console-ui
pnpm install
pnpm dev          # http://localhost:5199/?variant=A
```

## Scope of this session

In: Rule base table (10,000 Rules, drag-and-drop, inline editing, search, clone, disable, bulk actions), Change set list with states, pending changes with Preview (priority-only changes grouped, Rule cost), write order (ADR 0018) including "cannot be ordered", Approval per Affected Zone, Policy findings (rough), Emergency Commit (rough), inbox (rough), Zone overview with limits, candidates and flagged Zones (20,000 Zones), object picker with Azure service tags, English and German.

Out (follow-up prototype tickets): Zone detail and Security layers, Flow view, ASG object editor, conflict resolution after a Rebase, Version history with Restore and Revert, Deployment and Drift views, Import, access, audit, settings and health.

## Variants

| Key | Name | Structure | Edit model | Where the Preview lives | System rows |
| --- | --- | --- | --- | --- | --- |
| A | Classic console | Left navigation, full-width Rule base, optional Object library side panel | You edit, the edits land in the current Change set (selector in the header) | "Commit…" button with counter opens a large drawer with tabs | Pinned above and below the 10,000 Rules |
| B | Change set workspace | Left: your Change sets and the others; centre: Rule base with stepper Edit → Submit → Approval → Commit; right: live Preview | Read-only until you start a Change set; "only changed" filter; Rule cost column | Always visible on the right, updates on every edit | None in the global table |
| C | Zone lens | Left: Zone navigator by VNet; centre: the effective rule set of one Zone's Managed NSG (inbound/outbound), in Rule base order with global numbers | Edit the Rules that land on this Zone; "All Rules" tab for the whole Rule base | Bottom panel scoped to this Zone's NSG, plus the whole Preview | Per Zone: Platform exceptions, Intra-zone default, Inherited defaults, Egress posture, Deny-all, Azure default rules |

The bar's "scenario" switch forces Crossing flows or a Change set that cannot be ordered, so you can see those states without constructing them.

## Visual design (second pass)

The first pass used Fluent defaults and looked generic. The second pass gives the console its own visual identity, the "rule ledger":

- Colour carries meaning only. A coloured edge on every row shows its action (green allow, red deny, hatched when disabled). Change states (new, edited, moved, deleted) show as small markers next to the number, and edited cells get an amber tint. Cobalt is reserved for interaction.
- Objects are quiet tokens with a glyph for their kind (Zone, VNet, host, network, service tag, ASG object, group). The red token for "any" is the only loud one, because it is the risky one.
- Platform exceptions, Intra-zone default, Inherited defaults, Deny-all rules and Azure default rules are locked boundary bands above and below the Rules, not greyed-out rows.
- One type family, Recursive (OFL): its sans style for the interface, its mono style for addresses, Rule IDs and NSG names.
- One dark surface (the header), hairline lists instead of boxed cards, and the write order drawn as a numbered sequence because it is one.

## What to judge

1. Which shell, or which mix (for example A's navigation with C's effective rule set as the Zone detail and B's "only changed" filter)?
2. Edit model: may an edit start or continue a Change set implicitly (A), or must the administrator start one first (B)?
3. System rows: show Platform exceptions, Intra-zone default, Inherited defaults, Deny-all rules and Azure default rules in the global Rule base (A), or only per Zone (C)?
4. Preview: per Managed NSG with renumbering collapsed into one line; is Rule cost a column in the table (B) or only in the Preview?
5. Drag-and-drop: works in filtered views and drops next to the visible neighbour; off while sorted; "Move to…" for long distances.
6. German terms (proposals): Regelwerk, Regel, Änderungspaket, Vorschau, Freigabe, Vier-Augen, Betroffene Zonen, Schreibreihenfolge, Kreuzende Flüsse, Notfall-Commit, Treffer, Dienst, Verantwortlich, Ausgangsverhalten ("Ziel entscheidet" / "strikt"), Plattform-Ausnahmen, Intra-Zonen-Standard, Geerbte Standards.

## AG Grid Community check (version 33.3.2)

Measured in headless Chromium on the dev machine, dev build:

- 10,000 Rules: first render 100–240 ms; quick filter about 110 ms per keystroke after a 200 ms debounce; scrolling to Rule 10,000 is smooth. 20,000 Zones in the Zone overview render without delay.
- Works in Community: row virtualisation, unmanaged row dragging including several selected rows (the Change set store decides the move), inline editing with `readOnlyEdit` (the grid reports the new value, the store records the edit), popup cell editors (the object picker), checkbox selection with bulk actions, quick filter across rendered names, pinned top and bottom rows with `colSpan` for system rows, row and cell class rules for added, changed, moved, deleted and disabled.
- Enterprise only, so not used: right-click context menu (replaced by a row "…" menu and the toolbar), row grouping (sections or Zone pairs would need full-width rows or own logic), set filters with value lists per column, range selection and clipboard, rich select editor, master/detail (expandable NSG rules under a Rule), Excel export.
- The current major is 36; the prototype pins 33.3.2. Check the changes before building.
