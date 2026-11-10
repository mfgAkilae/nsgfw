---
title: "Folders are layout: Import creates none, Folder edits keep Approvals, and moving a Folder moves its Rules"
author: MfgAkilae
date: 2026-11-10
branch: main
cost: { minutes: 1, tokens: 2422 }
id: l-ec874f00
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
---

## Decided
- The map owner decided on 2026-11-10 that Import creates no Folders. The constraint merge prefers, among the orders that fit, the lowest position outside every Folder. An imported Rule lands inside a Folder only when the constraints force it there, and an info Import note says so. An Author who puts an imported Rule into a Folder pins its position, like a move by hand.
- A Folder has a Folder ID like a Rule ID. Folder names are unique (case-insensitive), and a Folder may be empty. The Folder of a Rule is part of its position, not its content, so it never conflicts with a field edit of the same Rule.
- Folder edits without a Rule move keep a Change set's state and Approvals. A Folder-only Change set is an explicit exception to the instance default four-eyes: any editor commits it. Moving a Folder counts as a move of each of its Rules for the order check and for Affected Zones.
- Rebase: renaming, moving or removing the same Folder on both sides is a conflict. A Folder removed on one side while the other puts Rules into it rebases cleanly, and the Rules stay in place outside Folders. A placed Rule follows its Folder.
- Restore brings Folders back. Revert undoes Folder edits. Visibility and audit Scopes follow the Rules in the Folder. Folders ship in a later MVP stage after the small profile, because adding them later migrates nothing.

## Tried and ruled out
- One Folder per onboarded Zone from Import (the agent's recommendation): the map owner chose no Folders. The merge often splits a Zone's imported Rules across existing Rules, so a Zone Folder would not stay contiguous anyway.
- One Folder per onboarding Change set.
- A Folder's membership as an ordinary Rule field: tidying up Folders would then block every substantive edit of the same Rule and reset its Approvals.
- A narrower Approval for a Folder move (only Rules whose order changes against an overlapping Rule with the other action): it would break the rule from the earlier decisions that every move is an edit of the moved Rule.

## Watch out
- Rule renames still need Approval (no exemption for metadata), but Folder renames do not, because a Folder never reaches Azure. Do not "fix" this inconsistency.

In the code: GLOSSARY.md (Folder, Rebase, Restore, Revert); ticket mfgAkilae/nsgfw#34.
