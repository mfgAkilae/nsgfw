---
title: "Design review outcome: the write-order decision is split into short decision records, and the map owner kept all five Rule checks in the MVP"
author: T3dev
date: 2026-11-12
branch: review/design-package
id: l-0a4b20a2
scope: repo
status: active
src: agent
touches:
  - docs/review/design-package-review.md
---

## Decided

The map owner decided all 46 points of the design-package review on 2026-11-12 (issue 23).

- The long decision record on the write order is superseded by three short ones (writes ordered by Crossing flows with a Settle time; ASG membership as atoms in member steps; the write order across Environments). A fourth takes what still holds from the superseded record on Tighten and Loosen. The algorithm lives only in the engine design doc.
- Four decisions that lived only in closed tickets got their own short records: Drift by Adopt or Overwrite, the Pre-check waiver, the Re-translation that approvers cannot reject, the Retired NSG.
- The glossary holds definitions only. Rules live in the decision record or design doc that already states them.
- All five Rule checks stay in the MVP (writes nothing, allows everything, management port from the Internet, very many Managed NSGs, unused Objects). The reviewer recommended three. Management ports and the NSG threshold are instance settings.
- A Change set that the tool prepares does not commit on its own at the Approval level none. Only the expiry of an allow Rule and the automatic Adopt cases stay automatic.
- A fourth Azure role reads the flow data, because Azure refuses a custom role with data actions at a management group.

## Tried and ruled out

- Tightening the long write-order record in place: fewer files, but the file name keeps stating the rejected rule (dominance gaps).
- Leaving it and fixing only stale pointers: least work, and the record stays unreadable.
- A validation error for an outbound deny on an Application Gateway v2 Zone: one such Zone would block every broad deny Rule. The engine leaves the deny out and warns.
- A new empirical check for private endpoint lag before the increment plan: the result changes a default value, not the design. Zones with a private endpoint wait 30 s until the nightly test has measured.
- The Reader role per subscription: a new subscription under the management group would not join on its own.
- Asking the map owner 46 decisions as one numbered chat list: rejected by the map owner. Decisions go through the question dialog, four per round, in plain language with a concrete case.

## Watch out

- Links to the old write-order record must go to the right successor: edges, cycles and Settle time to the first, membership to the second, anything across Environments to the third.
- The bundle questions summarised some points in one sentence. Details the dialog did not spell out are listed in the resolution of issue 23, so the map owner can object.

In the code: `docs/review/design-package-review.md` (report and outcome), `docs/adr/0022` to `0029`, `docs/adr/0018` and `0009` (superseded), `docs/research/` (research now on main), branch `review/design-package`.
